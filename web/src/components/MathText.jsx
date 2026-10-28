import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

// Text with LaTeX maths. Delimiters:
//   $…$   or \(…\)   inline maths
//   $$…$$ or \[…\]   display maths (centred on its own line)
//   \$               a literal dollar sign
// A single "$" only opens maths when the next character isn't a space, and only closes
// when the previous one isn't a space and the next isn't a digit — so "$5 and $10" stays text.

export function splitMath(input) {
  const s = String(input ?? '');
  const parts = [];
  let buf = '';
  let i = 0;
  const pushText = () => { if (buf) { parts.push({ type: 'text', value: buf }); buf = ''; } };

  while (i < s.length) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === '$') { buf += '$'; i += 2; continue; }

    if (c === '\\' && (s[i + 1] === '(' || s[i + 1] === '[')) {
      const close = s[i + 1] === '(' ? '\\)' : '\\]';
      const end = s.indexOf(close, i + 2);
      if (end !== -1) {
        pushText();
        parts.push({ type: 'math', display: s[i + 1] === '[', value: s.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }

    if (c === '$' && s[i + 1] === '$') {
      const end = s.indexOf('$$', i + 2);
      if (end !== -1 && s.slice(i + 2, end).trim()) {
        pushText();
        parts.push({ type: 'math', display: true, value: s.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }

    if (c === '$' && s[i + 1] && !/\s/.test(s[i + 1])) {
      let j = i + 1;
      let end = -1;
      while (j < s.length) {
        if (s[j] === '\\') { j += 2; continue; }
        if (s[j] === '\n' && s[j + 1] === '\n') break; // never span paragraphs
        if (s[j] === '$' && s[j + 1] === '$') break;   // never run into display maths
        if (s[j] === '$' && !/\s/.test(s[j - 1]) && !/\d/.test(s[j + 1] || '')) { end = j; break; }
        j += 1;
      }
      const body = end !== -1 ? s.slice(i + 1, end) : '';
      // "$5 和 $10": money, not maths — a $ followed by a digit whose "maths" holds Chinese text.
      const looksLikeMoney = /\d/.test(s[i + 1]) && /[^\x00-\x7F]/.test(body); // eslint-disable-line no-control-regex
      if (end !== -1 && !looksLikeMoney) {
        pushText();
        parts.push({ type: 'math', display: false, value: body });
        i = end + 1;
        continue;
      }
    }

    buf += c;
    i += 1;
  }
  pushText();
  return parts;
}

export function hasMath(text) {
  return splitMath(text).some((p) => p.type === 'math');
}

const htmlCache = new Map();
function renderTex(tex, display) {
  const key = (display ? 'D' : 'I') + tex;
  if (htmlCache.has(key)) return htmlCache.get(key);
  let html;
  try {
    html = katex.renderToString(tex, { displayMode: display, throwOnError: true, strict: 'ignore', trust: false, output: 'htmlAndMathml' });
  } catch {
    // Show the source in red so the teacher can see what to fix.
    html = katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: 'ignore', trust: false, errorColor: '#D70015' });
  }
  if (htmlCache.size > 2000) htmlCache.clear();
  htmlCache.set(key, html);
  return html;
}

/**
 * Renders text with $…$ maths.
 * - `inline`: render display maths inline too (for one-line lists / ellipsis rows).
 * - `as`: wrapper element (default span).
 */
export default function MathText({ text, inline = false, as: Tag = 'span', style, className }) {
  const parts = useMemo(() => splitMath(text), [text]);
  if (!parts.some((p) => p.type === 'math')) {
    return <Tag style={style} className={className}>{String(text ?? '')}</Tag>;
  }
  return (
    <Tag style={style} className={className}>
      {parts.map((p, i) => {
        if (p.type === 'text') return <React.Fragment key={i}>{p.value}</React.Fragment>;
        const display = p.display && !inline;
        return (
          <span
            key={i}
            className={display ? 'qcMath qcMathDisplay' : 'qcMath'}
            style={display ? { display: 'block', overflowX: 'auto', overflowY: 'hidden', padding: '2px 0' } : undefined}
            dangerouslySetInnerHTML={{ __html: renderTex(p.value, display) }}
          />
        );
      })}
    </Tag>
  );
}

// ── Text blocks with tables ───────────────────────────────────────────────────
// Lines that start with "|" form a table:  | 分數 | 10–19 | 20–29 |  (a |---| line is optional;
// with one, the first row is a header).
function splitBlocks(text) {
  const lines = String(text ?? '').split('\n');
  const blocks = [];
  let buf = [];
  let table = null;
  const flushText = () => { if (buf.length) { blocks.push({ type: 'text', value: buf.join('\n') }); buf = []; } };
  const flushTable = () => { if (table) { blocks.push({ type: 'table', rows: table }); table = null; } };
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('|') && t.length > 1) {
      flushText();
      if (!table) table = [];
      table.push(t);
    } else {
      flushTable();
      buf.push(line);
    }
  }
  flushTable(); flushText();
  return blocks;
}

function Table({ rows }) {
  const cells = (r) => r.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const sepIdx = rows.findIndex((r) => /^\|?\s*:?-{2,}/.test(r.replace(/\s/g, '')));
  const head = sepIdx === 1 ? cells(rows[0]) : null;
  const body = rows.filter((_, i) => i !== sepIdx && !(head && i === 0)).map(cells);
  const td = { border: '1px solid #C7C7CC', padding: '5px 10px', textAlign: 'center', fontWeight: 500 };
  return (
    <div style={{ overflowX: 'auto', margin: '6px 0' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: '0.95em', background: '#fff' }}>
        {head && <thead><tr>{head.map((c, i) => <th key={i} style={{ ...td, background: '#F2F2F7', fontWeight: 700 }}><MathText text={c} /></th>)}</tr></thead>}
        <tbody>{body.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={td}><MathText text={c} /></td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/** Multi-line question text: maths plus "| … |" tables. */
export function RichText({ text, style, className }) {
  const blocks = useMemo(() => splitBlocks(text), [text]);
  if (!blocks.some((b) => b.type === 'table')) {
    return <MathText as="div" text={text} style={{ whiteSpace: 'pre-wrap', ...style }} className={className} />;
  }
  return (
    <div style={style} className={className}>
      {blocks.map((b, i) => (b.type === 'table'
        ? <Table key={i} rows={b.rows} />
        : <MathText key={i} as="div" text={b.value.replace(/^\n+|\n+$/g, '')} style={{ whiteSpace: 'pre-wrap' }} />))}
    </div>
  );
}
