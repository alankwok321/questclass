import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileExpr } from '../web/src/lib/mathExpr.js';

const at = (expr, x, deg) => compileExpr(expr, deg).fn(x);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('polynomials, implicit multiplication and y = prefix', () => {
  close(at('x^2-2x-3', 4), 5);
  close(at('y = 2x+1', 3), 7);
  close(at('(x+1)(x-1)', 3), 8);
  close(at('3(x+1)', 1), 6);
  close(at('-x^2', 3), -9);
  close(at('2^-1', 0), 0.5);
  close(at('x**3', 2), 8);
});

test('functions and constants', () => {
  close(at('sqrt(x)+abs(-2)', 9), 5);
  close(at('2sin(x)', Math.PI / 2), 2);
  close(at('sind(x)', 30), 0.5);
  close(at('log(x)', 1000), 3);
  close(at('ln(e)', 0), 1);
  close(at('2pi', 0), 2 * Math.PI);
  close(at('π x', 1), Math.PI);
});

test('degree mode makes sin/cos/tan take degrees', () => {
  close(at('sin(x)', 90, true), 1);
  close(at('cos(x)', 180, true), -1);
});

test('undefined points are NaN, bad input gives an error, no code runs', () => {
  assert.ok(Number.isNaN(at('1/x', 0)));
  assert.ok(Number.isNaN(at('sqrt(x)', -1)));
  for (const bad of ['', 'x+', '(x', 'alert(1)', 'constructor', 'x;1', 'y']) {
    const r = compileExpr(bad);
    assert.equal(r.fn, null, bad);
    assert.ok(r.error, bad);
  }
});
