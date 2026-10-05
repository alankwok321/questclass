'use strict';
// Codex via "Sign in with ChatGPT" (device code, as in the pi agent), against fake OpenAI endpoints.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/server-harness.cjs');

const app = h.loadServer();
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload) => `${b64({ alg: 'none' })}.${b64(payload)}.sig`;
const ACCESS = jwt({ 'https://api.openai.com/auth': { chatgpt_account_id: 'acc_123' } });
const ACCESS2 = jwt({ 'https://api.openai.com/auth': { chatgpt_account_id: 'acc_123' }, v: 2 });
const ID_TOKEN = jwt({ email: 'teacher@gmail.com' });

let deviceReady;
let refreshCalls;
function fakeOpenAI() {
  deviceReady = false;
  refreshCalls = 0;
  h.ai.responder = (call) => {
    if (call.url.endsWith('/deviceauth/usercode')) return { status: 200, body: { device_auth_id: 'dev_1', user_code: 'ABCD-1234', interval: '5' } };
    if (call.url.endsWith('/deviceauth/token')) {
      return deviceReady ? { status: 200, body: { authorization_code: 'code_1', code_verifier: 'ver_1' } } : { status: 403, body: {} };
    }
    if (call.url === 'https://auth.openai.com/oauth/token') {
      if (String(call.body).includes('grant_type=refresh_token')) {
        refreshCalls += 1;
        return { status: 200, body: { access_token: ACCESS2, refresh_token: 'refresh_2', expires_in: 3600 } };
      }
      return { status: 200, body: { access_token: ACCESS, refresh_token: 'refresh_1', id_token: ID_TOKEN, expires_in: 3600 } };
    }
    if (call.url === 'https://chatgpt.com/backend-api/codex/responses') {
      return { status: 200, body: [
        'event: response.output_text.delta',
        'data: {"type":"response.output_text.delta","delta":"你"}',
        '',
        'data: {"type":"response.output_text.delta","delta":"好"}',
        '',
        'data: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"你好"}]}]}}',
        '',
      ].join('\n') };
    }
    return { status: 200, body: { choices: [{ message: { content: 'api-key reply' } }] } };
  };
}

beforeEach(() => {
  h.resetAll();
  h.setEnv({ ...h.FIREBASE_ON, AI_CONFIG_ENCRYPTION_KEY: 'enc-key' });
  h.seedUsers();
  for (const u of Object.values(h.fbState.data.users)) u.schoolId = 'a';
  h.fbState.data.schools = { a: { name: 'A' } };
  fakeOpenAI();
});
const post = (path, body) => h.post(app, '/api/admin/ai-settings/' + path, body);
const secrets = () => h.fbState.data.schoolSecrets?.a || {};

async function signIn() {
  await post('chatgpt/start', { idToken: 'adm' });
  deviceReady = true;
  return post('chatgpt/poll', { idToken: 'adm' });
}

test('only admins can sign in to ChatGPT for the school', async () => {
  for (const who of ['tea', 'stu', 'par']) assert.equal((await post('chatgpt/start', { idToken: who })).status, 403, who);
  assert.equal(h.ai.calls.length, 0);
});

test('start gives a code to enter on OpenAI\'s page; poll waits until it is entered', async () => {
  const r = await post('chatgpt/start', { idToken: 'adm' });
  assert.equal(r.status, 200);
  assert.equal(r.body.userCode, 'ABCD-1234');
  assert.equal(r.body.verificationUri, 'https://auth.openai.com/codex/device');
  assert.equal(h.ai.last.body.client_id, 'app_EMoamEEZ73f0CkXaXp7hrann');
  assert.equal((await post('chatgpt/poll', { idToken: 'adm' })).body.status, 'pending');
  assert.equal(secrets().chatgpt, undefined);
});

test('after sign-in the school uses Codex on that subscription; tokens are stored encrypted', async () => {
  h.fbState.data.schoolSecrets = { a: { provider: { mode: 'apikey', apiBaseUrl: 'https://api.openai.com/v1', model: 'gpt-5-mini' } } };
  const r = await signIn();
  assert.equal(r.body.status, 'connected');
  assert.equal(r.body.email, 'teacher@gmail.com');
  const tokenCall = h.ai.calls.find((c) => c.url === 'https://auth.openai.com/oauth/token');
  assert.match(String(tokenCall.body), /grant_type=authorization_code/);
  assert.match(String(tokenCall.body), /code_verifier=ver_1/);
  const s = secrets();
  assert.ok(s.chatgpt.secret.ciphertext);
  assert.ok(!JSON.stringify(s).includes(ACCESS) && !JSON.stringify(s).includes('refresh_1'), 'tokens not stored in plain text');
  assert.equal(s.chatgptPending, undefined);
  assert.deepEqual(s.provider, { mode: 'chatgpt', apiBaseUrl: 'https://chatgpt.com/backend-api', model: 'gpt-5.5' });
  assert.equal(s.apiKeyProvider.apiBaseUrl, 'https://api.openai.com/v1', 'remembers the API-key setup');
  const g = await post('get', { idToken: 'adm' });
  assert.equal(g.body.mode, 'chatgpt');
  assert.deepEqual(g.body.chatgpt.connected, true);
  assert.equal(g.body.chatgpt.email, 'teacher@gmail.com');
  assert.ok(!JSON.stringify(g.body).includes(ACCESS));
});

test('chat runs through the Codex backend with the account header and joins the streamed text', async () => {
  await signIn();
  const r = await h.post(app, '/api/chat', { idToken: 'stu', message: 'hi', history: [{ role: 'assistant', content: 'earlier' }] });
  assert.equal(r.status, 200);
  assert.equal(r.body.reply, '你好');
  const c = h.ai.last;
  assert.equal(c.url, 'https://chatgpt.com/backend-api/codex/responses');
  assert.equal(c.headers.Authorization, 'Bearer ' + ACCESS);
  assert.equal(c.headers['chatgpt-account-id'], 'acc_123');
  assert.equal(c.body.model, 'gpt-5.5');
  assert.equal(c.body.stream, true);
  assert.equal(c.body.store, false);
  assert.deepEqual(c.body.input[0], { role: 'assistant', content: [{ type: 'output_text', text: 'earlier' }] });
  assert.equal(c.body.input.at(-1).content[0].type, 'input_text');
});

test('an expiring token is refreshed (and saved) before the request', async () => {
  await signIn();
  // Make the stored token look expired: re-encrypt with an old expiry through a fresh sign-in shape.
  const crypto = require('crypto');
  const key = crypto.createHash('sha256').update('enc-key').digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plain = JSON.stringify({ access: ACCESS, refresh: 'refresh_1', expires: Date.now() - 1000, accountId: 'acc_123' });
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  h.fbState.data.schoolSecrets.a.chatgpt.secret = { ciphertext: enc.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
  const r = await h.post(app, '/api/chat', { idToken: 'stu', message: 'hi' });
  assert.equal(r.status, 200);
  assert.equal(refreshCalls, 1);
  assert.equal(h.ai.last.headers.Authorization, 'Bearer ' + ACCESS2);
  await h.post(app, '/api/chat', { idToken: 'stu', message: 'again' });
  assert.equal(refreshCalls, 1, 'the refreshed token was saved');
});

test('Codex models list and one-tap switching on the subscription', async () => {
  assert.equal((await post('models', { idToken: 'adm', mode: 'chatgpt' })).status, 400, 'needs sign-in first');
  await signIn();
  const m = await post('models', { idToken: 'adm', mode: 'chatgpt' });
  assert.ok(m.body.models.some((x) => x.id === 'gpt-5.5'));
  assert.equal((await post('save', { idToken: 'adm', mode: 'chatgpt', model: 'gpt-6-sol' })).status, 200);
  assert.equal(secrets().provider.model, 'gpt-6-sol');
  assert.deepEqual(secrets().recentModels.slice(0, 1), ['gpt-6-sol']);
});

test('the OpenAI API key is kept: switch back without re-entering it; sign-out returns to it', async () => {
  await post('save', { idToken: 'adm', apiBaseUrl: 'https://api.openai.com/v1', apiKey: 'sk-openai-123456', model: 'gpt-5-mini' });
  await signIn();
  // Back to the API key (no key typed): uses the saved one.
  assert.equal((await post('save', { idToken: 'adm', apiBaseUrl: 'https://api.openai.com/v1', model: 'gpt-5-mini' })).status, 200);
  await h.post(app, '/api/chat', { idToken: 'stu', message: 'hi' });
  assert.equal(h.ai.last.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(h.ai.last.headers.Authorization, 'Bearer sk-openai-123456');
  // On Codex again, then sign out: back to the API key setup.
  await post('save', { idToken: 'adm', mode: 'chatgpt', model: 'gpt-5.5' });
  assert.equal((await post('chatgpt/disconnect', { idToken: 'adm' })).status, 200);
  assert.equal(secrets().chatgpt, undefined);
  assert.equal(secrets().provider.apiBaseUrl, 'https://api.openai.com/v1');
  await h.post(app, '/api/chat', { idToken: 'stu', message: 'hi' });
  assert.equal(h.ai.last.headers.Authorization, 'Bearer sk-openai-123456');
});

test('saving Codex mode without signing in is refused', async () => {
  assert.equal((await post('save', { idToken: 'adm', mode: 'chatgpt', model: 'gpt-5.5' })).status, 400);
});
