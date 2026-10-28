import React, { useRef, useState } from 'react';
import MathText, { hasMath } from './MathText.jsx';
import MathGraph, { DEFAULT_GRAPH, GRAPH_COLORS } from './MathGraph.jsx';
import { compileExpr } from '../lib/mathExpr.js';

const inputStyle = {
  width: '100%', padding: '10px 14px',
  border: '1px solid #D2D2D7', borderRadius: 10,
  fontSize: 14, fontWeight: 500, outline: 'none',
  background: '#FFFFFF', fontFamily: 'inherit', color: '#1D1D1F',
  boxSizing: 'border-box',
};
const smallInput = { ...inputStyle, padding: '7px 10px', fontSize: 13 };
const chip = {
  border: '1px solid rgba(0,0,0,0.10)', background: '#fff', color: '#1D1D1F',
  padding: '4px 9px', borderRadius: 8, fontSize: 13, cursor: 'pointer', lineHeight: 1.3,
  minWidth: 32, fontFamily: 'inherit',
};
const ghostBtn = {
  border: 0, background: '#E3E3E8', color: '#1D1D1F',
  padding: '7px 14px', borderRadius: 999, fontWeight: 500, fontSize: 12,
  cursor: 'pointer', whiteSpace: 'nowrap',
};

// Buttons insert LaTeX at the cursor. `sel` = where the cursor lands inside the snippet.
const SNIPPETS = [
  { label: '$x$', title: '數學式 (行內)', tex: '$$', sel: 1, raw: true },
  { label: 'a/b', title: '分數', tex: '\\frac{}{}', sel: 6 },
  { label: '√', title: '開方', tex: '\\sqrt{}', sel: 6 },
  { label: 'ⁿ√', title: 'n 次方根', tex: '\\sqrt[3]{}', sel: 9 },
  { label: 'xⁿ', title: '次方', tex: '^{}', sel: 2 },
  { label: 'x₁', title: '下標', tex: '_{}', sel: 2 },
  { label: '×', tex: '\\times ' },
  { label: '÷', tex: '\\div ' },
  { label: '±', tex: '\\pm ' },
  { label: '≤', tex: '\\le ' },
  { label: '≥', tex: '\\ge ' },
  { label: '≠', tex: '\\ne ' },
  { label: '≈', tex: '\\approx ' },
  { label: 'π', tex: '\\pi ' },
  { label: 'θ', tex: '\\theta ' },
  { label: '°', title: '度', tex: '^\\circ ' },
  { label: '∠', tex: '\\angle ' },
  { label: '△', tex: '\\triangle ' },
  { label: '≅', tex: '\\cong ' },
  { label: '∼', title: '相似', tex: '\\sim ' },
  { label: '∥', tex: '\\parallel ' },
  { label: '⊥', tex: '\\perp ' },
  { label: 'x̄', title: '平均數', tex: '\\bar{}', sel: 5 },
  { label: '( )', title: '自動大小括號', tex: '\\left(  \\right)', sel: 7 },
];

/** Is position `pos` inside $…$ ? (count unescaped single $ before it) */
function insideMath(text, pos) {
  let n = 0;
  for (let i = 0; i < pos; i += 1) {
    if (text[i] === '\\') { i += 1; continue; }
    if (text[i] === '$') n += 1;
  }
  return n % 2 === 1;
}

/**
 * Text input with a LaTeX toolbar and live preview.
 * Toolbar snippets are wrapped in $…$ automatically when the cursor isn't already in maths.
 */
export function MathField({ value, onChange, multiline = false, placeholder, minHeight = 100, toolbar = true, style }) {
  const ref = useRef(null);
  const [focused, setFocused] = useState(false);
  const text = String(value ?? '');

  function insert(sn) {
    const el = ref.current;
    const start = el ? el.selectionStart : text.length;
    const end = el ? el.selectionEnd : text.length;
    const chosen = text.slice(start, end);
    let snippet = sn.tex;
    let caret = sn.sel ?? snippet.length;
    if (chosen && sn.sel != null) {
      // Put the selected text into the first {} slot.
      snippet = snippet.slice(0, sn.sel) + chosen + snippet.slice(sn.sel);
      caret = sn.sel + chosen.length;
    }
    if (!sn.raw && !insideMath(text, start)) {
      snippet = `$${snippet.trimEnd()}$`;
      caret += 1;
    }
    const next = text.slice(0, start) + snippet + text.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + caret, start + caret);
    });
  }

  const Tag = multiline ? 'textarea' : 'input';
  const showPreview = hasMath(text);

  return (
    <div style={{ display: 'grid', gap: 6, ...style }}>
      {toolbar && (multiline || focused) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }} onMouseDown={(e) => e.preventDefault()}>
          {SNIPPETS.map((sn) => (
            <button key={sn.label} type="button" style={chip} title={sn.title || sn.tex.trim()} onClick={() => insert(sn)}>
              {sn.label}
            </button>
          ))}
        </div>
      )}
      <Tag
        ref={ref}
        value={text}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value)}
        style={multiline ? { ...inputStyle, minHeight, resize: 'vertical', fontFamily: 'inherit' } : inputStyle}
      />
      {showPreview && (
        <div style={{
          background: '#F5F5F7', borderRadius: 10, padding: '8px 12px',
          fontSize: 15, fontWeight: 500, color: '#1D1D1F', lineHeight: 1.6,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#86868B', marginBottom: 2 }}>預覽</div>
          <MathText as="div" text={text} style={{ whiteSpace: 'pre-wrap' }} />
        </div>
      )}
    </div>
  );
}

export function MathHelp() {
  return (
    <details style={{ fontSize: 12, color: '#6E6E73', fontWeight: 500 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>數學式寫法（KaTeX / LaTeX）</summary>
      <div style={{ marginTop: 6, lineHeight: 1.8 }}>
        用 <code>$…$</code> 包住數學式，例如 <code>{'$\\frac{3}{4}x^2 - \\sqrt{5}$'}</code> → <MathText text={'$\\frac{3}{4}x^2 - \\sqrt{5}$'} />。<br />
        獨立一行置中：<code>$$…$$</code>。真正的金錢符號寫 <code>\$</code>，或像 <code>$5</code> 這樣直接寫（後面是數字的 $ 不會當作數學式）。<br />
        常用：<code>{'\\frac{a}{b}'}</code> 分數、<code>{'x^{2}'}</code> 次方、<code>{'\\sqrt{x}'}</code> 開方、<code>{'\\angle ABC'}</code>、<code>{'\\triangle ABC \\cong \\triangle DEF'}</code>、<code>{'30^\\circ'}</code>。
      </div>
    </details>
  );
}

// ── Graph editor ──────────────────────────────────────────────────────────────
function NumInput({ value, onChange, placeholder, width = 64 }) {
  return (
    <input
      type="number" step="any" value={value ?? ''} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      style={{ ...smallInput, width }}
    />
  );
}

function ColorPick({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {GRAPH_COLORS.map((c) => (
        <button key={c} type="button" aria-label={c} onClick={() => onChange(c)} style={{
          width: 18, height: 18, borderRadius: 999, background: c, cursor: 'pointer', padding: 0,
          border: value === c ? '2px solid #fff' : '2px solid transparent',
          boxShadow: value === c ? `0 0 0 2px ${c}` : 'none',
        }} />
      ))}
    </div>
  );
}

const rowBox = { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', background: '#FAFAFC', borderRadius: 10, padding: '8px 10px' };
const removeBtn = { ...ghostBtn, padding: '5px 10px', color: '#D70015', marginLeft: 'auto' };
const sub = { fontSize: 12, fontWeight: 700, color: '#6E6E73' };

/** Edits question.media.graph. `graph` null = no graph. */
export function GraphEditor({ graph, onChange }) {
  if (!graph) {
    return (
      <button type="button" style={{ ...ghostBtn, justifySelf: 'start' }} onClick={() => onChange({ ...DEFAULT_GRAPH, functions: [{ expr: '', color: GRAPH_COLORS[0], label: '' }] })}>
        📈 加入座標圖
      </button>
    );
  }
  const g = graph;
  const set = (patch) => onChange({ ...g, ...patch });
  const setList = (key, i, patch) => set({ [key]: (g[key] || []).map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const removeFrom = (key, i) => set({ [key]: (g[key] || []).filter((_, j) => j !== i) });
  const functions = g.functions || [];
  const points = g.points || [];
  const segments = g.segments || [];

  return (
    <div style={{ border: '1px solid rgba(0,0,0,0.10)', borderRadius: 14, padding: 14, display: 'grid', gap: 14, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#1D1D1F' }}>📈 座標圖</div>
        <button type="button" style={removeBtn} onClick={() => onChange(null)}>移除圖像</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
          {/* Window */}
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={sub}>範圍</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: '#6E6E73' }}>
              <NumInput value={g.xMin} onChange={(v) => set({ xMin: v })} /> ≤ x ≤ <NumInput value={g.xMax} onChange={(v) => set({ xMax: v })} />
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: '#6E6E73' }}>
              <NumInput value={g.yMin} onChange={(v) => set({ yMin: v })} /> ≤ y ≤ <NumInput value={g.yMax} onChange={(v) => set({ yMax: v })} />
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: '#6E6E73' }}>
              <label style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                <input type="checkbox" checked={g.grid !== false} onChange={(e) => set({ grid: e.target.checked })} /> 格線
              </label>
              <span>軸名</span>
              <input value={g.xLabel ?? 'x'} onChange={(e) => set({ xLabel: e.target.value })} style={{ ...smallInput, width: 54 }} />
              <input value={g.yLabel ?? 'y'} onChange={(e) => set({ yLabel: e.target.value })} style={{ ...smallInput, width: 54 }} />
            </div>
          </div>

          {/* Functions */}
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={sub}>函數 y = …（例如 <code>x^2-2x-3</code>、<code>2x+1</code>、<code>sqrt(x)</code>、<code>1/x</code>、<code>sind(x)</code> 用度）</div>
            {functions.map((f, i) => {
              const err = String(f.expr || '').trim() ? compileExpr(f.expr).error : null;
              return (
                <div key={i} style={{ ...rowBox, borderLeft: `3px solid ${f.color || GRAPH_COLORS[i % GRAPH_COLORS.length]}` }}>
                  <span style={{ fontSize: 13, color: '#6E6E73', fontStyle: 'italic' }}>y =</span>
                  <input value={f.expr || ''} placeholder="x^2 - 1" onChange={(e) => setList('functions', i, { expr: e.target.value })}
                    style={{ ...smallInput, flex: '1 1 120px', width: 'auto', borderColor: err ? '#D70015' : '#D2D2D7' }} />
                  <input value={f.label || ''} placeholder="標籤 (可用 $…$)" onChange={(e) => setList('functions', i, { label: e.target.value })}
                    style={{ ...smallInput, flex: '1 1 100px', width: 'auto' }} />
                  <ColorPick value={f.color || GRAPH_COLORS[i % GRAPH_COLORS.length]} onChange={(c) => setList('functions', i, { color: c })} />
                  <label style={{ fontSize: 12, color: '#6E6E73', display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input type="checkbox" checked={!!f.dashed} onChange={(e) => setList('functions', i, { dashed: e.target.checked })} /> 虛線
                  </label>
                  <span style={{ fontSize: 12, color: '#6E6E73' }}>x 由</span>
                  <NumInput value={f.from} placeholder="—" width={56} onChange={(v) => setList('functions', i, { from: v })} />
                  <span style={{ fontSize: 12, color: '#6E6E73' }}>至</span>
                  <NumInput value={f.to} placeholder="—" width={56} onChange={(v) => setList('functions', i, { to: v })} />
                  <button type="button" style={removeBtn} onClick={() => removeFrom('functions', i)}>×</button>
                  {err && <div style={{ width: '100%', color: '#D70015', fontSize: 12, fontWeight: 600 }}>{err}</div>}
                </div>
              );
            })}
            <button type="button" style={{ ...ghostBtn, justifySelf: 'start' }}
              onClick={() => set({ functions: [...functions, { expr: '', color: GRAPH_COLORS[functions.length % GRAPH_COLORS.length], label: '' }] })}>
              ＋ 函數
            </button>
          </div>

          {/* Points */}
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={sub}>點</div>
            {points.map((p, i) => (
              <div key={i} style={rowBox}>
                <span style={{ fontSize: 13, color: '#6E6E73' }}>(</span>
                <NumInput value={p.x} onChange={(v) => setList('points', i, { x: v })} placeholder="x" width={58} />
                <span style={{ fontSize: 13, color: '#6E6E73' }}>,</span>
                <NumInput value={p.y} onChange={(v) => setList('points', i, { y: v })} placeholder="y" width={58} />
                <span style={{ fontSize: 13, color: '#6E6E73' }}>)</span>
                <input value={p.label || ''} placeholder="標籤，例如 A" onChange={(e) => setList('points', i, { label: e.target.value })}
                  style={{ ...smallInput, flex: '1 1 80px', width: 'auto' }} />
                <label style={{ fontSize: 12, color: '#6E6E73', display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input type="checkbox" checked={!!p.open} onChange={(e) => setList('points', i, { open: e.target.checked })} /> 空心
                </label>
                <button type="button" style={removeBtn} onClick={() => removeFrom('points', i)}>×</button>
              </div>
            ))}
            <button type="button" style={{ ...ghostBtn, justifySelf: 'start' }}
              onClick={() => set({ points: [...points, { x: 0, y: 0, label: String.fromCharCode(65 + points.length) }] })}>
              ＋ 點
            </button>
          </div>

          {/* Segments */}
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={sub}>線段（例如三角形的邊、垂直線 x = 2）</div>
            {segments.map((s, i) => (
              <div key={i} style={rowBox}>
                <span style={{ fontSize: 13, color: '#6E6E73' }}>(</span>
                <NumInput value={s.x1} onChange={(v) => setList('segments', i, { x1: v })} width={52} />,
                <NumInput value={s.y1} onChange={(v) => setList('segments', i, { y1: v })} width={52} />
                <span style={{ fontSize: 13, color: '#6E6E73' }}>) → (</span>
                <NumInput value={s.x2} onChange={(v) => setList('segments', i, { x2: v })} width={52} />,
                <NumInput value={s.y2} onChange={(v) => setList('segments', i, { y2: v })} width={52} />
                <span style={{ fontSize: 13, color: '#6E6E73' }}>)</span>
                <label style={{ fontSize: 12, color: '#6E6E73', display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input type="checkbox" checked={!!s.dashed} onChange={(e) => setList('segments', i, { dashed: e.target.checked })} /> 虛線
                </label>
                <button type="button" style={removeBtn} onClick={() => removeFrom('segments', i)}>×</button>
              </div>
            ))}
            <button type="button" style={{ ...ghostBtn, justifySelf: 'start' }}
              onClick={() => set({ segments: [...segments, { x1: 0, y1: 0, x2: 1, y2: 1 }] })}>
              ＋ 線段
            </button>
          </div>
        </div>

        <div style={{ minWidth: 0, position: 'sticky', top: 0 }}>
          <div style={{ ...sub, marginBottom: 6 }}>預覽</div>
          <MathGraph graph={g} maxWidth={420} />
        </div>
      </div>
    </div>
  );
}
