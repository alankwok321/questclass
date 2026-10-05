// Real dashboard / report statistics (web/src/services/analytics.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const src = fs.readFileSync(new URL('../web/src/services/analytics.js', import.meta.url), 'utf8');
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qc-an-')), 'analytics.mjs');
fs.writeFileSync(tmp, src);
const { analyzeClass } = await import(tmp);

const NOW = Date.parse('2026-10-05T12:00:00Z');
const day = 86400000;
const students = [{ uid: 'a', name: 'Ada' }, { uid: 'b', name: 'Ben' }, { uid: 'c', name: 'Cat' }];
const homework = [
  { id: 'h1', status: 'published', targetType: 'class', targetClass: '5a', dueAt: new Date(NOW - 3 * day).toISOString(), createdAt: new Date(NOW - 5 * day).toISOString(), title: 'H1',
    questions: [{ id: 'q1', topic: '分數' }, { id: 'q2', topic: '小數' }] },
  { id: 'h2', status: 'published', targetType: 'all', dueAt: new Date(NOW + 2 * day).toISOString(), createdAt: new Date(NOW - 1 * day).toISOString(), title: 'H2',
    questions: [{ id: 'q1', topic: '分數' }] },
  { id: 'h3', status: 'published', targetType: 'class', targetClass: '6B', title: 'other class' },
  { id: 'h4', status: 'draft', targetType: 'all', title: 'draft' },
  { id: 'h5', status: 'published', targetType: 'students', targetStudentUids: ['c'], dueAt: new Date(NOW - day).toISOString(), title: 'just Cat' },
];
const submissions = [
  { assignmentId: 'h1', studentUid: 'a', score: 9, maxScore: 10, submittedAt: new Date(NOW - 4 * day).toISOString(),
    results: [{ questionId: 'q1', earned: 5, points: 5 }, { questionId: 'q2', earned: 4, points: 5 }] },
  { assignmentId: 'h1', studentUid: 'b', score: 4, maxScore: 10, submittedAt: new Date(NOW - 2 * day).toISOString(),
    results: [{ questionId: 'q1', earned: 1, points: 5 }, { questionId: 'q2', earned: 3, points: 5 }] },
  { assignmentId: 'h2', studentUid: 'b', score: 2, maxScore: 5, submittedAt: new Date(NOW - 1 * day).toISOString(),
    results: [{ questionId: 'q1', earned: 2, points: 5 }] },
  { assignmentId: 'h3', studentUid: 'a', score: 1, maxScore: 1 }, // not this class's homework
];
const data = { cls: '5A', students, homework, submissions };

test('only published homework for this class (or everyone / chosen students) counts', () => {
  const r = analyzeClass(data, { now: NOW });
  assert.deepEqual(r.homework.map((h) => h.id), ['h1', 'h5', 'h2']);
  assert.deepEqual(r.homework.map((h) => h.assigned), [3, 1, 3]);
});

test('completion, average, missing work and who needs attention', () => {
  const r = analyzeClass(data, { now: NOW });
  assert.equal(r.totals.assigned, 7);
  assert.equal(r.totals.handedIn, 3);
  assert.equal(r.completion, 43);
  assert.equal(r.avg, Math.round((90 + 40 + 40) / 3));
  const by = Object.fromEntries(r.students.map((s) => [s.uid, s]));
  assert.deepEqual([by.a.done, by.a.assigned, by.a.missing, by.a.avg], [1, 2, 0, 90]);
  assert.deepEqual([by.b.done, by.b.missing, by.b.avg], [2, 0, 40]);
  assert.deepEqual([by.c.done, by.c.missing, by.c.avg], [0, 2, null], 'Cat missed the two homework already due');
  assert.deepEqual(r.attention.map((s) => s.uid), ['c', 'b']);
  assert.deepEqual(by.b.reasons, ['平均 40%']);
  assert.equal(by.a.needsAttention, false);
});

test('topic accuracy per class and the weakest topic per student', () => {
  const r = analyzeClass(data, { now: NOW });
  const t = Object.fromEntries(r.topics.map((x) => [x.topic, x]));
  assert.equal(t['分數'].pct, Math.round((5 + 1 + 2) / 15 * 100));
  assert.equal(t['小數'].pct, 70);
  const b = r.students.find((s) => s.uid === 'b');
  assert.equal(b.weakest.topic, '分數');
});

test('period filter: only homework set since the start of the period', () => {
  const r = analyzeClass(data, { now: NOW, since: NOW - 2 * day });
  // h1 was set 5 days ago (out); h5 has no creation date so its due date (1 day ago) counts (in).
  assert.deepEqual(r.homework.map((h) => h.id), ['h5', 'h2']);
});

test('recent hand-ins are the last 7 days, newest first, with the student', () => {
  const r = analyzeClass(data, { now: NOW });
  assert.deepEqual(r.recent.map((s) => `${s.assignmentId}:${s.studentUid}`), ['h2:b', 'h1:b', 'h1:a']);
  assert.equal(r.recent[0].student.name, 'Ben');
  assert.equal(r.recent[0].pct, 40);
});
