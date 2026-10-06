'use strict';
// School admin editing a member through the server (used when the console rules are older).
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/server-harness.cjs');

const app = h.loadServer();
const upd = (body) => h.post(app, '/api/school/users/update', body);

beforeEach(() => {
  h.resetAll();
  h.setEnv({ ...h.FIREBASE_ON });
  h.seedUsers({
    boss: { email: 'boss@x.hk', role: 'admin', platformAdmin: true },
    admB: { email: 'admb@x.hk', role: 'admin', schoolId: 'b' },
  });
  for (const uid of ['stu', 'stu2', 'tea', 'adm']) h.fbState.data.users[uid].schoolId = 'a';
  h.fbState.data.schools = { a: { name: 'A' }, b: { name: 'B' } };
});

test('school admin sets which classes a teacher may see, and clears it', async () => {
  let r = await upd({ idToken: 'adm', uid: 'tea', role: 'teacher', accountStatus: 'active', teacherClasses: [' 5A ', '5A', '', '6B'] });
  assert.equal(r.status, 200);
  assert.deepEqual(h.fbState.data.users.tea.teacherClasses, ['5A', '6B']);
  r = await upd({ idToken: 'adm', uid: 'tea', teacherClasses: null });
  assert.equal(r.status, 200);
  assert.ok(!('teacherClasses' in h.fbState.data.users.tea));
});

test('only admins of the same school; never the platform admin; no school moves', async () => {
  assert.equal((await upd({ idToken: 'tea', uid: 'stu', class: '5B' })).status, 403);
  assert.equal((await upd({ idToken: 'admB', uid: 'stu', class: '5B' })).status, 403);
  assert.equal((await upd({ idToken: 'adm', uid: 'stu', schoolId: 'b' })).status, 403);
  assert.equal((await upd({ idToken: 'adm', uid: 'stu', role: 'superuser' })).status, 400);
  assert.equal((await upd({ idToken: 'adm', uid: 'nobody', class: '5B' })).status, 404);
  assert.equal(h.fbState.data.users.stu.class, undefined);
});

test('platform admin can move someone; no school means awaiting approval', async () => {
  assert.equal((await upd({ idToken: 'boss', uid: 'stu', schoolId: 'b' })).status, 200);
  assert.equal(h.fbState.data.users.stu.schoolId, 'b');
  assert.equal((await upd({ idToken: 'boss', uid: 'stu', schoolId: '' })).status, 200);
  assert.equal(h.fbState.data.users.stu.accountStatus, 'review');
  assert.equal((await upd({ idToken: 'boss', uid: 'stu', schoolId: 'zzz' })).status, 404);
});
