import React from 'react';
import MathText from './MathText.jsx';
import MathGraph, { graphIsEmpty } from './MathGraph.jsx';

export function questionGraph(q) {
  const g = q?.media?.graph;
  return g && !graphIsEmpty(g) ? g : null;
}

/** Question text with maths, followed by the question's graph (if any). */
export default function QuestionStem({ q, text, style, placeholder = '（未填寫題目）', graphWidth = 420 }) {
  const t = text ?? (q?.question_text || q?.prompt || '');
  const graph = questionGraph(q);
  return (
    <>
      <MathText as="div" text={t || placeholder} style={{ whiteSpace: 'pre-wrap', ...style, ...(t ? null : { color: '#86868B' }) }} />
      {graph ? <MathGraph graph={graph} maxWidth={graphWidth} style={{ marginTop: 10 }} /> : null}
    </>
  );
}
