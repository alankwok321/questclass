// Safe maths-expression compiler for graphs: "x^2 - 2x + 1", "2sin(x)", "sqrt(x+1)".
// No eval / new Function — question banks are shared between schools, so the text is untrusted.
//
// Supports: + - * / ^ (also **), brackets, implicit multiplication (2x, 3(x+1), (x+1)(x-1), 2pi),
// constants pi / π / e, and the functions below. A leading "y =" or "f(x) =" is ignored.
// Trig functions use radians; the *d versions (sind, cosd, tand) use degrees.

const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sind: (v) => Math.sin((v * Math.PI) / 180),
  cosd: (v) => Math.cos((v * Math.PI) / 180),
  tand: (v) => Math.tan((v * Math.PI) / 180),
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
  ln: Math.log, log: Math.log10, exp: Math.exp,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
};
const CONSTS = { pi: Math.PI, 'π': Math.PI, e: Math.E };

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i += 1; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw new Error(`無法讀取數字：${src.slice(i, i + 5)}`);
      tokens.push({ t: 'num', v: parseFloat(m[0]) });
      i += m[0].length;
      continue;
    }
    if (c === 'π') { tokens.push({ t: 'id', v: 'π' }); i += 1; continue; }
    if (/[a-zA-Z]/.test(c)) {
      const m = /^[a-zA-Z]+/.exec(src.slice(i))[0];
      // Split runs like "xsin" or "2xy" into known names greedily.
      let rest = m.toLowerCase();
      while (rest) {
        const name = Object.keys(FUNCS).concat(Object.keys(CONSTS), ['x'])
          .filter((n) => rest.startsWith(n))
          .sort((a, b) => b.length - a.length)[0];
        if (!name) throw new Error(`不認識「${rest}」（只可用 x 作變數）`);
        tokens.push({ t: 'id', v: name });
        rest = rest.slice(name.length);
      }
      i += m.length;
      continue;
    }
    if (c === '*' && src[i + 1] === '*') { tokens.push({ t: 'op', v: '^' }); i += 2; continue; }
    if ('+-*/^()'.includes(c)) { tokens.push({ t: 'op', v: c }); i += 1; continue; }
    if (c === '×' || c === '·') { tokens.push({ t: 'op', v: '*' }); i += 1; continue; }
    if (c === '÷') { tokens.push({ t: 'op', v: '/' }); i += 1; continue; }
    if (c === '−') { tokens.push({ t: 'op', v: '-' }); i += 1; continue; }
    throw new Error(`不支援的符號「${c}」`);
  }
  // Insert implicit multiplication: 2x, 2(…), )(, )x, x(…), 2pi, x sin(x)
  const out = [];
  for (const tok of tokens) {
    const prev = out[out.length - 1];
    const prevEnds = prev && (prev.t === 'num' || (prev.t === 'id' && !FUNCS[prev.v]) || (prev.t === 'op' && prev.v === ')'));
    const curStarts = tok.t === 'num' || tok.t === 'id' || (tok.t === 'op' && tok.v === '(');
    if (prevEnds && curStarts) out.push({ t: 'op', v: '*' });
    out.push(tok);
  }
  return out;
}

// Recursive descent → closure tree.
function parse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;

  function expr() { // + -
    let left = term();
    while (isOp('+') || isOp('-')) {
      const op = tokens[pos++].v;
      const a = left; const b = term();
      left = op === '+' ? (x) => a(x) + b(x) : (x) => a(x) - b(x);
    }
    return left;
  }
  function term() { // * /
    let left = unary();
    while (isOp('*') || isOp('/')) {
      const op = tokens[pos++].v;
      const a = left; const b = unary();
      left = op === '*' ? (x) => a(x) * b(x) : (x) => a(x) / b(x);
    }
    return left;
  }
  function unary() { // -x^2 = -(x^2)
    if (isOp('-')) { pos += 1; const a = unary(); return (x) => -a(x); }
    if (isOp('+')) { pos += 1; return unary(); }
    return power();
  }
  function power() { // right-associative
    const base = atom();
    if (isOp('^')) {
      pos += 1;
      const ex = unary();
      return (x) => Math.pow(base(x), ex(x));
    }
    return base;
  }
  function atom() {
    const tok = tokens[pos++];
    if (!tok) throw new Error('算式未完');
    if (tok.t === 'num') { const v = tok.v; return () => v; }
    if (tok.t === 'op' && tok.v === '(') {
      const inner = expr();
      if (!isOp(')')) throw new Error('括號未配對');
      pos += 1;
      return inner;
    }
    if (tok.t === 'id') {
      if (tok.v === 'x') return (x) => x;
      if (tok.v in CONSTS) { const v = CONSTS[tok.v]; return () => v; }
      const fn = FUNCS[tok.v];
      if (fn) {
        // sin x^2 is ambiguous; require sin(…) or sin x (single atom)
        const arg = isOp('(') ? atom() : power();
        return (x) => fn(arg(x));
      }
    }
    throw new Error(`無法理解「${tok.v}」`);
  }

  const f = expr();
  if (pos < tokens.length) throw new Error(`多出了「${tokens[pos].v}」`);
  return f;
}

const cache = new Map();

/** Compile an expression in x. Returns { fn, error }. fn(x) returns NaN when undefined. */
export function compileExpr(raw) {
  const src = String(raw || '').trim().replace(/^(y|f\s*\(\s*x\s*\))\s*=\s*/i, '');
  if (cache.has(src)) return cache.get(src);
  let result;
  try {
    if (!src) throw new Error('請輸入算式');
    const f = parse(tokenize(src));
    result = { fn: (x) => { const v = f(x); return Number.isFinite(v) ? v : NaN; }, error: null };
  } catch (e) {
    result = { fn: null, error: e.message || '算式錯誤' };
  }
  if (cache.size > 500) cache.clear();
  cache.set(src, result);
  return result;
}
