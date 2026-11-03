import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  unitsFor, subjectsFor, withCurriculum, questionSubject, questionUnit, matchSubject, matchUnit, tagAiQuestion, curriculumPromptLines, unitInfo,
} from '../web/src/curriculum/hk.js';

test('maths units follow the CDC lists for each stage', () => {
  assert.equal(unitsFor('MATH', 'S2').length, 32);
  assert.equal(unitInfo('MATH.J25').en, "Pythagoras' theorem");
  assert.equal(unitsFor('MATH', 'S5').filter((u) => u.key.startsWith('MATH.S')).length, 19);
  assert.equal(unitsFor('MATH', 'S5').filter((u) => u.key.startsWith('MATH.M1-')).length, 20);
  assert.equal(unitsFor('MATH', 'S5').filter((u) => u.key.startsWith('MATH.M2-')).length, 17);
  assert.equal(unitsFor('MATH', 'P4').length, 5);
  assert.deepEqual(unitsFor('HIST', 'S4'), []);
  assert.ok(subjectsFor('P3').some((s) => s.key === 'GS'));
  assert.ok(!subjectsFor('P3').some((s) => s.key === 'PHY'));
});

test('tags: set, replace, clear; other tags kept; unit must belong to subject', () => {
  let q = { tags: ['homework', 'subj:ENG'] };
  q = withCurriculum(q, { subject: 'MATH', unit: 'MATH.J25' });
  assert.deepEqual(q.tags, ['homework', 'subj:MATH', 'unit:MATH.J25']);
  assert.equal(questionSubject(q), 'MATH');
  assert.equal(questionUnit(q), 'MATH.J25');
  q = withCurriculum(q, { subject: 'PHY' });
  assert.deepEqual(q.tags, ['homework', 'subj:PHY']);
  q = withCurriculum(q, { subject: '', unit: '' });
  assert.deepEqual(q.tags, ['homework']);
  assert.equal(questionSubject({}), '');
});

test('matching names from Excel / AI', () => {
  assert.equal(matchSubject('數學'), 'MATH');
  assert.equal(matchSubject('Maths'), 'MATH');
  assert.equal(matchSubject('Physics'), 'PHY');
  assert.equal(matchSubject('nonsense'), '');
  assert.equal(matchUnit('畢氏定理', 'MATH', 'S2'), 'MATH.J25');
  assert.equal(matchUnit("Pythagoras' theorem", 'MATH'), 'MATH.J25');
  assert.equal(matchUnit('25', 'MATH', 'S2'), 'MATH.J25');
  assert.equal(matchUnit('MATH.S11', 'MATH'), 'MATH.S11');
  assert.equal(matchUnit('圓的基本性質', 'MATH', 'S4'), 'MATH.S11');
  assert.equal(matchUnit('xyz', 'MATH'), '');
});

test('AI output: teacher choice wins; otherwise a valid AI unit/subject is used', () => {
  const a = tagAiQuestion({ question_text: 'x', unit: 'MATH.J7' }, { subject: 'MATH', unit: 'MATH.J25', level: 'S2' });
  assert.equal(questionUnit(a), 'MATH.J25');
  assert.equal(a.unit, undefined);
  const b = tagAiQuestion({ question_text: 'x', unit: 'MATH.J8' }, { subject: 'MATH', level: 'S1' });
  assert.equal(questionUnit(b), 'MATH.J8');
  const c = tagAiQuestion({ question_text: 'x', subject: 'CHEM' }, {});
  assert.equal(questionSubject(c), 'CHEM');
  assert.equal(questionUnit(c), '');
  const d = tagAiQuestion({ question_text: 'x', unit: 'made up' }, { subject: 'MATH', level: 'S1' });
  assert.deepEqual(d.tags, ['subj:MATH']);
});

test('prompt lines', () => {
  assert.match(curriculumPromptLines('MATH', 'MATH.J25', 'S2')[0], /畢氏定理/);
  assert.match(curriculumPromptLines('MATH', '', 'S2').join(''), /MATH\.J25=畢氏定理/);
  assert.match(curriculumPromptLines('', '', 'S2').join(''), /"subject"/);
});
