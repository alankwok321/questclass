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
});
const getCfg = (body) => h.post(app, '/api/ai-config/get', body);
const upsert = (body) => h.post(app, '/api/ai-config/upsert', body);

test('get/upsert require a token (401)', async () => {
  assert.equal((await getCfg({})).status, 401);
  assert.equal((await upsert({ apiKey: 'k' })).status, 401);
});

test('get/upsert with an invalid or expired token answer 401', async () => {
  for (const t of ['forged', 'expired']) {
    assert.equal((await getCfg({ idToken: t })).status, 401, `get with ${t}`);
    assert.equal((await upsert({ idToken: t, apiKey: 'k' })).status, 401, `upsert with ${t}`);
  }
});

test('student can read and write their own config', async () => {
  let r = await getCfg({ idToken: 'stu' });
  assert.equal(r.status, 200);
  assert.equal(r.body.hasKey, false);
  r = await upsert({ idToken: 'stu', apiKey: 'sk-student', apiBaseUrl: 'https://x.example/v1/', model: 'm1' });
  assert.equal(r.status, 200);
  r = await getCfg({ idToken: 'stu' });
  assert.equal(r.body.hasKey, true);
  assert.deepEqual(r.body.provider, { apiBaseUrl: 'https://x.example/v1', model: 'm1' });
  assert.ok(!JSON.stringify(r.body).includes('sk-student'), 'key never returned');
});

test('stored key is encrypted at rest', async () => {
  await upsert({ idToken: 'stu', apiKey: 'sk-student' });
  const stored = h.fbState.data.aiProviderConfigs.stu;
  assert.ok(stored.secret.ciphertext && stored.secret.iv && stored.secret.tag);
  assert.ok(!JSON.stringify(stored).includes('sk-student'));
  assert.equal(stored.updatedBy, 'stu');
});

test('students cannot manage other users\' config', async () => {
  assert.equal((await getCfg({ idToken: 'stu', uid: 'stu2' })).status, 403);
  assert.equal((await upsert({ idToken: 'stu', uid: 'stu2', apiKey: 'k' })).status, 403);
  assert.equal(h.fbState.data.aiProviderConfigs, undefined);
});

test('parents cannot manage other users\' config', async () => {
  assert.equal((await getCfg({ idToken: 'par', uid: 'stu' })).status, 403);
  assert.equal((await upsert({ idToken: 'par', uid: 'stu', apiKey: 'k' })).status, 403);
});

test('teacher and admin can manage a student\'s config', async () => {
  let r = await upsert({ idToken: 'tea', uid: 'stu', apiKey: 'sk-from-teacher' });
  assert.equal(r.status, 200);
  assert.equal(h.fbState.data.aiProviderConfigs.stu.updatedBy, 'tea');
  r = await getCfg({ idToken: 'adm', uid: 'stu' });
  assert.equal(r.status, 200);
  assert.equal(r.body.hasKey, true);
});

test('upsert without apiKey → 400', async () => {
  assert.equal((await upsert({ idToken: 'stu', apiKey: '  ' })).status, 400);
});

test('upsert without AI_CONFIG_ENCRYPTION_KEY fails and stores nothing', async () => {
  h.setEnv({ ...h.FIREBASE_ON });
  const r = await upsert({ idToken: 'stu', apiKey: 'k' });
  assert.equal(r.status, 500);
  assert.equal(h.fbState.data.aiProviderConfigs, undefined);
});

test('chat uses the stored (decrypted) key and stored base URL', async () => {
  await upsert({ idToken: 'stu', apiKey: 'sk-student', apiBaseUrl: 'https://school-llm.example/v1', model: 'm-stored' });
  const r = await h.post(app, '/api/chat', { idToken: 'stu', message: 'hi' });
  assert.equal(r.status, 200);
  assert.equal(h.ai.last.url, 'https://school-llm.example/v1/chat/completions');
  assert.equal(h.ai.last.headers.Authorization, 'Bearer sk-student');
  assert.equal(h.ai.last.body.model, 'm-stored');
});

test('admin seed / migrate: admin only', async () => {
  for (const path of ['/api/admin/seed', '/api/admin/migrate-users-only']) {
    assert.equal((await h.post(app, path, {})).status, 401, path);
    for (const who of ['stu', 'tea', 'par']) assert.equal((await h.post(app, path, { idToken: who })).status, 403, `${path} ${who}`);
  }
  assert.equal(h.fbState.writes.length, 0);
});

test('admin seed writes every seed collection and converts serverTimestamp markers', async () => {
  const r = await h.post(app, '/api/admin/seed', { idToken: 'adm' });
  assert.equal(r.status, 200);
  const seed = require('../seeds/sample-firestore-data.json');
  for (const col of ['classrooms', 'students', 'progressSummaries', 'submissions', 'users']) {
    assert.equal(r.body.written[col], Object.keys(seed[col] || {}).length, col);
  }
  assert.ok(!JSON.stringify(h.fbState.writes).includes('"__type":"serverTimestamp"'));
  assert.ok(h.fbState.writes.every((w) => w.opts.merge === true));
});

test('admin migrate-users-only copies student profiles onto users/{userUid}', async () => {
  h.fbState.data.students = { s1: { userUid: 'u9', classroomIds: ['5A'], xp: 10, streak: 3 }, s2: { name: 'no uid' } };
  h.fbState.data.progressSummaries = { s1: { focusAreas: ['分數'] } };
  const r = await h.post(app, '/api/admin/migrate-users-only', { idToken: 'adm' });
  assert.equal(r.status, 200);
  assert.equal(r.body.merged, 1);
  assert.equal(r.body.skipped, 1);
  const u = h.fbState.data.users.u9;
  assert.equal(u.role, 'student');
  assert.deepEqual(u.classroomIds, ['5A']);
  assert.equal(u.studentProfile.xp, 10);
  assert.deepEqual(u.studentProfile.focusAreas, ['分數']);
});
