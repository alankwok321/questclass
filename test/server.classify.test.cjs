'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/server-harness.cjs');

const app = h.loadServer();

beforeEach(() => {
  h.resetAll();
  h.setEnv({ OPENROUTER_API_KEY: 'sk-server', ...h.FIREBASE_ON });
  h.seedUsers({ tea: { email: 'tea@school.hk', role: 'teacher', schoolId: 'sch1' }, stu: { email: 'stu@school.hk', role: 'student', schoolId: 'sch1' } });
  h.fbState.data.questionBank = {
    q1: { schoolId: 'sch1', question_text: '直角三角形兩邊為 3 和 4，求斜邊。', target_level: 'S2', tags: ['keep-me'] },
    q2: { schoolId: 'sch1', question_text: '解 x^2-5x+6=0', target_level: 'S4' },
    q3: { schoolId: 'sch1', question_text: 'already done', target_level: 'S1', tags: ['subj:MATH', 'cls:ai'] },
    q4: { schoolId: 'other', question_text: 'other school', target_level: 'S1' },
    q5: { schoolId: 'sch1', question_text: 'deleted', deleted: true },
  };
});

const classify = (body) => h.post(app, '/api/teacher/questions/classify', body);

test('classifies the school\'s untagged questions; keeps other tags; rejects invalid answers', async () => {
  h.ai.reply(JSON.stringify({ results: [
    { id: 'q1', subject: 'MATH', unit: 'MATH.J25' },
    { id: 'q2', subject: 'MATH', unit: 'MATH.J25' }, // S1–S3 unit for an S4 question → unit dropped
  ] }));
  const r = await classify({ idToken: 'tea' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.classified, 2);
  assert.equal(r.body.remaining, 0);
  const qb = h.fbState.data.questionBank;
  assert.deepEqual(qb.q1.tags, ['keep-me', 'subj:MATH', 'unit:MATH.J25', 'cls:ai']);
  assert.deepEqual(qb.q2.tags, ['subj:MATH', 'cls:ai']);
  assert.equal(qb.q4.tags, undefined); // other school untouched
  assert.equal(qb.q5.tags, undefined); // deleted untouched
  const sys = h.ai.last.body.messages[0].content;
  assert.match(sys, /MATH\.J25=畢氏定理/);
  assert.match(sys, /MATH\.S1=一元二次方程/);
  // Nothing left: no AI call next time.
  const calls = h.ai.calls.length;
  const again = await classify({ idToken: 'tea' });
  assert.equal(again.body.classified, 0);
  assert.equal(h.ai.calls.length, calls);
});

test('ids: re-classifies just-saved questions even if done before; other schools ignored', async () => {
  h.ai.reply(JSON.stringify({ results: [{ id: 'q3', subject: 'PHY', unit: 'PHY.2' }] }));
  const r = await classify({ idToken: 'tea', ids: ['q3', 'q4'] });
  assert.equal(r.status, 200);
  assert.equal(r.body.classified, 1);
  assert.ok(!h.fbState.data.questionBank.q3.tags.includes('unit:PHY.2')); // S1 question: senior Physics unit rejected
  assert.ok(h.fbState.data.questionBank.q3.tags.includes('subj:PHY'));
  assert.equal(h.fbState.data.questionBank.q4.tags, undefined);
});

test('AI answer missing or broken: questions are still marked so the pass never loops', async () => {
  h.ai.reply('sorry, no JSON');
  const r = await classify({ idToken: 'tea' });
  assert.equal(r.status, 200);
  assert.deepEqual(h.fbState.data.questionBank.q2.tags, ['cls:ai']);
});

test('students cannot classify; signed-out rejected', async () => {
  assert.equal((await classify({ idToken: 'stu' })).status, 403);
  assert.equal((await classify({})).status, 401);
});
