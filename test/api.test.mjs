// Regression test for the AI sign-in bug found in review: web/src/services/api.js detached
// window.QuestClassFirebase.getIdToken from its object, so it threw and every AI request went
// out without a sign-in token.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const src = fs.readFileSync(new URL('../web/src/services/api.js', import.meta.url), 'utf8');
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qc-api-')), 'api.mjs');
fs.writeFileSync(tmp, src);
const api = await import(tmp);

function setup({ token = 'tok-123', settings = {} } = {}) {
  const sent = [];
  globalThis.localStorage = { getItem: () => JSON.stringify(settings) };
  globalThis.window = {
    QuestClassFirebase: {
      _token: token,
      // Uses `this`, like the real bridge.
      async getIdToken() { return this._token; },
    },
  };
  globalThis.fetch = async (url, init) => {
    sent.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => ({ reply: 'ok' }) };
  };
  return sent;
}

test('chat() attaches the signed-in user\'s ID token', async () => {
  const sent = setup();
  await api.chat({ message: 'hi', assistant: true });
  assert.equal(sent[0].url, '/api/chat');
  assert.equal(sent[0].body.idToken, 'tok-123');
  assert.equal(sent[0].body.message, 'hi');
});

test('lessonLoop() and generateQuestions() send the token but never an API key, even if an old one is stored', async () => {
  const sent = setup({ settings: { apiKey: ' sk-local ', apiBaseUrl: 'https://openrouter.ai/api/v1', apiModel: 'm' } });
  await api.lessonLoop({ topic: 'x' });
  globalThis.fetch = async (url, init) => {
    sent.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => ({ questions: [{ q: '1' }] }) };
  };
  await api.generateQuestions({ message: 'make' });
  for (const s of sent) {
    assert.equal(s.body.idToken, 'tok-123');
    assert.equal(s.body.apiKey, undefined);
    assert.equal(s.body.apiBaseUrl, undefined);
    assert.equal(s.body.model, undefined);
  }
  assert.equal(sent[1].body.format, 'json');
});

test('admin AI settings helpers call the admin endpoints with the token', async () => {
  const sent = setup();
  await api.getAiSettings();
  await api.saveAiSettings({ apiKey: 'sk-new', model: 'm' });
  await api.testAiSettings();
  assert.deepEqual(sent.map((s) => s.url), ['/api/admin/ai-settings/get', '/api/admin/ai-settings/save', '/api/admin/ai-settings/test']);
  assert.ok(sent.every((s) => s.body.idToken === 'tok-123'));
  assert.equal(sent[1].body.apiKey, 'sk-new');
});

test('signed out: no token, request still goes out', async () => {
  const sent = setup({ token: null });
  await api.chat({ message: 'hi' });
  assert.equal(sent[0].body.idToken, undefined);
});
