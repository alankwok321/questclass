import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBridge, TS } from './helpers/bridge-harness.mjs';

const users = () => ({
  stu1: { role: 'student', name: 'Ada', classroomIds: ['5A'], class: '' },
  stu2: { role: 'student', name: 'Ben', class: ' 6b ' },
  stu3: { role: 'student', name: 'Cat' },
  t1: { role: 'teacher', name: 'T1', classroomIds: ['5A'] },
  t2: { role: 'Teacher', name: 'T2' },
  adm: { role: 'admin', name: 'Boss' },
  par: { role: 'parent', name: 'Mrs Wong', childUids: ['stu1', 'ghost'] },
  par0: { role: 'parent', name: 'No kids' },
});
const homework = () => ({
  h1: { status: 'published', targetType: 'class', targetClass: '5a', createdAt: '2026-01-02', title: 'H1' },
  h2: { status: 'published', targetType: 'class', targetClass: '6B', createdAt: '2026-01-01', title: 'H2' },
  h3: { status: 'published', targetType: 'students', targetStudentUids: ['stu1'], createdAt: '2026-01-03', title: 'H3' },
  h4: { status: 'draft', targetType: 'all', createdAt: '2026-01-09', createdBy: 't2', title: 'H4 draft' },
  h5: { status: 'published', targetType: 'all', createdAt: '2026-01-04', createdBy: 't1', title: 'H5' },
  h6: { status: 'published', createdAt: '2026-01-05', title: 'H6 no targetType' },
  h7: { status: 'published', targetType: 'class', targetClass: '', createdAt: '2026-01-06', title: 'H7 empty class' },
});
const ids = (items) => items.map((i) => i.id);

// --- listMyHomework ---
test('listMyHomework: student via classroomIds (case-insensitive) + own + all, newest first, drafts excluded', async () => {
  const b = makeBridge({ users: users(), homeworkAssignments: homework() }, { uid: 'stu1' });
  const r = await b.fb.listMyHomework();
  assert.equal(r.ok, true);
  assert.deepEqual(ids(r.items), ['h6', 'h5', 'h3', 'h1']);
});

test('listMyHomework: class matched via the `class` field (trimmed, case-insensitive)', async () => {
  const b = makeBridge({ users: users(), homeworkAssignments: homework() }, { uid: 'stu2' });
  const r = await b.fb.listMyHomework();
  assert.deepEqual(ids(r.items), ['h6', 'h5', 'h2']);
});

test('listMyHomework: student with no class only gets "all" homework', async () => {
  const b = makeBridge({ users: users(), homeworkAssignments: homework() }, { uid: 'stu3' });
  assert.deepEqual(ids((await b.fb.listMyHomework()).items), ['h6', 'h5']);
});

test('listMyHomework: missing profile still works; signed out is refused', async () => {
  let b = makeBridge({ users: {}, homeworkAssignments: homework() }, { uid: 'nobody' });
  assert.deepEqual(ids((await b.fb.listMyHomework()).items), ['h6', 'h5']);
  b = makeBridge({ users: users(), homeworkAssignments: homework() }, { uid: null });
  const r = await b.fb.listMyHomework();
  assert.equal(r.ok, false);
  assert.deepEqual(r.items, []);
});

test('listMyHomework queries only published homework', async () => {
  const b = makeBridge({ users: users(), homeworkAssignments: homework() }, { uid: 'stu1' });
  await b.fb.listMyHomework();
  const q = b.queries.find((x) => x.col === 'homeworkAssignments');
  assert.ok(q.cons.some((c) => c.type === 'where' && c.field === 'status' && c.op === '==' && c.value === 'published'));
});

// --- getMyChildrenOverview ---
const parentStore = () => ({
  users: users(),
  homeworkAssignments: homework(),
  submissions: {
    s1: { studentUid: 'stu1', assignmentId: 'h1', score: 80, submittedAt: '2026-01-03' },
    s3: { studentUid: 'stu1', assignmentId: 'h3', submittedAt: '2026-01-05' },
    s2: { studentUid: 'stu2', assignmentId: 'h2', submittedAt: '2026-01-04' },
  },
});

test('getMyChildrenOverview: parent sees only linked children (missing child skipped)', async () => {
  const b = makeBridge(parentStore(), { uid: 'par' });
  const r = await b.fb.getMyChildrenOverview();
  assert.equal(r.ok, true);
  assert.deepEqual(r.children.map((c) => c.uid), ['stu1']);
  const ada = r.children[0];
  assert.equal(ada.name, 'Ada');
  assert.deepEqual(ids(ada.homework), ['h6', 'h5', 'h3', 'h1'], "uses the child's classes, not the parent's");
  assert.deepEqual(ids(ada.submissions), ['s3', 's1'], "only the child's submissions, newest first");
});

test('getMyChildrenOverview: parent with no children gets an empty list', async () => {
  const b = makeBridge(parentStore(), { uid: 'par0' });
  assert.deepEqual(await b.fb.getMyChildrenOverview(), { ok: true, children: [] });
});

for (const who of ['stu1', 't1', 'nobody']) {
  test(`getMyChildrenOverview: ${who} is refused`, async () => {
    const b = makeBridge(parentStore(), { uid: who });
    const r = await b.fb.getMyChildrenOverview();
    assert.equal(r.ok, false);
    assert.match(r.error, /家長/);
    assert.deepEqual(r.children, []);
    assert.ok(!b.queries.some((q) => q.col === 'submissions'));
  });
}

// --- _ensureProfile ---
test('_ensureProfile: existing profile only writes photoURL/lastLoginAt/updatedAt (merge)', async () => {
  const b = makeBridge({ users: users() }, { uid: 't1' });
  const out = await b.fb._ensureProfile({ uid: 't1', email: 'teacher@x.hk', displayName: 'T', photoURL: 'p.png' }, { id: 't1', ...users().t1 });
  assert.equal(b.writes.length, 1);
  assert.equal(b.writes[0].path, 'users/t1');
  assert.deepEqual(Object.keys(b.writes[0].data).sort(), ['lastLoginAt', 'photoURL', 'updatedAt']);
  assert.deepEqual(b.writes[0].opts, { merge: true });
  assert.equal(b.writes[0].data.photoURL, 'p.png');
  assert.equal(out.role, 'teacher');
});

test('_ensureProfile: new profile is a student; "teacher" in email only sets requestedRole', async () => {
  const b = makeBridge({ users: {} }, { uid: 'n1' });
  const out = await b.fb._ensureProfile({ uid: 'n1', email: 'mr.teacher@gmail.com', displayName: 'Mr T' }, null);
  const w = b.writes[0];
  assert.equal(w.path, 'users/n1');
  assert.equal(w.data.role, 'student');
  assert.equal(w.data.requestedRole, 'teacher');
  assert.deepEqual(w.data.createdAt, TS);
  assert.equal(w.data.name, 'Mr T');
  assert.equal(out.role, 'student');
});

test('_ensureProfile: new profile without "teacher" in email has no requestedRole', async () => {
  const b = makeBridge({ users: {} }, { uid: 'n2' });
  await b.fb._ensureProfile({ uid: 'n2', email: 'kid@gmail.com' }, null);
  assert.equal(b.writes[0].data.role, 'student');
  assert.equal(b.writes[0].data.requestedRole, '');
  assert.equal(b.writes[0].data.name, 'kid');
});

test('_normalizeUser: role from profile is lower-cased; missing profile → student', () => {
  const b = makeBridge({});
  assert.equal(b.fb._normalizeUser({ uid: 'x', email: 'teacher@x' }, { role: ' Teacher ' }).role, 'teacher');
  assert.equal(b.fb._normalizeUser({ uid: 'x', email: 'teacher@x' }, null).role, 'student');
});

// --- adminUpdateUserAccount ---
test('adminUpdateUserAccount: admin sets parent role with deduped, trimmed childUids', async () => {
  const b = makeBridge({ users: users() }, { uid: 'adm' });
  const r = await b.fb.adminUpdateUserAccount('par0', { role: 'parent', accountStatus: 'active', childUids: ['stu1', ' stu1 ', 'stu2', '', ' ', null] });
  assert.equal(r.ok, true);
  const w = b.writes[0];
  assert.equal(w.path, 'users/par0');
  assert.equal(w.data.role, 'parent');
  assert.deepEqual(w.data.childUids, ['stu1', 'stu2']);
  assert.deepEqual(w.opts, { merge: true });
});

test('adminUpdateUserAccount: classroomIds from string, invalid role ignored, unknown status → active', async () => {
  const b = makeBridge({ users: users() }, { uid: 'adm' });
  await b.fb.adminUpdateUserAccount('stu3', { role: 'superuser', accountStatus: 'banned', classroomIds: '5A, 6B ,' });
  const w = b.writes[0].data;
  assert.ok(!('role' in w));
  assert.equal(w.accountStatus, 'active');
  assert.deepEqual(w.classroomIds, ['5A', '6B']);
  assert.ok(!('childUids' in w));
});

for (const who of ['t1', 'stu1', 'par']) {
  test(`adminUpdateUserAccount: ${who} is refused and nothing is written`, async () => {
    const b = makeBridge({ users: users() }, { uid: who });
    const r = await b.fb.adminUpdateUserAccount('stu1', { role: 'admin' });
    assert.equal(r.ok, false);
    assert.equal(b.writes.length, 0);
  });
}

// --- createHomeworkAssignment ---
test('createHomeworkAssignment: new homework gets createdBy/createdAt and an auto id', async () => {
  const b = makeBridge({ users: users(), homeworkAssignments: homework() }, { uid: 't1' });
  const r = await b.fb.createHomeworkAssignment({ title: ' New ', targetType: 'class', targetClass: '5A', targetStudentUids: ['x'] });
  assert.equal(r.ok, true);
  assert.equal(r.updated, false);
  const w = b.writes[0];
  assert.equal(w.path, `homeworkAssignments/${r.assignmentId}`);
  assert.equal(w.data.id, r.assignmentId);
  assert.equal(w.data.createdBy, 't1');
  assert.deepEqual(w.data.createdAt, TS);
  assert.equal(w.data.title, 'New');
  assert.equal(w.data.targetClass, '5A');
  assert.deepEqual(w.data.targetStudentUids, [], 'student list only kept for targetType students');
});

test('createHomeworkAssignment: editing own homework does not resend createdBy/createdAt', async () => {
  const b = makeBridge({ users: users(), homeworkAssignments: homework() }, { uid: 't1' });
  const r = await b.fb.createHomeworkAssignment({ id: 'h5', title: 'edit', createdAt: '2020-01-01', createdBy: 'evil' });
  assert.equal(r.ok, true);
  assert.equal(r.updated, true);
  assert.ok(!('createdAt' in b.writes[0].data));
  assert.ok(!('createdBy' in b.writes[0].data));
  assert.equal(b.writes[0].path, 'homeworkAssignments/h5');
});

test('createHomeworkAssignment: non-owner teacher gets a clear error and nothing is written', async () => {
  const b = makeBridge({ users: users(), homeworkAssignments: homework() }, { uid: 't1' });
  const r = await b.fb.createHomeworkAssignment({ id: 'h4', title: 'x' });
  assert.equal(r.ok, false);
  assert.match(r.error, /只有建立/);
  assert.equal(b.writes.length, 0);
});

test('createHomeworkAssignment: admin can edit another teacher\'s homework', async () => {
  const b = makeBridge({ users: users(), homeworkAssignments: homework() }, { uid: 'adm' });
  const r = await b.fb.createHomeworkAssignment({ id: 'h4', title: 'fixed by admin' });
  assert.equal(r.ok, true);
  assert.ok(!('createdBy' in b.writes[0].data));
});

test('createHomeworkAssignment: teacher role with capital letters is accepted', async () => {
  const b = makeBridge({ users: users(), homeworkAssignments: homework() }, { uid: 't2' });
  assert.equal((await b.fb.createHomeworkAssignment({ id: 'h4', title: 'mine' })).ok, true);
});

for (const who of ['stu1', 'par']) {
  test(`createHomeworkAssignment: ${who} is refused`, async () => {
    const b = makeBridge({ users: users(), homeworkAssignments: homework() }, { uid: who });
    const r = await b.fb.createHomeworkAssignment({ title: 'x' });
    assert.equal(r.ok, false);
    assert.equal(b.writes.length, 0);
  });
}

// --- upsertQuestionBankItem / listQuestionBank ---
const qbStore = () => ({
  users: users(),
  questionBank: {
    q1: { id: 'q1', deleted: true, createdBy: 't1' },
    q2: { id: 'q2', createdBy: 't1', question_text: 'A' },
    q3: { id: 'q3', createdBy: 't2', question_text: 'B' },
    q4: { id: 'q4', question_text: 'legacy, no owner' },
  },
});

test('upsertQuestionBankItem: new item gets createdBy/createdAt', async () => {
  const b = makeBridge(qbStore(), { uid: 't1' });
  const r = await b.fb.upsertQuestionBankItem({ prompt: '1+1=?', type: 'SHORT_ANSWER' });
  assert.equal(r.ok, true);
  const w = b.writes[0].data;
  assert.equal(w.createdBy, 't1');
  assert.deepEqual(w.createdAt, TS);
  assert.equal(w.question_text, '1+1=?');
  assert.equal(w.prompt, '1+1=?');
  assert.equal(w.deleted, false);
});

test('upsertQuestionBankItem: owner update does not resend createdBy/createdAt', async () => {
  const b = makeBridge(qbStore(), { uid: 't1' });
  const r = await b.fb.upsertQuestionBankItem({ id: 'q2', question_text: 'A2' });
  assert.equal(r.ok, true);
  assert.equal(r.updated, true);
  assert.ok(!('createdBy' in b.writes[0].data) && !('createdAt' in b.writes[0].data));
});

test('upsertQuestionBankItem: non-owner teacher gets a clear error', async () => {
  const b = makeBridge(qbStore(), { uid: 't1' });
  const r = await b.fb.upsertQuestionBankItem({ id: 'q3', question_text: 'hijack' });
  assert.equal(r.ok, false);
  assert.match(r.error, /只有建立/);
  assert.equal(b.writes.length, 0);
});

test('upsertQuestionBankItem: admin can edit others\' questions', async () => {
  const b = makeBridge(qbStore(), { uid: 'adm' });
  const r = await b.fb.upsertQuestionBankItem({ id: 'q3', question_text: 'fixed' });
  assert.equal(r.ok, true);
  assert.ok(!('createdBy' in b.writes[0].data));
});

test('upsertQuestionBankItem: soft delete by owner', async () => {
  const b = makeBridge(qbStore(), { uid: 't1' });
  await b.fb.upsertQuestionBankItem({ id: 'q2', deleted: true });
  assert.equal(b.writes[0].data.deleted, true);
});

test('upsertQuestionBankItem: students refused', async () => {
  const b = makeBridge(qbStore(), { uid: 'stu1' });
  assert.equal((await b.fb.upsertQuestionBankItem({ prompt: 'x' })).ok, false);
  assert.equal(b.writes.length, 0);
});

test('listQuestionBank hides deleted items', async () => {
  const b = makeBridge(qbStore(), { uid: 't1' });
  const r = await b.fb.listQuestionBank();
  assert.equal(r.ok, true);
  assert.deepEqual(ids(r.items).sort(), ['q2', 'q3', 'q4']);
});

test('listQuestionBank refuses students', async () => {
  const b = makeBridge(qbStore(), { uid: 'stu1' });
  const r = await b.fb.listQuestionBank();
  assert.equal(r.ok, false);
  assert.deepEqual(r.items, []);
});

// --- getTeacherDashboard ---
for (const who of ['stu1', 'par']) {
  test(`getTeacherDashboard refuses ${who} with a clear message`, async () => {
    const b = makeBridge({ users: users() }, { uid: who });
    const r = await b.fb.getTeacherDashboard();
    assert.equal(r.ok, false);
    assert.match(r.error, /老師/);
    assert.equal(b.queries.length, 0);
  });
}

test('getTeacherDashboard: teacher sees students of their first class and metrics', async () => {
  const store = { users: { ...users(), stu1: { ...users().stu1, studentProfile: { mastery: 60 } }, stu4: { role: 'student', name: 'Dee', classroomIds: ['5A'], studentProfile: { mastery: 90 } } } };
  const b = makeBridge(store, { uid: 't1' });
  const r = await b.fb.getTeacherDashboard();
  assert.equal(r.ok, true);
  assert.equal(r.classroom.id, '5A');
  assert.deepEqual(r.students.map((s) => s.uid).sort(), ['stu1', 'stu4']);
  assert.equal(r.metrics.find((m) => m.label === '平均掌握度').value, '75%');
  assert.equal(r.metrics.find((m) => m.label === '需關注學生').value, '1 人');
});

// --- submitHomework ---
test('submitHomework writes a deterministic id assignmentId_uid', async () => {
  const b = makeBridge({ users: users(), homeworkAssignments: homework() }, { uid: 'stu1' });
  const r = await b.fb.submitHomework({ assignmentId: ' h1 ', answers: [{ q: 1, a: 'x' }] });
  assert.equal(r.ok, true);
  assert.equal(r.submissionId, 'h1_stu1');
  const w = b.writes[0];
  assert.equal(w.path, 'submissions/h1_stu1');
  assert.equal(w.data.id, 'h1_stu1');
  assert.equal(w.data.studentUid, 'stu1');
  assert.equal(w.data.assignmentTitle, 'H1');
  assert.deepEqual(w.data.answers, [{ q: 1, a: 'x' }]);
  // Resubmitting overwrites the same document.
  await b.fb.submitHomework({ assignmentId: 'h1', answers: [] });
  assert.equal(b.writes[1].path, 'submissions/h1_stu1');
});

test('submitHomework: missing id or unknown assignment is refused', async () => {
  const b = makeBridge({ users: users(), homeworkAssignments: homework() }, { uid: 'stu1' });
  assert.equal((await b.fb.submitHomework({})).ok, false);
  assert.equal((await b.fb.submitHomework({ assignmentId: 'nope' })).ok, false);
  assert.equal(b.writes.length, 0);
});

// --- misc ---
test('listUsers is admin-only', async () => {
  let b = makeBridge({ users: users() }, { uid: 't1' });
  assert.equal((await b.fb.listUsers()).ok, false);
  b = makeBridge({ users: users() }, { uid: 'adm' });
  const r = await b.fb.listUsers();
  assert.equal(r.ok, true);
  assert.ok(r.users.some((u) => u.uid === 'par'));
});

test('listSubmissionsForAssignment: staff only, enriched with student names', async () => {
  const store = parentStore();
  let b = makeBridge(store, { uid: 'stu1' });
  assert.equal((await b.fb.listSubmissionsForAssignment('h1')).ok, false);
  b = makeBridge(store, { uid: 't1' });
  const r = await b.fb.listSubmissionsForAssignment('h1');
  assert.equal(r.ok, true);
  assert.deepEqual(r.submissions.map((s) => [s.id, s.studentName]), [['s1', 'Ada']]);
});

// --- review fixes (2026-10-05) ---
test('submitHomework records the student\'s class for the teacher dashboard', async () => {
  const b = makeBridge({ users: users(), homeworkAssignments: homework() }, { uid: 'stu1' });
  const r = await b.fb.submitHomework({ assignmentId: 'h1', answers: [] });
  assert.equal(r.ok, true);
  assert.equal(b.writes[0].data.classroomId, '5A');
  assert.ok(!('score' in b.writes[0].data) && !('feedback' in b.writes[0].data));
});

test('submitHomework refuses drafts and homework not assigned to the student', async () => {
  const b = makeBridge({ users: users(), homeworkAssignments: homework() }, { uid: 'stu1' });
  assert.equal((await b.fb.submitHomework({ assignmentId: 'h4' })).ok, false, 'draft');
  assert.equal((await b.fb.submitHomework({ assignmentId: 'h2' })).ok, false, 'other class');
  assert.equal(b.writes.length, 0);
  const other = makeBridge({ users: users(), homeworkAssignments: homework() }, { uid: 'stu2' });
  assert.equal((await other.fb.submitHomework({ assignmentId: 'h2' })).ok, true, 'own class (6b vs 6B)');
});
