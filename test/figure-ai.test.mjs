import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAiQuestion, cleanAiFigure, figurePromptLines } from '../web/src/figures/aiPrompt.js';

test('figures in media.figures are kept', () => {
  const q = normalizeAiQuestion({ type: 'SHORT_ANSWER', media: { figures: [{ type: 'plot', functions: [{ expr: 'x^2' }] }] } });
  assert.equal(q.media.figures.length, 1);
});

test('figures the AI put elsewhere are moved to media.figures', () => {
  const a = normalizeAiQuestion({ type: 'SHORT_ANSWER', figures: [{ type: 'plot', functions: [{ expr: '2x+1' }] }] });
  assert.equal(a.media.figures[0].type, 'plot');
  assert.equal(a.figures, undefined);
  const b = normalizeAiQuestion({ type: 'SHORT_ANSWER', media: { graph: { functions: [{ expr: 'x' }] } } });
  assert.equal(b.media.figures[0].type, 'plot');
  assert.equal(b.media.graph, undefined);
  const c = normalizeAiQuestion({ type: 'SHORT_ANSWER', media: { figures: { type: 'solid', shape: 'cuboid', a: 3, b: 2, c: 1 } } });
  assert.equal(c.media.figures[0].shape, 'cuboid');
  const d = normalizeAiQuestion({ type: 'SHORT_ANSWER', figure: { type: 'triangle', polygons: [{ vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }] }] } });
  assert.equal(d.media.figures[0].type, 'plot');
});

test('option figures are tidied too', () => {
  const q = normalizeAiQuestion({ type: 'MULTIPLE_CHOICE', options: [{ id: 'A', text: '', graph: { functions: [{ expr: 'x^2-1' }] } }, { id: 'B', text: '2' }] });
  assert.equal(q.options[0].figures[0].type, 'plot');
  assert.equal(q.options[0].graph, undefined);
  assert.equal(q.options[1].figures, undefined);
});

test('broken or empty figures are dropped instead of showing errors', () => {
  assert.equal(cleanAiFigure({ type: 'plot', functions: [{ expr: 'hello world' }] }), null);
  assert.equal(cleanAiFigure({ type: 'unknown-thing' }), null);
  assert.equal(cleanAiFigure('x^2'), null);
  const q = normalizeAiQuestion({ type: 'SHORT_ANSWER', media: { figures: [{ type: 'plot', functions: [{ expr: '(' }] }] } });
  assert.equal(q.media, undefined);
});

test('stats data given as rows becomes text lines', () => {
  const f = cleanAiFigure({ type: 'stats', chart: 'bar', data: [['一', 3], ['二', 5]] });
  assert.equal(f.data, '一, 3\n二, 5');
});

test('prompt modes', () => {
  assert.match(figurePromptLines('always').join('\n'), /每一題都必須/);
  assert.match(figurePromptLines('auto').join('\n'), /必須在該題加上/);
  assert.equal(figurePromptLines('none').length, 1);
});

test('"?" labels from the AI become letters', () => {
  const f = cleanAiFigure({ type: 'plot', axes: false, polygons: [{ vertices: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }], sides: [{ label: '4 cm' }, { label: '?' }, { label: '? cm' }] }], points: [{ x: 0, y: -4, label: '(0, ?)' }] });
  assert.equal(f.polygons[0].sides[1].label, '$x$');
  assert.equal(f.polygons[0].sides[2].label, '$y$ cm');
  assert.equal(f.points[0].label, '(0, $k$)');
  assert.equal(f.polygons[0].sides[0].label, '4 cm');
});
