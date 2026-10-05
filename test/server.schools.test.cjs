'use strict';
// Schools: platform admin creates/renames them, the first school adopts all existing data,
// school admins share their question bank.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/server-harness.cjs');

const app = h.loadServer();
beforeEach(() => {
  h.resetAll();
  h.setEnv({ ...h.FIREBASE_ON, AI_CONFIG_ENCRYPTION_KEY: 'enc-key' });
  h.seedUsers({ boss: { email: 'boss@school.hk', role: 'admin', platformAdmin: true } });
});
const create = (body) => h.post(app, '/api/platform/schools/create', body);
const rename = (body) => h.post(app, '/api/platform/schools/rename', body);
const share = (body) => h.post(app, '/api/school/settings/save', body);
const schools = () => Object.entries(h.fbState.data.schools || {});

test('only the platform admin may create or rename schools', async () => {
  assert.equal((await create({ name: 'A' })).status, 401);
  for (const who of ['adm', 'tea', 'stu', 'par']) {
    assert.equal((await create({ idToken: who, name: 'A' })).status, 403, who);
    assert.equal((await rename({ idToken: who, schoolId: 'x', name: 'A' })).status, 403, who);
  }
  h.seedUsers({ boss: { email: 'boss@school.hk', role: 'admin', platformAdmin: true, accountStatus: 'suspended' } });
  assert.equal((await create({ idToken: 'boss', name: 'A' })).status, 403);
  assert.equal(schools().length, 0);
});

test('school names are required, at most 80 characters, and unique', async () => {
  assert.equal((await create({ idToken: 'boss', name: '   ' })).status, 400);
  assert.equal((await create({ idToken: 'boss', name: 'x'.repeat(81) })).status, 400);
  assert.equal((await create({ idToken: 'boss', name: '聖保羅書院' })).status, 200);
  assert.equal((await create({ idToken: 'boss', name: ' 聖保羅書院 ' })).status, 409);
  assert.equal(schools().length, 1);
});

test('the first school adopts existing users and data and removes old user fields', async () => {
  const d = h.fbState.data;
  Object.assign(d.users.stu, { classroomIds: ['5A', '5B'], requestedRole: 'teacher', learnerStage: 'P5', roleNote: 'x', adminNote: 'y', issueFlag: true, studentId: 's1', studentProfile: { xp: 3 } });
  Object.assign(d.users.tea, { classroomIds: ['5A'], class: '' });
  d.homeworkAssignments = { h1: { title: 'HW', status: 'published' } };
  d.homeworkAnswerKeys = { h1: { questions: [] } };
  d.submissions = { s1: { studentUid: 'stu', classroomId: '5A', studentId: 's1' } };
  d.questionBank = { q1: { question_text: '1+1', classroomId: 'x' } };
  d.appSettings = { ai: { provider: { model: 'm' }, secret: { ciphertext: 'c', iv: 'i', tag: 't' }, keyHint: 'sk-…1234' } };

  const r = await create({ idToken: 'boss', name: 'School A' });
  assert.equal(r.status, 200);
  const id = r.body.schoolId;
  assert.match(id, /^sch_[0-9a-f]{16}$/);
  assert.equal(d.schools[id].name, 'School A');
  assert.equal(d.schools[id].shareQuestionBank, false);

  for (const u of Object.values(d.users)) assert.equal(u.schoolId, id);
  for (const f of ['classroomIds', 'requestedRole', 'learnerStage', 'roleNote', 'adminNote', 'issueFlag', 'studentId']) {
    assert.ok(!(f in d.users.stu), f);
  }
  assert.equal(d.users.stu.class, '5A', 'a student keeps their class');
  assert.deepEqual(d.users.stu.studentProfile, { xp: 3 }, 'learning progress is kept');
  assert.equal(d.users.tea.class, '', 'teachers do not get a class');
  assert.equal(d.homeworkAssignments.h1.schoolId, id);
  assert.equal(d.homeworkAnswerKeys.h1.schoolId, id);
  assert.equal(d.submissions.s1.schoolId, id);
  assert.ok(!('classroomId' in d.submissions.s1) && !('studentId' in d.submissions.s1));
  assert.equal(d.questionBank.q1.schoolId, id);
  assert.equal(d.questionBank.q1.shared, false);
  assert.equal(d.schoolSecrets[id].keyHint, 'sk-…1234', 'the old AI key becomes this school\'s key');
  assert.equal(d.appSettings.ai, undefined);
  assert.equal(r.body.adopted.users, Object.keys(d.users).length);
});

test('later schools start empty and adopt nothing', async () => {
  const first = (await create({ idToken: 'boss', name: 'A' })).body.schoolId;
  h.fbState.data.users.late = { role: 'student', email: 'late@x.hk' };
  const r = await create({ idToken: 'boss', name: 'B' });
  assert.equal(r.status, 200);
  assert.equal(r.body.adopted, null);
  assert.equal(h.fbState.data.users.late.schoolId, undefined);
  assert.equal(h.fbState.data.users.stu.schoolId, first);
});

test('rename a school', async () => {
  const id = (await create({ idToken: 'boss', name: 'A' })).body.schoolId;
  assert.equal((await rename({ idToken: 'boss', schoolId: id, name: 'A 校' })).status, 200);
  assert.equal(h.fbState.data.schools[id].name, 'A 校');
  assert.equal((await rename({ idToken: 'boss', schoolId: 'nope', name: 'x' })).status, 404);
});

test('a school admin shares their question bank: only their questions change', async () => {
  h.fbState.data.schools = { a: { name: 'A' }, b: { name: 'B' } };
  h.fbState.data.users.adm.schoolId = 'a';
  h.fbState.data.questionBank = {
    q1: { schoolId: 'a', shared: false }, q2: { schoolId: 'a' }, q3: { schoolId: 'b', shared: false },
  };
  let r = await share({ idToken: 'adm', shareQuestionBank: true });
  assert.equal(r.status, 200);
  assert.equal(r.body.updatedQuestions, 2);
  assert.equal(h.fbState.data.schools.a.shareQuestionBank, true);
  assert.equal(h.fbState.data.questionBank.q1.shared, true);
  assert.equal(h.fbState.data.questionBank.q2.shared, true);
  assert.equal(h.fbState.data.questionBank.q3.shared, false);
  r = await share({ idToken: 'adm', shareQuestionBank: false });
  assert.equal(h.fbState.data.questionBank.q1.shared, false);
  assert.equal(h.fbState.data.schools.b.shareQuestionBank, undefined);
});

test('sharing: teachers, students and admins without a school are refused; value must be boolean', async () => {
  h.fbState.data.users.tea.schoolId = 'a';
  assert.equal((await share({ idToken: 'tea', shareQuestionBank: true })).status, 403);
  assert.equal((await share({ idToken: 'adm', shareQuestionBank: true })).status, 400, 'admin without a school');
  h.fbState.data.users.adm.schoolId = 'a';
  assert.equal((await share({ idToken: 'adm', shareQuestionBank: 'yes' })).status, 400);
});

test('/admin/schools is served by the app', async () => {
  h.setSpaIndex('<!doctype html><script src="/assets/x.js"></script>');
  const r = await h.getFallback(app, '/admin/schools');
  assert.equal(r.status, 200);
});

test('adopt (API only): gives a school the documents still without a schoolId', async () => {
  h.fbState.data.schools = { a: { name: 'A' } };
  h.fbState.data.homeworkAssignments = { h1: { title: 'orphan' }, h2: { title: 'B', schoolId: 'b' } };
  assert.equal((await h.post(app, '/api/platform/schools/adopt', { idToken: 'adm', schoolId: 'a' })).status, 403);
  assert.equal((await h.post(app, '/api/platform/schools/adopt', { idToken: 'boss', schoolId: 'nope' })).status, 404);
  const r = await h.post(app, '/api/platform/schools/adopt', { idToken: 'boss', schoolId: 'a' });
  assert.equal(r.status, 200);
  assert.equal(h.fbState.data.homeworkAssignments.h1.schoolId, 'a');
  assert.equal(h.fbState.data.homeworkAssignments.h2.schoolId, 'b', 'other schools untouched');
});

test('sharing settings for a school that no longer exists → 404', async () => {
  h.fbState.data.users.adm.schoolId = 'gone';
  assert.equal((await share({ idToken: 'adm', shareQuestionBank: true })).status, 404);
  assert.equal(h.fbState.data.schools, undefined);
});
