'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/server-harness.cjs');

const app = h.loadServer();
beforeEach(() => {
  h.resetAll();
  h.setEnv({ OPENROUTER_API_KEY: 'sk-server', ...h.FIREBASE_ON });
  h.seedUsers();
});
const loop = (body) => h.post(app, '/api/teacher/lesson-loop', body);

for (const who of ['tea', 'adm']) {
  test(`lesson-loop: ${who} is allowed and gets parsed JSON`, async () => {
    h.ai.reply(JSON.stringify({ steps: ['a', 'b'], assignment: ['x'], insight: 'i', teacherSummary: [] }));
    const r = await loop({ idToken: who, topic: '分數', grade: 'P5' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.steps, ['a', 'b']);
    assert.equal(r.body.mode, 'live');
    assert.deepEqual(h.ai.last.body.response_format, { type: 'json_object' });
    assert.match(h.ai.last.body.messages.at(-1).content, /分數/);
  });
}

for (const who of ['stu', 'par', 'newbie']) {
  test(`lesson-loop: ${who} is refused with 403`, async () => {
    const r = await loop({ idToken: who, topic: 'x' });
    assert.equal(r.status, 403);
    assert.equal(h.ai.calls.length, 0);
  });
}

test('lesson-loop: signed-out → 401 when Firebase is configured', async () => {
  const r = await loop({ topic: 'x' });
  assert.equal(r.status, 401);
  assert.equal(h.ai.calls.length, 0);
});

test('lesson-loop: bad token → 401', async () => {
  const r = await loop({ idToken: 'expired' });
  assert.equal(r.status, 401);
});

test('lesson-loop: non-JSON model output falls back to a single step', async () => {
  h.ai.reply('plain text plan');
  const r = await loop({ idToken: 'tea' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.steps, ['plain text plan']);
  assert.deepEqual(r.body.assignment, []);
});

test('lesson-loop: server key never goes to a caller apiBaseUrl', async () => {
  h.ai.reply('{}');
  await loop({ idToken: 'tea', apiBaseUrl: 'https://evil.example.com' });
  for (const c of h.ai.calls) assert.ok(!c.url.includes('evil.example.com'), c.url);
});
