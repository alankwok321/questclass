import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBridge, TS } from './helpers/bridge-harness.mjs';

// Everyone and everything below belongs to school A unless noted.
const inA = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { schoolId: 'A', ...v }]));
const users = () => inA({
  stu1: { role: 'student', name: 'Ada', class: '5A' },
  stu2: { role: 'student', name: 'Ben', class: ' 6b ' },
  stu3: { role: 'student', name: 'Cat' },
  t1: { role: 'teacher', name: 'T1' },
  t2: { role: 'Teacher', name: 'T2' },
  adm: { role: 'admin', name: 'Boss' },
  par: { role: 'parent', name: 'Mrs Wong', childUids: ['stu1', 'ghost'] },
  par0: { role: 'parent', name: 'No kids' },
  stuB: { role: 'student', name: 'Bea', class: '5A', schoolId: 'B' },
  tB: { role: 'teacher', name: 'TB', schoolId: 'B' },
});
const homework = () => inA({
  h1: { status: 'published', targetType: 'class', targetClass: '5a', createdAt: '2026-01-02', title: 'H1' },
  h2: { status: 'published', targetType: 'class', targetClass: '6B', createdAt: '2026-01-01', title: 'H2' },
  h3: { status: 'published', targetType: 'students', targetStudentUids: ['stu1'], createdAt: '2026-01-03', title: 'H3' },
  h4: { status: 'draft', targetType: 'all', createdAt: '2026-01-09', createdBy: 't2', title: 'H4 draft' },
  h5: { status: 'published', targetType: 'all', createdAt: '2026-01-04', createdBy: 't1', title: 'H5' },
  h6: { status: 'published', createdAt: '2026-01-05', title: 'H6 no targetType' },
  h7: { status: 'published', targetType: 'class', targetClass: '', createdAt: '2026-01-06', title: 'H7 empty class' },
  hB: { status: 'published', targetType: 'all', createdAt: '2026-01-07', title: 'school B', schoolId: 'B' },
});
const ids = (items) => items.map((i) => i.id);

// --- listMyHomework ---
test('listMyHomework: student via class (case-insensitive) + own + all, newest first, drafts and other schools excluded', async () => {
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

test('listMyHomework: no profile / no school gets nothing; signed out is refused', async () => {
  let b = makeBridge({ users: {}, homeworkAssignments: homework() }, { uid: 'nobody' });
  assert.deepEqual((await b.fb.listMyHomework()).items, []);
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
  assert.ok(q.cons.some((c) => c.type === 'where' && c.field === 'schoolId' && c.value === 'A'), 'scoped to my school');
});

test('listMyHomework: a student of school B only sees school B homework', async () => {
  const b = makeBridge({ users: users(), homeworkAssignments: homework() }, { uid: 'stuB' });
  assert.deepEqual(ids((await b.fb.listMyHomework()).items), ['hB']);
});

// --- getMyChildrenOverview ---
const parentStore = () => ({
  users: users(),
  homeworkAssignments: homework(),
  submissions: inA({
    s1: { studentUid: 'stu1', assignmentId: 'h1', score: 80, submittedAt: '2026-01-03' },
    s3: { studentUid: 'stu1', assignmentId: 'h3', submittedAt: '2026-01-05' },
    s2: { studentUid: 'stu2', assignmentId: 'h2', submittedAt: '2026-01-04' },
  }),
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

test('_ensureProfile: a new profile is a student awaiting approval, with only basic fields', async () => {
  const b = makeBridge({ users: {} }, { uid: 'n1' });
  const out = await b.fb._ensureProfile({ uid: 'n1', email: 'mr.teacher@gmail.com', displayName: 'Mr T' }, null);
  const w = b.writes[0];
  assert.equal(w.path, 'users/n1');
  assert.equal(w.data.role, 'student');
  assert.equal(w.data.accountStatus, 'review');
  assert.deepEqual(w.data.createdAt, TS);
  assert.equal(w.data.name, 'Mr T');
  assert.deepEqual(Object.keys(w.data).sort(), ['accountStatus', 'createdAt', 'email', 'lastLoginAt', 'name', 'photoURL', 'role', 'updatedAt']);
  assert.equal(out.role, 'student');
});

test('joinSchool: a new account sets only its school', async () => {
  const b = makeBridge({ users: { n1: { role: 'student', accountStatus: 'review' } } }, { uid: 'n1' });
  const r = await b.fb.joinSchool('A');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(b.writes[0].data).sort(), ['schoolId', 'updatedAt']);
  assert.equal(b.writes[0].data.schoolId, 'A');
  assert.equal((await b.fb.joinSchool('')).ok, false);
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

test('adminUpdateUserAccount: class is trimmed, invalid role ignored, unknown status → active, no old fields', async () => {
  const b = makeBridge({ users: users() }, { uid: 'adm' });
  await b.fb.adminUpdateUserAccount('stu3', { role: 'superuser', accountStatus: 'banned', class: ' 5B ', classroomIds: '5A', adminNote: 'x' });
  const w = b.writes[0].data;
  assert.ok(!('role' in w));
  assert.equal(w.accountStatus, 'active');
  assert.equal(w.class, '5B');
  assert.ok(!('classroomIds' in w) && !('adminNote' in w) && !('childUids' in w));
});

test('adminUpdateUserAccount: only the platform admin may move someone to another school', async () => {
  let b = makeBridge({ users: users() }, { uid: 'adm' });
  await b.fb.adminUpdateUserAccount('stu3', { role: 'student', schoolId: 'B' });
  assert.ok(!('schoolId' in b.writes[0].data), 'school admin cannot');
  b = makeBridge({ users: { ...users(), boss: { role: 'admin', platformAdmin: true, schoolId: 'A' } } }, { uid: 'boss' });
  await b.fb.adminUpdateUserAccount('stu3', { role: 'student', schoolId: 'B' });
  assert.equal(b.writes[0].data.schoolId, 'B');
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
  const w = b.writes.find((x) => x.path.startsWith('homeworkAssignments/'));
  assert.equal(w.path, `homeworkAssignments/${r.assignmentId}`);
  assert.equal(w.data.id, r.assignmentId);
  assert.equal(w.data.createdBy, 't1');
  assert.equal(w.data.schoolId, 'A');
  assert.equal(b.writes.find((x) => x.path.startsWith('homeworkAnswerKeys/')).data.schoolId, 'A');
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
  assert.ok(!('createdAt' in b.writes.find((x) => x.path.startsWith('homeworkAssignments/')).data));
  assert.ok(!('createdBy' in b.writes.find((x) => x.path.startsWith('homeworkAssignments/')).data));
  assert.equal(b.writes.find((x) => x.path.startsWith('homeworkAssignments/')).path, 'homeworkAssignments/h5');
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

test('createHomeworkAssignment: a teacher cannot edit another school\'s homework', async () => {
  const b = makeBridge({ users: users(), homeworkAssignments: homework() }, { uid: 'tB' });
  const r = await b.fb.createHomeworkAssignment({ id: 'h5', title: 'x' });
  assert.equal(r.ok, false);
  assert.equal(b.writes.length, 0);
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
  schools: { A: { name: 'School A', shareQuestionBank: true }, B: { name: 'School B' } },
  questionBank: {
    ...inA({
      q1: { id: 'q1', deleted: true, createdBy: 't1' },
      q2: { id: 'q2', createdBy: 't1', question_text: 'A' },
      q3: { id: 'q3', createdBy: 't2', question_text: 'B' },
      q4: { id: 'q4', question_text: 'legacy, no owner' },
    }),
    q5: { id: 'q5', schoolId: 'B', shared: true, createdBy: 'tB', question_text: 'shared by B' },
    q6: { id: 'q6', schoolId: 'B', shared: false, createdBy: 'tB', question_text: 'private to B' },
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
  assert.equal(w.schoolId, 'A');
  assert.equal(w.shared, true, 'follows the school\'s sharing setting');
});

test('upsertQuestionBankItem: a shared question from another school cannot be edited', async () => {
  const b = makeBridge(qbStore(), { uid: 't1' });
  const r = await b.fb.upsertQuestionBankItem({ id: 'q5', question_text: 'hijack' });
  assert.equal(r.ok, false);
  assert.match(r.error, /其他學校/);
  assert.equal(b.writes.length, 0);
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
  assert.deepEqual(ids(r.items).sort(), ['q2', 'q3', 'q4', 'q5'], 'own school + shared from others; not B\'s private one');
  const q5 = r.items.find((i) => i.id === 'q5');
  assert.equal(q5.readOnly, true);
  assert.equal(q5.sharedFromSchool, 'School B');
  assert.ok(!r.items.find((i) => i.id === 'q2').readOnly);
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
  const store = { users: { ...users(), stu1: { ...users().stu1, studentProfile: { mastery: 60 } }, stu4: { role: 'student', name: 'Dee', class: '5A', schoolId: 'A', studentProfile: { mastery: 90 } } } };
  const b = makeBridge(store, { uid: 't1' });
  const r = await b.fb.getTeacherDashboard();
  assert.equal(r.ok, true);
  assert.equal(r.classroom.id, '5A');
  assert.deepEqual(r.students.map((s) => s.uid).sort(), ['stu1', 'stu4'], 'not school B\'s 5A');
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
  assert.ok(!r.users.some((u) => u.uid === 'stuB'), 'only my school');
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
  assert.equal(b.writes[0].data.class, '5A');
  assert.equal(b.writes[0].data.schoolId, 'A');
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

// --- answer keys kept out of student-readable homework ---
const fullQuestions = () => ([
  { id: 'q1', type: 'MULTIPLE_CHOICE', question_text: 'Pick', options: [{ id: 'A', text: '4/6', is_correct: true }, { id: 'B', text: '3/4', is_correct: false }], points: 2 },
  { id: 'q2', type: 'TRUE_FALSE', question_text: '3/4 > 2/3', correct_answer: true },
  { id: 'q3', type: 'FILL_IN_BLANK', question_text: '[____]', blanks: [{ position: 1, accepted: ['6'] }] },
  { id: 'q4', type: 'SHORT_ANSWER', question_text: 'Why?', ideal_answer: 'Because', grading_rubric: 'r' },
  { id: 'q5', type: 'MATCHING', question_text: 'Match', pairs: [{ prompt: '1/2', match: '50%' }, { prompt: '1/4', match: '25%' }] },
]);
const leaks = (qs) => JSON.stringify(qs).match(/is_correct|correct_answer|accepted|ideal_answer|grading_rubric|"match"/g);

test('saving homework: students\' copy has no answers; the full set goes to the answer key', async () => {
  const b = makeBridge({ users: users() }, { uid: 't1' });
  const r = await b.fb.createHomeworkAssignment({ title: 'Fractions', questions: fullQuestions(), status: 'published' });
  assert.equal(r.ok, true);
  const key = b.writes.find((w) => w.path.startsWith('homeworkAnswerKeys/'));
  const hw = b.writes.find((w) => w.path.startsWith('homeworkAssignments/'));
  assert.ok(key && hw, 'both documents written');
  assert.ok(b.writes.indexOf(key) < b.writes.indexOf(hw), 'answer key is written first');
  assert.equal(key.data.questions[0].options[0].is_correct, true);
  assert.equal(leaks(hw.data.questions), null, 'no answer fields in the student-readable doc');
  assert.deepEqual(hw.data.questions[0].options.map((o) => o.text), ['4/6', '3/4']);
  assert.deepEqual(hw.data.questions[4].pairs, [{ prompt: '1/2' }, { prompt: '1/4' }]);
  assert.deepEqual([...hw.data.questions[4].matchOptions].sort(), ['25%', '50%']);
  assert.ok(!JSON.stringify(hw.data).includes('undefined'));
});

test('staff list shows the full questions from the answer key', async () => {
  const b = makeBridge({
    users: users(),
    homeworkAssignments: inA({ hx: { status: 'published', createdBy: 't1', createdAt: '1', questions: [{ id: 'q2', type: 'TRUE_FALSE', question_text: 'x' }] } }),
    homeworkAnswerKeys: inA({ hx: { questions: [{ id: 'q2', type: 'TRUE_FALSE', question_text: 'x', correct_answer: false }] } }),
  }, { uid: 't1' });
  const r = await b.fb.listHomeworkAssignments();
  assert.equal(r.items[0].questions[0].correct_answer, false);
  assert.equal(r.migrated, 0);
});

test('older homework with answers inside is moved into an answer key by its owner or an admin', async () => {
  const store = () => ({
    users: users(),
    homeworkAssignments: inA({
      own: { status: 'published', createdBy: 't1', createdAt: '2', questions: fullQuestions() },
      other: { status: 'published', createdBy: 't2', createdAt: '1', questions: fullQuestions() },
    }),
  });
  const t = makeBridge(store(), { uid: 't1' });
  const r = await t.fb.listHomeworkAssignments();
  assert.equal(r.migrated, 1, 'teacher migrates only their own');
  const pub = t.writes.find((w) => w.path === 'homeworkAssignments/own');
  assert.equal(leaks(pub.data.questions), null);
  assert.ok(t.writes.some((w) => w.path === 'homeworkAnswerKeys/own'));
  assert.ok(!t.writes.some((w) => w.path.endsWith('/other')));
  assert.equal(r.items.find((i) => i.id === 'own').questions[1].correct_answer, true, 'teacher still sees answers');

  const a = makeBridge(store(), { uid: 'adm' });
  assert.equal((await a.fb.listHomeworkAssignments()).migrated, 2, 'admin migrates everything');
});

test('students never receive answers in their homework list', async () => {
  const t = makeBridge({ users: users() }, { uid: 't1' });
  await t.fb.createHomeworkAssignment({ title: 'Q', questions: fullQuestions(), status: 'published', targetType: 'all' });
  const stored = t.writes.find((w) => w.path.startsWith('homeworkAssignments/'));
  const s = makeBridge({ users: users(), homeworkAssignments: { [stored.path.split('/')[1]]: stored.data } }, { uid: 'stu1' });
  const r = await s.fb.listMyHomework();
  assert.equal(r.items.length, 1);
  assert.equal(leaks(r.items[0].questions), null);
});

test('hand-ins after the deadline are refused', async () => {
  const past = '2020-01-01T08:00';
  const b = makeBridge({ users: users(), homeworkAssignments: inA({ late: { status: 'published', targetType: 'all', dueAt: past, title: 'L' } }) }, { uid: 'stu1' });
  const r = await b.fb.submitHomework({ assignmentId: 'late', answers: [] });
  assert.equal(r.ok, false);
  assert.match(r.error, /截止/);
  assert.equal(b.writes.length, 0);
});

// --- platform admin: school switcher ---
test('platform admin works in the school picked in the switcher', async () => {
  const saved = {};
  const b = makeBridge({ users: { ...users(), boss: { role: 'admin', platformAdmin: true } }, homeworkAssignments: homework() }, { uid: 'boss' });
  b.window.localStorage = { getItem: (k) => saved[k] ?? null, setItem: (k, v) => { saved[k] = v; }, removeItem: (k) => { delete saved[k]; } };
  {
    let r = await b.fb.listHomeworkAssignments();
    assert.equal(r.ok, false, 'no school picked yet');
    b.fb.setActiveSchool('B');
    r = await b.fb.listHomeworkAssignments();
    assert.deepEqual(ids(r.items), ['hB']);
    b.fb.setActiveSchool('A');
    const c = await b.fb.createHomeworkAssignment({ title: 'by platform admin' });
    assert.equal(c.ok, true);
    assert.equal(b.writes.find((w) => w.path.startsWith('homeworkAssignments/')).data.schoolId, 'A');
    b.fb.setActiveSchool('');
    assert.equal(b.fb.getActiveSchool(), '');
  }
});

test('the switcher does nothing for a school admin', async () => {
  const b = makeBridge({ users: users(), homeworkAssignments: homework() }, { uid: 'adm' });
  assert.equal(b.fb._withActiveSchool({ role: 'admin', schoolId: 'A' }).schoolId, 'A');
});

test('submitHomework: marked homework cannot be handed in again', async () => {
  const b = makeBridge({ users: users(), homeworkAssignments: homework(), submissions: { h1_stu1: { schoolId: 'A', status: 'graded', studentUid: 'stu1' } } }, { uid: 'stu1' });
  const r = await b.fb.submitHomework({ assignmentId: 'h1', answers: [] });
  assert.equal(r.ok, false);
  assert.match(r.error, /已批改/);
  assert.equal(b.writes.length, 0);
});

test('the Google account photo is used (and kept up to date) for the signed-in user', async () => {
  const b = makeBridge({ users: users() }, { uid: 't1' });
  const u = b.fb._normalizeUser({ uid: 't1', email: 't@x.hk', photoURL: 'https://lh3.googleusercontent.com/new' }, { role: 'teacher', photoURL: 'https://old' });
  assert.equal(u.photoURL, 'https://lh3.googleusercontent.com/new');
  await b.fb._ensureProfile({ uid: 't1', email: 't@x.hk', photoURL: 'https://lh3.googleusercontent.com/new' }, { id: 't1', ...users().t1, photoURL: 'https://old' });
  assert.equal(b.writes[0].data.photoURL, 'https://lh3.googleusercontent.com/new');
});

test('student lists carry each student\'s photo', async () => {
  const store = { users: { ...users(), stu1: { ...users().stu1, photoURL: 'https://p/1' } }, submissions: { s1: { schoolId: 'A', studentUid: 'stu1', assignmentId: 'h1' } } };
  const b = makeBridge(store, { uid: 't1' });
  const cls = await b.fb.listStudentsForClassroom('5A');
  assert.equal(cls.students.find((s) => s.uid === 'stu1').photoURL, 'https://p/1');
  const subs = await b.fb.listSubmissionsForAssignment('h1');
  assert.equal(subs.submissions[0].studentPhotoURL, 'https://p/1');
});
