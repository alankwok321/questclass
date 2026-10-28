import React from 'react';
import { RichText } from './MathText.jsx';
import { QuestionFigures } from '../figures/Figure.jsx';
import { questionFigures } from '../figures/model.js';

/** True when the question has at least one figure (graph, diagram, chart…). */
export function questionGraph(q) {
  return questionFigures(q).length > 0;
}

/** Question text (maths + tables) followed by the question's figures. */
export default function QuestionStem({ q, text, style, placeholder = '（未填寫題目）', graphWidth = 420 }) {
  const t = text ?? (q?.question_text || q?.prompt || '');
  return (
    <>
      <RichText text={t || placeholder} style={{ ...style, ...(t ? null : { color: '#86868B' }) }} />
      <QuestionFigures q={q} maxWidth={graphWidth} />
    </>
  );
}
