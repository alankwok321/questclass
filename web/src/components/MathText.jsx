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
