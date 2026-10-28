import React from 'react';
import PlotFigure from './PlotFigure.jsx';
import SolidFigure from './SolidFigure.jsx';
import StatsFigure from './StatsFigure.jsx';
import { ImageFigure, NumberLineFigure, TreeFigure, VennFigure } from './OtherFigures.jsx';
import { figureIsEmpty, questionFigures } from './model.js';
import MathText from '../components/MathText.jsx';

const SIZES = { S: 0.7, M: 1, L: 1.3 };

export default function Figure({ fig, maxWidth = 440 }) {
  if (!fig) return null;
  const w = Math.round(maxWidth * (SIZES[fig.size] || 1));
  const props = { fig, maxWidth: w, caption: fig.caption };
  switch (fig.type || 'plot') {
    case 'plot': return <PlotFigure {...props} />;
    case 'solid': return <SolidFigure {...props} />;
    case 'stats': return <StatsFigure {...props} />;
    case 'numberline': return <NumberLineFigure {...props} />;
    case 'venn': return <VennFigure {...props} />;
    case 'tree': return <TreeFigure {...props} />;
    case 'image': return <ImageFigure {...props} />;
    default: return null;
  }
}

/** All of a question's figures, side by side when there is room. */
export function QuestionFigures({ q, maxWidth = 420, style }) {
  const figs = questionFigures(q);
  if (!figs.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start', marginTop: 10, ...style }}>
      {figs.map((f, i) => (
        <div key={i} style={{ flex: `0 1 ${Math.round(maxWidth * (SIZES[f.size] || 1))}px`, minWidth: 0 }}>
          <Figure fig={f} maxWidth={maxWidth} />
        </div>
      ))}
    </div>
  );
}

/** An option's text plus its own figures (for "which graph…" multiple-choice questions). */
export function OptionContent({ opt, figWidth = 220 }) {
  const figs = (Array.isArray(opt?.figures) ? opt.figures : []).filter((f) => f && !figureIsEmpty(f));
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, minWidth: 0, verticalAlign: 'top' }}>
      {opt?.text ? <MathText text={opt.text} /> : null}
      {figs.map((f, i) => <Figure key={i} fig={f} maxWidth={figWidth} />)}
    </span>
  );
}

export const optionsHaveFigures = (options) => (Array.isArray(options) ? options : [])
  .some((o) => Array.isArray(o?.figures) && o.figures.some((f) => f && !figureIsEmpty(f)));
