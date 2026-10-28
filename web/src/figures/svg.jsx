import React from 'react';
import MathText, { hasMath } from '../components/MathText.jsx';

// Shared SVG pieces for all figure types. Coordinates here are SVG pixels (y down).

const INK = '#1D1D1F';

/** Text label; LaTeX ($…$) is rendered with KaTeX through foreignObject. anchor: start|middle|end */
export function Label({ x, y, text, color = INK, anchor = 'middle', size = 13, weight = 600, italic = false, halo = true }) {
  if (text == null || text === '') return null;
  const t = String(text);
  if (hasMath(t)) {
    const w = 240; const h = 40;
    const left = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
    const justify = anchor === 'end' ? 'flex-end' : anchor === 'middle' ? 'center' : 'flex-start';
    return (
      <foreignObject x={left} y={y - h / 2} width={w} height={h} style={{ overflow: 'visible', pointerEvents: 'none' }}>
        <div xmlns="http://www.w3.org/1999/xhtml" style={{
          height: h, display: 'flex', alignItems: 'center', justifyContent: justify,
          fontSize: size, color, whiteSpace: 'nowrap', lineHeight: 1,
        }}>
          <span style={halo ? { background: 'rgba(255,255,255,0.75)', borderRadius: 4, padding: '0 2px' } : undefined}>
            <MathText text={t} inline />
          </span>
        </div>
      </foreignObject>
    );
  }
  return (
    <text x={x} y={y} fill={color} fontSize={size} fontWeight={weight} fontStyle={italic ? 'italic' : undefined}
      textAnchor={anchor} dominantBaseline="central"
      style={halo ? { paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3, strokeLinejoin: 'round' } : undefined}>
      {t}
    </text>
  );
}

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v) => Math.hypot(v.x, v.y) || 1;
const unit = (v) => { const l = len(v); return { x: v.x / l, y: v.y / l }; };

/**
 * Angle mark at V between rays V→P and V→N (smaller angle).
 * mark: 'none' | '1' | '2' | '3' (arcs) | 'right' (square). label shown on the bisector.
 */
export function AngleMark({ V, P, N, mark = '1', label, color = INK, radius = 20 }) {
  const u1 = unit(sub(P, V)); const u2 = unit(sub(N, V));
  const a1 = Math.atan2(u1.y, u1.x);
  let d = Math.atan2(u2.y, u2.x) - a1;
  while (d <= -Math.PI) d += 2 * Math.PI;
  while (d > Math.PI) d -= 2 * Math.PI;
  const mid = a1 + d / 2;
  const els = [];
  if (mark === 'right') {
    const s = 11;
    const p1 = { x: V.x + u1.x * s, y: V.y + u1.y * s };
    const p2 = { x: p1.x + u2.x * s, y: p1.y + u2.y * s };
    const p3 = { x: V.x + u2.x * s, y: V.y + u2.y * s };
    els.push(<path key="r" d={`M${p1.x},${p1.y} L${p2.x},${p2.y} L${p3.x},${p3.y}`} fill="none" stroke={color} strokeWidth="1.4" />);
  } else if (mark && mark !== 'none') {
    const n = Math.max(1, Math.min(3, Number(mark) || 1));
    // Small angles get a bigger radius so the arc stays visible.
    const base = Math.abs(d) < 0.5 ? radius + 10 : radius;
    for (let k = 0; k < n; k += 1) {
      const r = base + k * 4;
      const s = { x: V.x + r * Math.cos(a1), y: V.y + r * Math.sin(a1) };
      const e = { x: V.x + r * Math.cos(a1 + d), y: V.y + r * Math.sin(a1 + d) };
      els.push(<path key={k} d={`M${s.x},${s.y} A${r},${r} 0 0 ${d > 0 ? 1 : 0} ${e.x},${e.y}`} fill="none" stroke={color} strokeWidth="1.4" />);
    }
  }
  if (label) {
    const r = (Math.abs(d) < 0.5 ? radius + 26 : radius + 16) + (mark === 'right' ? 4 : 0);
    els.push(<Label key="l" x={V.x + r * Math.cos(mid)} y={V.y + r * Math.sin(mid)} text={label} color={color} size={12} />);
  }
  return <g>{els}</g>;
}

/**
 * Decorations on a side p1→p2: a length label (pushed away from `away`, e.g. the polygon centre),
 * equal-length ticks (1–3) and parallel arrows (1–3).
 */
export function SideDecor({ p1, p2, label, ticks = 0, arrows = 0, away, color = INK }) {
  const m = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const t = unit(sub(p2, p1));
  let n = { x: -t.y, y: t.x };
  if (away) {
    const toAway = sub(away, m);
    if (n.x * toAway.x + n.y * toAway.y > 0) n = { x: -n.x, y: -n.y };
  } else if (n.y > 0) n = { x: -n.x, y: -n.y };
  const els = [];
  const tk = Math.max(0, Math.min(3, Number(ticks) || 0));
  for (let i = 0; i < tk; i += 1) {
    const o = (i - (tk - 1) / 2) * 4;
    const c = { x: m.x + t.x * o, y: m.y + t.y * o };
    els.push(<line key={`t${i}`} x1={c.x - n.x * 6} y1={c.y - n.y * 6} x2={c.x + n.x * 6} y2={c.y + n.y * 6} stroke={color} strokeWidth="1.4" />);
  }
  const ar = Math.max(0, Math.min(3, Number(arrows) || 0));
  for (let i = 0; i < ar; i += 1) {
    const o = (i - (ar - 1) / 2) * 6 + (tk ? 10 : 0);
    const c = { x: m.x + t.x * o, y: m.y + t.y * o };
    const b1 = { x: c.x - t.x * 5 + n.x * 4, y: c.y - t.y * 5 + n.y * 4 };
    const b2 = { x: c.x - t.x * 5 - n.x * 4, y: c.y - t.y * 5 - n.y * 4 };
    els.push(<path key={`a${i}`} d={`M${b1.x},${b1.y} L${c.x},${c.y} L${b2.x},${b2.y}`} fill="none" stroke={color} strokeWidth="1.4" />);
  }
  if (label) {
    const off = Math.abs(n.y) > 0.8 ? 13 : 18;
    els.push(<Label key="l" x={m.x + n.x * off} y={m.y + n.y * off} text={label} color={color} size={12} />);
  }
  return <g>{els}</g>;
}

/** Label placed just outside a vertex, away from `centre`. */
export function VertexLabel({ p, centre, text, color = INK, dist = 14 }) {
  if (!text) return null;
  let d = centre ? unit(sub(p, centre)) : { x: 0.7, y: -0.7 };
  if (!Number.isFinite(d.x)) d = { x: 0.7, y: -0.7 };
  return <Label x={p.x + d.x * dist} y={p.y + d.y * dist} text={text} color={color} size={14} weight={600} italic={!/[$\d]/.test(text)} />;
}

export function Frame({ width, height, children, label = '圖', maxWidth = 440, caption, style }) {
  return (
    <figure className="qcFigure" style={{ margin: 0, maxWidth, width: '100%', ...style }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={label}
        style={{ display: 'block', background: '#fff', borderRadius: 12, border: '1px solid rgba(0,0,0,0.10)', fontFamily: 'inherit', overflow: 'visible' }}>
        {children}
      </svg>
      {caption ? (
        <figcaption style={{ textAlign: 'center', fontSize: 13, color: '#3A3A3C', marginTop: 4 }}>
          <MathText text={caption} />
        </figcaption>
      ) : null}
    </figure>
  );
}

export function niceStep(range, target = 10) {
  const raw = range / target;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / pow;
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * pow;
}

export function fmtNum(v) {
  const r = Math.round(v * 1e6) / 1e6;
  return String(r).replace('-', '−');
}

export const centroid = (pts) => ({
  x: pts.reduce((s, p) => s + p.x, 0) / (pts.length || 1),
  y: pts.reduce((s, p) => s + p.y, 0) / (pts.length || 1),
});
