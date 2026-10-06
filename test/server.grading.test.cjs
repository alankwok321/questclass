'use strict';
// Server-side marking of a student's hand-in (answers come from the staff-only answer key).
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers/server-harness.cjs');

const app = h.loadServer();
const KEY = [
  { id: 'q1', type: 'MULTIPLE_CHOICE', points: 2, question_text: 'Pick', options: [{ id: 'A', text: '4/6', is_correct: true }, { id: 'B', text: '3/4', is_correct: false }] },
  { id: 'q2', type: 'TRUE_FALSE', points: 1, question_text: '3/4 > 2/3', correct_answer: true },
  { id: 'q3', type: 'FILL_IN_BLANK', points: 2, question_text: '[1] + [2]', blanks: [{ position: 1, accepted: ['６'] }, { position: 2, accepted: ['Seven', '7'] }] },
  { id: 'q4', type: 'SHORT_ANSWER', points: 3, question_text: 'Why?', ideal_answer: 'Because of X', grading_rubric: 'Mention X' },
  { id: 'q5', type: 'SHORT_ANSWER', points: 2, question_text: 'Blank one', ideal_answer: 'Y' },
];

beforeEach(() => {
  h.resetAll();
  h.setEnv({ ...h.FIREBASE_ON, OPENROUTER_API_KEY: 'sk-server' });
  h.seedUsers({ stuB: { email: 'b@x.hk', role: 'student', schoolId: 'b' } });
  for (const uid of ['stu', 'stu2', 'tea', 'adm']) h.fbState.data.users[uid].schoolId = 'a';
  h.fbState.data.homeworkAssignments = { hw1: { schoolId: 'a', status: 'published', questions: KEY.map(({ id, type, points, question_text }) => ({ id, type, points, question_text })) } };
  h.fbState.data.homeworkAnswerKeys = { hw1: { schoolId: 'a', questions: KEY } };
  h.fbState.data.submissions = {
    hw1_stu: { schoolId: 'a', assignmentId: 'hw1', studentUid: 'stu', status: 'submitted', answers: [
      { questionId: 'q1', value: 'A' },
      { questionId: 'q2', value: false },
      { questionId: 'q3', value: '6, seven' },
      { questionId: 'q4', value: 'It is because of X.' },
      { questionId: 'q5', value: '' },
    ] },
  };
  h.ai.reply(JSON.stringify({ results: [{ id: 'q4', earned: 2.7, feedback: '答得好' }] }));
});
const grade = (body) => h.post(app, '/api/homework/grade', body);

test('marks objective questions exactly, open ones with AI, and locks the hand-in', async () => {
  const r = await grade({ idToken: 'stu', assignmentId: 'hw1' });
  assert.equal(r.status, 200);
  const by = Object.fromEntries(r.body.results.map((x) => [x.questionId, x]));
  assert.deepEqual([by.q1.earned, by.q1.correct], [2, true]);
  assert.deepEqual([by.q2.earned, by.q2.correct], [0, false]);
  assert.equal(by.q2.correctAnswer, '正確 (True)');
  assert.deepEqual([by.q3.earned, by.q3.correct], [2, true], 'full-width digit and case are normalised');
  assert.deepEqual([by.q4.earned, by.q4.markedBy, by.q4.feedback], [2.5, 'ai', '答得好'], 'AI marks rounded to 0.5, capped');
  assert.deepEqual([by.q5.earned, by.q5.pending], [0, false], 'blank answers get 0 without AI');
  assert.equal(r.body.score, 6.5);
  assert.equal(r.body.maxScore, 10);
  const saved = h.fbState.data.submissions.hw1_stu;
  assert.equal(saved.status, 'graded');
  assert.equal(saved.score, 6.5);
  assert.equal(saved.results.length, 5);
  // The AI saw the open answer and reference, never the objective answers.
  const sent = JSON.stringify(h.ai.last.body);
  assert.match(sent, /Because of X/);
  assert.doesNotMatch(sent, /4\/6/);
});

test('partial credit for fill-in-the-blank', async () => {
  h.fbState.data.submissions.hw1_stu.answers[2].value = '6，8';
  const r = await grade({ idToken: 'stu', assignmentId: 'hw1' });
  const q3 = r.body.results.find((x) => x.questionId === 'q3');
  assert.deepEqual([q3.earned, q3.correct], [1, false]);
});

test('without AI, open answers wait for the teacher', async () => {
  h.setEnv({ ...h.FIREBASE_ON });
  const r = await grade({ idToken: 'stu', assignmentId: 'hw1' });
  const q4 = r.body.results.find((x) => x.questionId === 'q4');
  assert.deepEqual([q4.pending, q4.earned], [true, 0]);
  assert.equal(r.body.pendingReview, true);
  assert.equal(r.body.score, 4);
});

test('grading again returns the saved result (no re-marking)', async () => {
  await grade({ idToken: 'stu', assignmentId: 'hw1' });
  const calls = h.ai.calls.length;
  h.fbState.data.submissions.hw1_stu.answers[0].value = 'B';
  const r = await grade({ idToken: 'stu', assignmentId: 'hw1' });
  assert.equal(r.body.score, 6.5);
  assert.equal(h.ai.calls.length, calls);
});

test('only the student who handed in can have it marked; other schools and roles are refused', async () => {
  assert.equal((await grade({ assignmentId: 'hw1' })).status, 401);
  assert.equal((await grade({ idToken: 'stu2', assignmentId: 'hw1' })).status, 404, 'no hand-in of their own');
  h.fbState.data.submissions.hw1_stuB = { ...h.fbState.data.submissions.hw1_stu, studentUid: 'stuB', schoolId: 'b' };
  assert.equal((await grade({ idToken: 'stuB', assignmentId: 'hw1' })).status, 404, 'homework of another school');
  assert.equal((await grade({ idToken: 'stu', assignmentId: '../x' })).status, 400);
  assert.equal(h.fbState.data.submissions.hw1_stu.status, 'submitted');
});

test('suspended students cannot use it', async () => {
  h.fbState.data.users.stu.accountStatus = 'suspended';
  assert.equal((await grade({ idToken: 'stu', assignmentId: 'hw1' })).status, 403);
});

// ── 作業批改: teacher review ──────────────────────────────────────────────────
const tpost = (path, body) => h.post(app, path, body);

test('teacher sees the full questions (with answers) for marking', async () => {
  h.fbState.data.submissions.hw1_stu.class = '5A';
  const r = await tpost('/api/teacher/submissions/detail', { idToken: 'tea', submissionId: 'hw1_stu' });
  assert.equal(r.status, 200);
  assert.equal(r.body.questions.length, 5);
  const q4 = r.body.questions.find((q) => q.id === 'q4');
  assert.deepEqual([q4.ideal_answer, q4.grading_rubric, q4.points], ['Because of X', 'Mention X', 3]);
  assert.equal(r.body.submission.answers.length, 5);
  assert.equal((await tpost('/api/teacher/submissions/detail', { idToken: 'stu', submissionId: 'hw1_stu' })).status, 403, 'students cannot');
  assert.equal((await tpost('/api/teacher/submissions/detail', { idToken: 'tea', submissionId: '../x' })).status, 400);
});

test('teacher limited to other classes, or from another school, is refused', async () => {
  h.fbState.data.submissions.hw1_stu.class = '5A';
  h.fbState.data.users.tea.teacherClasses = ['6B'];
  assert.equal((await tpost('/api/teacher/submissions/detail', { idToken: 'tea', submissionId: 'hw1_stu' })).status, 403);
  h.fbState.data.users.tea.teacherClasses = ['5a'];
  assert.equal((await tpost('/api/teacher/submissions/detail', { idToken: 'tea', submissionId: 'hw1_stu' })).status, 200, 'class match ignores case');
  h.fbState.data.users.tea.schoolId = 'b';
  assert.equal((await tpost('/api/teacher/submissions/detail', { idToken: 'tea', submissionId: 'hw1_stu' })).status, 404);
});

test('teacher marks the open answers; score is recomputed and the review is done', async () => {
  h.setEnv({ ...h.FIREBASE_ON }); // no AI → q4 waits for the teacher
  await grade({ idToken: 'stu', assignmentId: 'hw1' });
  assert.equal(h.fbState.data.submissions.hw1_stu.pendingReview, true);
  const r = await tpost('/api/teacher/submissions/mark', { idToken: 'tea', submissionId: 'hw1_stu',
    marks: [{ questionId: 'q4', earned: 2.74, feedback: '提到 X，不錯' }, { questionId: 'q1', earned: 99 }], comment: '繼續努力' });
  assert.equal(r.status, 200);
  const saved = h.fbState.data.submissions.hw1_stu;
  const by = Object.fromEntries(saved.results.map((x) => [x.questionId, x]));
  assert.deepEqual([by.q4.earned, by.q4.pending, by.q4.markedBy, by.q4.feedback], [2.5, false, 'teacher', '提到 X，不錯']);
  assert.equal(by.q1.earned, 2, 'capped at the question\'s points');
  assert.equal(saved.score, 2 + 0 + 2 + 2.5 + 0);
  assert.equal(saved.pendingReview, false);
  assert.equal(saved.teacherReviewed, true);
  assert.equal(saved.teacherComment, '繼續努力');
  assert.equal(saved.reviewedBy, 'tea');
});

test('a hand-in that was never marked can be auto-marked by the teacher', async () => {
  const r = await tpost('/api/teacher/submissions/autograde', { idToken: 'adm', submissionId: 'hw1_stu' });
  assert.equal(r.status, 200);
  assert.equal(h.fbState.data.submissions.hw1_stu.status, 'graded');
  assert.equal(r.body.score, 6.5);
});
