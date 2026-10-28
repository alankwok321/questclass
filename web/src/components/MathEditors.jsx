import React, { useRef, useState } from 'react';
import MathText, { RichText, hasMath } from './MathText.jsx';

const inputStyle = {
  width: '100%', padding: '10px 14px',
  border: '1px solid #D2D2D7', borderRadius: 10,
  fontSize: 14, fontWeight: 500, outline: 'none',
  background: '#FFFFFF', fontFamily: 'inherit', color: '#1D1D1F',
  boxSizing: 'border-box',
};
const chip = {
  border: '1px solid rgba(0,0,0,0.10)', background: '#fff', color: '#1D1D1F',
  padding: '4px 9px', borderRadius: 8, fontSize: 13, cursor: 'pointer', lineHeight: 1.3,
  minWidth: 32, fontFamily: 'inherit',
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
  { label: '⊞ 表格', title: '插入表格', tex: '\n| 分數 | 0–9 | 10–19 | 20–29 |\n|---|---|---|---|\n| 頻數 | 3 | 8 | 5 |\n', raw: true, block: true },
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
  const showPreview = hasMath(text) || /^\s*\|/m.test(text);

  return (
    <div style={{ display: 'grid', gap: 6, ...style }}>
      {toolbar && (multiline || focused) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }} onMouseDown={(e) => e.preventDefault()}>
          {SNIPPETS.filter((sn) => multiline || !sn.block).map((sn) => (
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
          <RichText text={text} />
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
        表格：每行以 <code>|</code> 開始，例如 <code>| 分數 | 10–19 | 20–29 |</code>，第二行寫 <code>|---|---|---|</code> 則第一行為標題。<br />
        常用：<code>{'\\frac{a}{b}'}</code> 分數、<code>{'x^{2}'}</code> 次方、<code>{'\\sqrt{x}'}</code> 開方、<code>{'\\angle ABC'}</code>、<code>{'\\triangle ABC \\cong \\triangle DEF'}</code>、<code>{'30^\\circ'}</code>。
      </div>
    </details>
  );
}
