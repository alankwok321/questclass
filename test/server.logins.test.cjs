'use strict';
// Login records for 分析: one record per person per Hong Kong day, statistics per day and person.
process.env.NODE_ENV = 'test';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/server-harness.cjs');

const app = h.loadServer();
const stats = (body) => h.post(app, '/api/analytics/logins', body);

beforeEach(() => {
  h.resetAll();
  h.setEnv({ ...h.FIREBASE_ON });
  h.seedUsers({ boss: { email: 'boss@x.hk', role: 'admin', platformAdmin: true } });
  for (const uid of ['stu', 'stu2', 'tea', 'adm', 'par']) h.fbState.data.users[uid].schoolId = 'a';
  h.fbState.data.users.stu.class = '5A';
  h.fbState.data.users.stu2.class = '6B';
  Object.assign(h.fbState.tokens, { stuV: { uid: 'stu', email: 'stu@school.hk', email_verified: true } });
});

test('signing in records one login day; reopening within 30 minutes is the same visit', async () => {
  await h.post(app, '/api/auth/sync-role', { idToken: 'stuV' });
  await h.post(app, '/api/auth/sync-role', { idToken: 'stuV' });
  const docs = Object.entries(h.fbState.data.loginDays || {});
  assert.equal(docs.length, 1);
  const [id, rec] = docs[0];
  assert.match(id, /^stu_\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual([rec.schoolId, rec.role, rec.class, rec.count], ['a', 'student', '5A', 1]);
  assert.ok(h.fbState.data.users.stu.lastLoginAt);
});

test('platform admins and people without a school are not recorded', async () => {
  h.fbState.data.users.stu.schoolId = '';
  await h.post(app, '/api/auth/sync-role', { idToken: 'stuV' });
  assert.equal(Object.keys(h.fbState.data.loginDays || {}).length, 0);
});

test('statistics per day and per person; class-limited teachers see their students only', async () => {
  const NOW = Date.parse('2026-10-06T04:00:00Z'); // 12:00 in Hong Kong
  h.fbState.data.loginDays = {
    'stu_2026-10-06': { uid: 'stu', schoolId: 'a', day: '2026-10-06', count: 2 },
    'stu_2026-10-05': { uid: 'stu', schoolId: 'a', day: '2026-10-05', count: 1 },
    'tea_2026-10-06': { uid: 'tea', schoolId: 'a', day: '2026-10-06', count: 1 },
    'stu2_2026-09-01': { uid: 'stu2', schoolId: 'a', day: '2026-09-01', count: 1 },
    'x_2026-10-06': { uid: 'x', schoolId: 'b', day: '2026-10-06', count: 1 },
  };
  let r = await stats({ idToken: 'adm', days: 7, now: NOW });
  assert.equal(r.status, 200);
  assert.equal(r.body.days.length, 7);
  assert.equal(r.body.today, '2026-10-06');
  const today = r.body.days.at(-1);
  assert.deepEqual([today.day, today.total, today.student, today.teacher, today.visits], ['2026-10-06', 2, 1, 1, 3]);
  const stu = r.body.people.find((p) => p.uid === 'stu');
  assert.deepEqual([stu.daysActive, stu.visits], [2, 3]);
  assert.equal(r.body.people.find((p) => p.uid === 'stu2').daysActive, 0, 'outside the period');
  h.fbState.data.users.tea.teacherClasses = ['5A'];
  r = await stats({ idToken: 'tea', days: 7, now: NOW });
  assert.deepEqual(r.body.people.filter((p) => p.role === 'student').map((p) => p.uid), ['stu']);
  assert.equal((await stats({ idToken: 'stu' })).status, 403);
});
