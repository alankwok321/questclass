'use strict';
// Fixes from the 2026-10-05 code review: provider allow-list, school-key model, upstream error
// bodies, only admins manage the school AI key, review/suspended accounts, and suspended admins.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/server-harness.cjs');

const app = h.loadServer();
const env = { ...h.FIREBASE_ON, OPENROUTER_API_KEY: 'sk-server', AI_MODEL: 'school/model', AI_CONFIG_ENCRYPTION_KEY: 'enc-key' };
beforeEach(() => {
  h.resetAll();
  h.setEnv(env);
  h.seedUsers({ rev: { email: 'rev@school.hk', role: 'teacher', accountStatus: 'review' } });
});
const chat = (b) => h.post(app, '/api/chat', b);
const saveSettings = (b) => h.post(app, '/api/admin/ai-settings/save', b);

test('a caller-supplied provider URL is never contacted (internal/http/foreign hosts)', async () => {
  for (const url of ['https://evil.example/v1', 'http://openrouter.ai/api/v1', 'https://169.254.169.254/latest', 'not a url']) {
    h.ai.reset();
    const r = await chat({ idToken: 'stu', message: 'hi', apiKey: 'sk-mine', apiBaseUrl: url });
    assert.equal(r.status, 200, url);
    for (const c of h.ai.calls) assert.ok(c.url.startsWith('https://openrouter.ai/api/v1/'), c.url);
  }
});

test('on the school key, the caller cannot choose the model', async () => {
  const r = await chat({ idToken: 'stu', message: 'hi', model: 'very/expensive-model' });
  assert.equal(r.status, 200);
  assert.equal(h.ai.last.body.model, 'school/model');
});

test('raw upstream bodies are not echoed back', async () => {
  h.ai.responder = () => ({ status: 500, body: '<html>internal admin page SECRET</html>' });
  const r = await chat({ idToken: 'stu', message: 'hi' });
  assert.equal(r.status, 500);
  assert.ok(!JSON.stringify(r.body).includes('SECRET'), JSON.stringify(r.body));
});

test('only an admin can change the school AI settings', async () => {
  for (const who of ['stu', 'tea', 'par', 'rev']) {
    assert.equal((await saveSettings({ idToken: who, apiKey: 'k', model: 'm' })).status, 403, who);
  }
  assert.equal(h.fbState.data.appSettings, undefined);
});

test('saving refuses a non-allowed provider URL', async () => {
  const r = await saveSettings({ idToken: 'adm', apiKey: 'k', apiBaseUrl: 'https://attacker.example/v1', model: 'm' });
  assert.equal(r.status, 400);
  assert.equal(h.fbState.data.appSettings, undefined);
});

test('stored settings pointing at a non-allowed host are never used', async () => {
  h.fbState.data.users.stu.schoolId = 'a';
  h.fbState.data.schoolSecrets = { a: { provider: { apiBaseUrl: 'https://attacker.example/v1' }, secret: { ciphertext: 'x', iv: 'y', tag: 'z' } } };
  const r = await chat({ idToken: 'stu', message: 'hi' });
  assert.notEqual(r.status, 200);
  assert.ok(!h.ai.calls.some((c) => c.url.includes('attacker.example')));
});

test('accounts under review cannot use AI', async () => {
  const r = await chat({ idToken: 'rev', message: 'hi', assistant: true });
  assert.equal(r.status, 403);
  assert.equal(h.ai.calls.length, 0);
});

test('suspended or under-review accounts cannot use the admin-SDK endpoints', async () => {
  h.seedUsers({
    rev: { email: 'rev@school.hk', role: 'teacher', accountStatus: 'review' },
    sadm: { email: 'sadm@school.hk', role: 'admin', accountStatus: 'suspended', schoolId: 'a', platformAdmin: true },
  });
  assert.equal((await h.post(app, '/api/admin/ai-settings/save', { idToken: 'sadm', apiKey: 'k', model: 'm' })).status, 403);
  assert.equal((await h.post(app, '/api/admin/ai-settings/get', { idToken: 'sadm' })).status, 403);
  assert.equal((await h.post(app, '/api/school/settings/save', { idToken: 'sadm', shareQuestionBank: true })).status, 403);
  assert.equal((await h.post(app, '/api/platform/schools/create', { idToken: 'sadm', name: 'X' })).status, 403);
  assert.equal(h.fbState.data.schools, undefined);
});
