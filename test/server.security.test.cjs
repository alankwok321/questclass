'use strict';
// Fixes from the 2026-10-05 code review: provider allow-list, school-key model, upstream error
// bodies, who may manage whose AI key, review/suspended accounts, and the users migration.
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
const upsert = (b) => h.post(app, '/api/ai-config/upsert', b);

test('own key + non-allowed host (incl. internal/http) is refused with 400 and no request', async () => {
  for (const url of ['https://evil.example/v1', 'http://openrouter.ai/api/v1', 'https://169.254.169.254/latest', 'https://openrouter.ai/api/v1?x=', 'not a url']) {
    h.ai.reset();
    const r = await chat({ message: 'hi', apiKey: 'sk-mine', apiBaseUrl: url });
    assert.equal(r.status, 400, url);
    assert.equal(h.ai.calls.length, 0, url);
  }
});

test('own key + allowed host works', async () => {
  const r = await chat({ message: 'hi', apiKey: 'sk-mine', apiBaseUrl: 'https://api.openai.com/v1' });
  assert.equal(r.status, 200);
  assert.equal(h.ai.last.url, 'https://api.openai.com/v1/chat/completions');
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

test('teacher may set a student\'s key but not an admin\'s or another teacher\'s', async () => {
  assert.equal((await upsert({ idToken: 'tea', uid: 'stu', apiKey: 'k' })).status, 200);
  assert.equal((await upsert({ idToken: 'tea', uid: 'adm', apiKey: 'k' })).status, 403);
  assert.equal((await upsert({ idToken: 'tea', uid: 'rev', apiKey: 'k' })).status, 403);
  assert.equal((await chat({ idToken: 'tea', uid: 'adm', message: 'hi' })).status, 403);
});

test('upsert refuses a non-allowed provider URL', async () => {
  const r = await upsert({ idToken: 'adm', uid: 'stu', apiKey: 'k', apiBaseUrl: 'https://attacker.example/v1' });
  assert.equal(r.status, 400);
});

test('a stored config pointing at a non-allowed host is never used', async () => {
  h.fbState.data.aiProviderConfigs = { stu: { provider: { apiBaseUrl: 'https://attacker.example/v1' }, secret: { ciphertext: 'x', iv: 'y', tag: 'z' } } };
  const r = await chat({ idToken: 'stu', message: 'hi' });
  assert.notEqual(r.status, 200);
  assert.ok(!h.ai.calls.some((c) => c.url.includes('attacker.example')));
});

test('accounts under review cannot use AI', async () => {
  const r = await chat({ idToken: 'rev', message: 'hi', assistant: true });
  assert.equal(r.status, 403);
  assert.equal(h.ai.calls.length, 0);
});

test('migration keeps an existing teacher/admin role', async () => {
  h.fbState.data.students = { s1: { userUid: 'tea', classroomIds: ['5A'] }, s2: { userUid: 'stu9' } };
  const r = await h.post(app, '/api/admin/migrate-users-only', { idToken: 'adm' });
  assert.equal(r.status, 200);
  assert.equal(String(h.fbState.data.users.tea.role).toLowerCase(), 'teacher');
  assert.equal(h.fbState.data.users.stu9.role, 'student');
});

test('suspended or under-review accounts cannot use the admin-SDK endpoints', async () => {
  h.seedUsers({
    rev: { email: 'rev@school.hk', role: 'teacher', accountStatus: 'review' },
    sadm: { email: 'sadm@school.hk', role: 'admin', accountStatus: 'suspended' },
  });
  assert.equal((await h.post(app, '/api/ai-config/upsert', { idToken: 'rev', uid: 'stu', apiKey: 'k' })).status, 403);
  assert.equal((await h.post(app, '/api/ai-config/get', { idToken: 'rev' })).status, 403);
  assert.equal((await h.post(app, '/api/admin/seed', { idToken: 'sadm' })).status, 403);
  assert.equal((await h.post(app, '/api/admin/migrate-users-only', { idToken: 'sadm' })).status, 403);
});
