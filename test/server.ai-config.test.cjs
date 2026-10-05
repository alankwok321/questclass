'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/server-harness.cjs');

const app = h.loadServer();
beforeEach(() => {
  h.resetAll();
  // The made-up provider hosts used below must be allow-listed, like a school's own AI gateway would be.
  h.setEnv({ ...h.FIREBASE_ON, AI_CONFIG_ENCRYPTION_KEY: 'enc-key-for-tests', OPENROUTER_API_KEY: 'sk-server', AI_ALLOWED_HOSTS: 'x.example,school-llm.example' });
  h.seedUsers();
  // Everyone below belongs to school A, except adm2 (school B).
  for (const u of Object.values(h.fbState.data.users)) u.schoolId = 'sch_a';
  h.seedUsers({ adm2: { email: 'adm2@other.hk', role: 'admin', schoolId: 'sch_b' }, stuB: { email: 'stub@other.hk', role: 'student', schoolId: 'sch_b' } });
  for (const [uid, sch] of Object.entries({ stu: 'sch_a', stu2: 'sch_a', tea: 'sch_a', adm: 'sch_a', par: 'sch_a', sus: 'sch_a' })) h.fbState.data.users[uid].schoolId = sch;
});
const getS = (body) => h.post(app, '/api/admin/ai-settings/get', body);
const saveS = (body) => h.post(app, '/api/admin/ai-settings/save', body);
const testS = (body) => h.post(app, '/api/admin/ai-settings/test', body);
const stored = (school = 'sch_a') => h.fbState.data.schoolSecrets?.[school];

test('the old per-user /api/ai-config endpoints are gone', () => {
  assert.equal(app.routes['POST /api/ai-config/get'], undefined);
  assert.equal(app.routes['POST /api/ai-config/upsert'], undefined);
});

test('AI settings endpoints need a token (401) and an admin (403)', async () => {
  for (const fn of [getS, saveS, testS]) {
    assert.equal((await fn({})).status, 401);
    for (const t of ['forged', 'expired']) assert.equal((await fn({ idToken: t })).status, 401, t);
    for (const who of ['stu', 'tea', 'par', 'newbie']) {
      assert.equal((await fn({ idToken: who, apiKey: 'sk-x', model: 'm' })).status, 403, who);
    }
  }
  assert.equal(stored(), undefined);
  assert.equal(h.ai.calls.length, 0);
});

test('a suspended or under-review admin cannot manage AI settings', async () => {
  h.seedUsers({ susAdm: { email: 'sa@school.hk', role: 'admin', accountStatus: 'suspended' }, revAdm: { email: 'ra@school.hk', role: 'admin', accountStatus: 'review' } });
  for (const who of ['susAdm', 'revAdm']) {
    assert.equal((await getS({ idToken: who })).status, 403, who);
    assert.equal((await saveS({ idToken: who, apiKey: 'sk-x', model: 'm' })).status, 403, who);
  }
  assert.equal(stored(), undefined);
});

test('get with nothing saved shows the env defaults and no key', async () => {
  const r = await getS({ idToken: 'adm' });
  assert.equal(r.status, 200);
  assert.equal(r.body.hasKey, false);
  assert.equal(r.body.envKeyConfigured, true);
  assert.equal(r.body.encryptionConfigured, true);
  assert.equal(r.body.provider.apiBaseUrl, 'https://openrouter.ai/api/v1');
  assert.ok(r.body.allowedHosts.includes('openrouter.ai'));
  assert.ok(!JSON.stringify(r.body).includes('sk-server'), 'env key never returned');
});

test('admin saves a key: stored encrypted, only a hint is returned', async () => {
  let r = await saveS({ idToken: 'adm', apiKey: 'sk-school-123456', apiBaseUrl: 'https://x.example/v1/', model: 'm1' });
  assert.equal(r.status, 200);
  const doc = stored();
  assert.ok(doc.secret.ciphertext && doc.secret.iv && doc.secret.tag);
  assert.ok(!JSON.stringify(doc).includes('sk-school-123456'), 'not stored in plain text');
  assert.equal(doc.updatedBy, 'adm');
  r = await getS({ idToken: 'adm' });
  assert.equal(r.body.hasKey, true);
  assert.deepEqual(r.body.provider, { apiBaseUrl: 'https://x.example/v1', model: 'm1' });
  assert.equal(r.body.keyHint, 'sk-…3456');
  assert.equal(r.body.updatedBy, 'adm@school.hk');
  assert.ok(!JSON.stringify(r.body).includes('sk-school-123456'), 'key never returned');
});

test('saving without a key keeps the stored key; clearKey removes it', async () => {
  await saveS({ idToken: 'adm', apiKey: 'sk-school-123456', model: 'm1' });
  const secret = stored().secret;
  await saveS({ idToken: 'adm', model: 'm2' });
  assert.deepEqual(stored().secret, secret);
  assert.equal(stored().provider.model, 'm2');
  await saveS({ idToken: 'adm', model: 'm2', clearKey: true });
  assert.equal(stored().secret, undefined);
  assert.equal((await getS({ idToken: 'adm' })).body.hasKey, false);
});

test('save validates the provider URL and model', async () => {
  for (const url of ['http://openrouter.ai/api/v1', 'https://evil.example/v1', 'https://169.254.169.254/v1', 'not a url']) {
    assert.equal((await saveS({ idToken: 'adm', apiKey: 'sk-x', apiBaseUrl: url, model: 'm' })).status, 400, url);
  }
  assert.equal((await saveS({ idToken: 'adm', apiKey: 'sk-x', model: '  ' })).status, 400);
  assert.equal(stored(), undefined);
});

test('saving a key without AI_CONFIG_ENCRYPTION_KEY fails clearly and stores nothing', async () => {
  h.setEnv({ ...h.FIREBASE_ON });
  const r = await saveS({ idToken: 'adm', apiKey: 'sk-x', model: 'm' });
  assert.equal(r.status, 503);
  assert.match(r.body.error, /AI_CONFIG_ENCRYPTION_KEY/);
  assert.equal(stored(), undefined);
});

test('every role\'s AI requests use the school key and base URL', async () => {
  await saveS({ idToken: 'adm', apiKey: 'sk-school-123456', apiBaseUrl: 'https://school-llm.example/v1', model: 'm-school' });
  for (const who of ['stu', 'tea', 'adm']) {
    const r = await h.post(app, '/api/chat', { idToken: who, message: 'hi' });
    assert.equal(r.status, 200, who);
    assert.equal(h.ai.last.url, 'https://school-llm.example/v1/chat/completions');
    assert.equal(h.ai.last.headers.Authorization, 'Bearer sk-school-123456');
    assert.equal(h.ai.last.body.model, 'm-school');
  }
});

test('a newly saved key takes effect on the next request', async () => {
  await h.post(app, '/api/chat', { idToken: 'stu', message: 'hi' });
  assert.equal(h.ai.last.headers.Authorization, 'Bearer sk-server');
  await saveS({ idToken: 'adm', apiKey: 'sk-new-key-0000', model: 'm' });
  await h.post(app, '/api/chat', { idToken: 'stu', message: 'hi' });
  assert.equal(h.ai.last.headers.Authorization, 'Bearer sk-new-key-0000');
});

test('without a saved key the env key is used, on the env URL', async () => {
  await saveS({ idToken: 'adm', apiBaseUrl: 'https://school-llm.example/v1', model: 'm-school' });
  await h.post(app, '/api/chat', { idToken: 'stu', message: 'hi' });
  assert.equal(h.ai.last.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(h.ai.last.headers.Authorization, 'Bearer sk-server');
});

test('a stored key pointing at a host no longer allowed is never used', async () => {
  await saveS({ idToken: 'adm', apiKey: 'sk-school-123456', apiBaseUrl: 'https://school-llm.example/v1', model: 'm' });
  h.setEnv({ ...h.FIREBASE_ON, AI_CONFIG_ENCRYPTION_KEY: 'enc-key-for-tests', OPENROUTER_API_KEY: 'sk-server' });
  const r = await h.post(app, '/api/chat', { idToken: 'stu', message: 'hi' });
  assert.equal(r.status, 400);
  assert.equal(h.ai.calls.length, 0);
});

test('test connection pings the provider with the saved settings', async () => {
  await saveS({ idToken: 'adm', apiKey: 'sk-school-123456', apiBaseUrl: 'https://x.example/v1', model: 'm1' });
  h.ai.reply('OK');
  const r = await testS({ idToken: 'adm' });
  assert.equal(r.status, 200);
  assert.equal(r.body.source, 'school');
  assert.equal(r.body.model, 'm1');
  assert.equal(h.ai.last.headers.Authorization, 'Bearer sk-school-123456');
});

test('test connection with no key anywhere → 400', async () => {
  h.setEnv({ ...h.FIREBASE_ON, AI_CONFIG_ENCRYPTION_KEY: 'enc-key-for-tests' });
  const r = await testS({ idToken: 'adm' });
  assert.equal(r.status, 400);
  assert.equal(h.ai.calls.length, 0);
});

test('each school has its own key: school B never uses school A\'s key', async () => {
  await saveS({ idToken: 'adm', apiKey: 'sk-school-a-1234', model: 'm-a' });
  await saveS({ idToken: 'adm2', apiKey: 'sk-school-b-5678', model: 'm-b' });
  assert.equal(stored('sch_a').schoolId, 'sch_a');
  await h.post(app, '/api/chat', { idToken: 'stu', message: 'hi' });
  assert.equal(h.ai.last.headers.Authorization, 'Bearer sk-school-a-1234');
  await h.post(app, '/api/chat', { idToken: 'stuB', message: 'hi' });
  assert.equal(h.ai.last.headers.Authorization, 'Bearer sk-school-b-5678');
  assert.equal(h.ai.last.body.model, 'm-b');
  const r = await getS({ idToken: 'adm2' });
  assert.equal(r.body.keyHint, 'sk-…5678');
});

test('an admin without a school cannot manage AI settings', async () => {
  delete h.fbState.data.users.adm.schoolId;
  assert.equal((await getS({ idToken: 'adm' })).status, 400);
  assert.equal((await saveS({ idToken: 'adm', apiKey: 'k', model: 'm' })).status, 400);
});

test('the old seed and migration endpoints are gone', () => {
  assert.equal(app.routes['POST /api/admin/seed'], undefined);
  assert.equal(app.routes['POST /api/admin/migrate-users-only'], undefined);
});

const models = (body) => h.post(app, '/api/admin/ai-settings/models', body);

test('models: admin only; lists the provider\'s models with prices per million tokens', async () => {
  assert.equal((await models({ idToken: 'tea' })).status, 403);
  h.ai.responder = () => ({ status: 200, body: { data: [
    { id: 'openai/gpt-x', name: 'GPT X', context_length: 128000, pricing: { prompt: '0.00000015', completion: '0.0000006' } },
    { id: 'free/model', pricing: { prompt: '0', completion: '0' } },
    { id: '' },
  ] } });
  const r = await models({ idToken: 'adm' });
  assert.equal(r.status, 200);
  assert.equal(h.ai.last.url, 'https://openrouter.ai/api/v1/models');
  assert.deepEqual(r.body.models[0], { id: 'openai/gpt-x', name: 'GPT X', contextLength: 128000, promptPrice: 0.15, completionPrice: 0.6 });
  assert.equal(r.body.models[1].promptPrice, 0);
  assert.equal(r.body.models.length, 2);
});

test('models: the saved key only goes to the provider it was saved for', async () => {
  await saveS({ idToken: 'adm', apiKey: 'sk-school-123456', apiBaseUrl: 'https://x.example/v1', model: 'm1' });
  h.ai.responder = () => ({ status: 200, body: { data: [{ id: 'a' }] } });
  await models({ idToken: 'adm' });
  assert.equal(h.ai.last.url, 'https://x.example/v1/models');
  assert.equal(h.ai.last.headers.Authorization, 'Bearer sk-school-123456');
  const calls = h.ai.calls.length;
  const r = await models({ idToken: 'adm', apiBaseUrl: 'https://school-llm.example/v1' });
  assert.equal(r.status, 400, 'no key for that provider: nothing is listed');
  assert.equal(h.ai.calls.length, calls, 'and the saved key is not sent there');
  await models({ idToken: 'adm', apiBaseUrl: 'https://school-llm.example/v1', apiKey: 'sk-typed' });
  assert.equal(h.ai.last.url, 'https://school-llm.example/v1/models');
  assert.equal(h.ai.last.headers.Authorization, 'Bearer sk-typed', 'a just-typed key is used for that provider');
  assert.equal(h.fbState.data.schoolSecrets.sch_a.keyHint, 'sk-…3456', 'the typed key is not saved');
  assert.equal((await models({ idToken: 'adm', apiBaseUrl: 'https://evil.example/v1' })).status, 400);
});

test('models: a rejected key is explained', async () => {
  h.ai.responder = () => ({ status: 401, body: { error: { message: 'no key' } } });
  const r = await models({ idToken: 'adm', apiBaseUrl: 'https://school-llm.example/v1', apiKey: 'sk-wrong' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /API Key/);
});

test('switching models keeps a most-recent-first list of used models', async () => {
  await saveS({ idToken: 'adm', apiKey: 'sk-school-123456', model: 'm1' });
  await saveS({ idToken: 'adm', model: 'm2' });
  await saveS({ idToken: 'adm', model: 'm1' });
  const r = await getS({ idToken: 'adm' });
  assert.deepEqual(r.body.recentModels, ['m1', 'm2']);
  assert.equal(r.body.hasKey, true, 'switching model keeps the key');
});

test('Codex models go through the Responses API and the reply text is read from output_text items', async () => {
  await saveS({ idToken: 'adm', apiKey: 'sk-openai-123456', apiBaseUrl: 'https://api.openai.com/v1', model: 'gpt-5-codex' });
  h.ai.responder = () => ({ status: 200, body: { output: [
    { type: 'reasoning', content: [] },
    { type: 'message', content: [{ type: 'output_text', text: '你好' }, { type: 'output_text', text: '！' }] },
  ] } });
  const r = await h.post(app, '/api/chat', { idToken: 'stu', message: 'hi', history: [{ role: 'user', content: 'earlier' }] });
  assert.equal(r.status, 200);
  assert.equal(r.body.reply, '你好！');
  assert.equal(h.ai.last.url, 'https://api.openai.com/v1/responses');
  assert.equal(h.ai.last.body.model, 'gpt-5-codex');
  assert.ok(h.ai.last.body.instructions, 'system prompt sent as instructions');
  assert.equal(h.ai.last.body.input.at(-1).role, 'user');
  assert.match(h.ai.last.body.input.at(-1).content, /hi/);
  assert.equal(h.ai.last.body.temperature, undefined);
});

test('non-Codex models still use chat completions', async () => {
  await saveS({ idToken: 'adm', apiKey: 'sk-openai-123456', apiBaseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' });
  await h.post(app, '/api/chat', { idToken: 'stu', message: 'hi' });
  assert.equal(h.ai.last.url, 'https://api.openai.com/v1/chat/completions');
});
