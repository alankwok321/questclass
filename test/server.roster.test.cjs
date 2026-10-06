'use strict';
// Adding students and teachers from Excel: existing accounts are updated, others get an invite
// that is applied the first time that person signs in.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/server-harness.cjs');

const app = h.loadServer();
const imp = (body) => h.post(app, '/api/school/roster/import', body);

beforeEach(() => {
  h.resetAll();
  h.setEnv({ ...h.FIREBASE_ON });
  h.seedUsers({ admB: { email: 'admb@x.hk', role: 'admin', schoolId: 'b' } });
  for (const uid of ['stu', 'tea', 'adm']) h.fbState.data.users[uid].schoolId = 'a';
  h.fbState.data.users.newbie = { email: 'newbie@school.hk', role: 'student', accountStatus: 'review' };
  h.fbState.data.users.other = { email: 'other@x.hk', role: 'student', schoolId: 'b', accountStatus: 'active' };
  h.fbState.data.schools = { a: { name: 'A' }, b: { name: 'B' } };
  Object.assign(h.fbState.tokens, {
    fresh: { uid: 'f1', email: 'Fresh@School.hk', email_verified: true },
    freshT: { uid: 'f2', email: 'teach@school.hk', email_verified: true },
  });
});

const rows = [
  { email: ' Fresh@School.hk ', name: '陳大文', role: '學生', class: '5A' },
  { email: 'teach@school.hk', name: '李老師', role: '老師', class: '5A, 5B' },
  { email: 'newbie@school.hk', name: 'New Bie', role: 'student', class: '6C' },
  { email: 'other@x.hk', role: '學生', class: '5A' },
  { email: 'not-an-email', role: '學生' },
  { email: 'x@y.hk', role: '校長' },
  { email: 'fresh@school.hk', role: '學生' },
];

test('import: updates existing accounts, creates accounts for the rest, reports problems', async () => {
  const r = await imp({ idToken: 'adm', rows });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.updated, ['newbie@school.hk']);
  assert.deepEqual(r.body.created.sort(), ['fresh@school.hk', 'teach@school.hk']);
  assert.deepEqual(r.body.skipped.map((s) => s.reason), ['電郵格式不正確', '身分必須是 學生／老師／家長／管理員', '重複的電郵', '已屬於另一間學校']);
  const nb = h.fbState.data.users.newbie;
  assert.deepEqual([nb.schoolId, nb.role, nb.class, nb.accountStatus, nb.name], ['a', 'student', '6C', 'active', 'New Bie']);
  assert.equal(h.fbState.data.users.other.schoolId, 'b', 'never moved out of another school');
  const made = Object.entries(h.fbState.data.users).filter(([, u]) => u.pendingFirstLogin);
  assert.deepEqual(made.map(([, u]) => [u.email, u.role, u.schoolId, u.class, u.teacherClasses, u.name]).sort(), [
    ['fresh@school.hk', 'student', 'a', '5A', undefined, '陳大文'],
    ['teach@school.hk', 'teacher', 'a', undefined, ['5A', '5B'], '李老師'],
  ]);
  for (const [uid] of made) assert.ok(h.fbState.authUsers[uid], 'a sign-in account exists for them');
});

test('first sign-in uses the created account and clears "not signed in yet"', async () => {
  await imp({ idToken: 'adm', rows });
  const [uid] = Object.entries(h.fbState.data.users).find(([, u]) => u.email === 'fresh@school.hk');
  h.fbState.tokens.fresh = { uid, email: 'Fresh@School.hk', email_verified: true };
  await h.post(app, '/api/auth/sync-role', { idToken: 'fresh' });
  const u = h.fbState.data.users[uid];
  assert.equal(u.pendingFirstLogin, undefined);
  assert.ok(u.lastLoginAt);
  assert.deepEqual([u.schoolId, u.class], ['a', '5A']);
});

test('if Google sign-in made a different account, the created profile moves onto it', async () => {
  await imp({ idToken: 'adm', rows });
  const [preUid] = Object.entries(h.fbState.data.users).find(([, u]) => u.email === 'teach@school.hk');
  h.fbState.data.users.f2 = { email: 'teach@school.hk', role: 'student', accountStatus: 'review' };
  const r = await h.post(app, '/api/auth/sync-role', { idToken: 'freshT' });
  assert.equal(r.body.changed, true);
  assert.deepEqual([h.fbState.data.users.f2.role, h.fbState.data.users.f2.schoolId, h.fbState.data.users.f2.teacherClasses], ['teacher', 'a', ['5A', '5B']]);
  assert.equal(h.fbState.data.users[preUid], undefined);
  assert.equal(h.fbState.authUsers[preUid], undefined);
});

test('only admins import', async () => {
  assert.equal((await imp({ idToken: 'tea', rows })).status, 403);
});
