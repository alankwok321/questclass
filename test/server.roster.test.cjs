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

test('import: updates existing accounts, invites the rest, reports problems', async () => {
  const r = await imp({ idToken: 'adm', rows });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.updated, ['newbie@school.hk']);
  assert.deepEqual(r.body.invited.sort(), ['fresh@school.hk', 'teach@school.hk']);
  assert.deepEqual(r.body.skipped.map((s) => s.reason), ['電郵格式不正確', '身分必須是 學生／老師／家長／管理員', '重複的電郵', '已屬於另一間學校']);
  const nb = h.fbState.data.users.newbie;
  assert.deepEqual([nb.schoolId, nb.role, nb.class, nb.accountStatus, nb.name], ['a', 'student', '6C', 'active', 'New Bie']);
  assert.equal(h.fbState.data.users.other.schoolId, 'b', 'never moved out of another school');
  const list = await h.post(app, '/api/school/roster/list', { idToken: 'adm' });
  assert.deepEqual(list.body.invites.map((i) => [i.email, i.role, i.class, i.teacherClasses]),
    [['fresh@school.hk', 'student', '5A', null], ['teach@school.hk', 'teacher', '', ['5A', '5B']]]);
  assert.equal((await h.post(app, '/api/school/roster/list', { idToken: 'admB' })).body.invites.length, 0, 'other schools see none');
});

test('first sign-in applies the invite (student class, teacher classes) and removes it', async () => {
  await imp({ idToken: 'adm', rows });
  h.fbState.data.users.f1 = { email: 'Fresh@School.hk', role: 'student', accountStatus: 'review' };
  h.fbState.data.users.f2 = { email: 'teach@school.hk', role: 'student', accountStatus: 'review' };
  let r = await h.post(app, '/api/auth/sync-role', { idToken: 'fresh' });
  assert.equal(r.body.changed, true);
  assert.deepEqual(['schoolId', 'role', 'class', 'accountStatus', 'name'].map((k) => h.fbState.data.users.f1[k]), ['a', 'student', '5A', 'active', '陳大文']);
  r = await h.post(app, '/api/auth/sync-role', { idToken: 'freshT' });
  assert.deepEqual([h.fbState.data.users.f2.role, h.fbState.data.users.f2.teacherClasses], ['teacher', ['5A', '5B']]);
  assert.equal((await h.post(app, '/api/school/roster/list', { idToken: 'adm' })).body.invites.length, 0);
  r = await h.post(app, '/api/auth/sync-role', { idToken: 'fresh' });
  assert.equal(r.body.changed, false, 'nothing left to apply');
});

test('only admins import; invites can be cancelled', async () => {
  assert.equal((await imp({ idToken: 'tea', rows })).status, 403);
  await imp({ idToken: 'adm', rows });
  assert.equal((await h.post(app, '/api/school/roster/cancel', { idToken: 'admB', email: 'fresh@school.hk' })).status, 404);
  assert.equal((await h.post(app, '/api/school/roster/cancel', { idToken: 'adm', email: 'FRESH@school.hk' })).status, 200);
  assert.equal((await h.post(app, '/api/school/roster/list', { idToken: 'adm' })).body.invites.length, 1);
});
