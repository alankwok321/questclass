import React, { useMemo } from 'react';
import { compileExpr } from '../lib/mathExpr.js';
import MathText, { hasMath } from './MathText.jsx';

// Coordinate graph for maths questions, stored on a question as media.graph:
// {
//   xMin, xMax, yMin, yMax,           // view window (defaults -5…5)
//   grid: true, xLabel: 'x', yLabel: 'y',
//   functions: [{ expr: 'x^2-2x', color, label, dashed, from, to }],
//   points:    [{ x, y, label, color, open }],
//   segments:  [{ x1, y1, x2, y2, color, dashed }],
// }

export const GRAPH_COLORS = ['#0071E3', '#D70015', '#248A3D', '#C93400', '#8944AB', '#1D1D1F'];

export const DEFAULT_GRAPH = {
  xMin: -5, xMax: 5, yMin: -5, yMax: 5, grid: true, xLabel: 'x', yLabel: 'y',
  functions: [], points: [], segments: [],
};

const num = (v, d) => (v === '' || v == null || !Number.isFinite(Number(v)) ? d : Number(v));

export function normalizeGraph(g) {
  if (!g || typeof g !== 'object') return null;
  let xMin = num(g.xMin, -5); let xMax = num(g.xMax, 5);
  let yMin = num(g.yMin, -5); let yMax = num(g.yMax, 5);
  if (xMax <= xMin) { xMin = -5; xMax = 5; }
  if (yMax <= yMin) { yMin = -5; yMax = 5; }
  return {
    xMin, xMax, yMin, yMax,
    grid: g.grid !== false,
    xLabel: g.xLabel ?? 'x',
    yLabel: g.yLabel ?? 'y',
    functions: Array.isArray(g.functions) ? g.functions.filter((f) => f && String(f.expr || '').trim()) : [],
    points: Array.isArray(g.points) ? g.points.filter((p) => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)) && p.x !== '' && p.y !== '') : [],
    segments: Array.isArray(g.segments) ? g.segments.filter((s) => s && ['x1', 'y1', 'x2', 'y2'].every((k) => s[k] !== '' && Number.isFinite(Number(s[k])))) : [],
  };
}

export function graphIsEmpty(g) {
  const n = normalizeGraph(g);
  return !n || (!n.functions.length && !n.points.length && !n.segments.length);
}

function niceStep(range, target = 10) {
  const raw = range / target;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / pow;
  const nice = m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10;
  return nice * pow;
}

function fmt(v) {
  const r = Math.round(v * 1e6) / 1e6;
  return String(r).replace('-', '−');
}

function Label({ x, y, text, color, anchor = 'start' }) {
  if (!text) return null;
  if (hasMath(text)) {
    const w = 180;
    const left = anchor === 'end' ? x - w : x;
    return (
      <foreignObject x={left} y={y - 14} width={w} height={30} style={{ overflow: 'visible' }}>
        <div xmlns="http://www.w3.org/1999/xhtml" style={{ fontSize: 13, color, textAlign: anchor === 'end' ? 'right' : 'left', whiteSpace: 'nowrap', lineHeight: '28px' }}>
          <MathText text={text} inline />
        </div>
      </foreignObject>
    );
  }
  return (
    <text x={x} y={y} fill={color} fontSize={13} fontWeight={600} textAnchor={anchor} dominantBaseline="middle"
      style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3, strokeLinejoin: 'round' }}>
      {text}
    </text>
  );
}

let uid = 0;

export default function MathGraph({ graph, maxWidth = 440, style }) {
  const g = useMemo(() => normalizeGraph(graph), [graph]);
  const clipId = useMemo(() => `qcGraphClip${++uid}`, []);
  const data = useMemo(() => {
    if (!g) return null;
    const W = 440;
    const ratio = (g.yMax - g.yMin) / (g.xMax - g.xMin);
    const H = Math.round(Math.min(560, Math.max(220, W * ratio)));
    const pad = { l: 14, r: 14, t: 14, b: 14 };
    const pw = W - pad.l - pad.r;
    const ph = H - pad.t - pad.b;
    const sx = (x) => pad.l + ((x - g.xMin) / (g.xMax - g.xMin)) * pw;
    const sy = (y) => pad.t + ((g.yMax - y) / (g.yMax - g.yMin)) * ph;
    const yRange = g.yMax - g.yMin;

    const curves = g.functions.map((f, idx) => {
      const { fn, error } = compileExpr(f.expr);
      const color = f.color || GRAPH_COLORS[idx % GRAPH_COLORS.length];
      if (!fn) return { error, color, d: '', label: f.label };
      const from = Math.max(g.xMin, num(f.from, g.xMin));
      const to = Math.min(g.xMax, num(f.to, g.xMax));
      const N = 800;
      let d = '';
      let pen = false;
      let prev = null;
      let lastVisible = null;
      for (let i = 0; i <= N; i += 1) {
        const x = from + ((to - from) * i) / N;
        const y = fn(x);
        const bad = !Number.isFinite(y) || y > g.yMax + 4 * yRange || y < g.yMin - 4 * yRange;
        const jump = prev != null && Number.isFinite(y) && Math.abs(y - prev) > 1.5 * yRange;
        if (bad || jump) { pen = false; prev = bad ? null : y; if (bad) continue; }
        d += `${pen ? 'L' : 'M'}${sx(x).toFixed(2)},${sy(y).toFixed(2)}`;
        pen = true;
        prev = y;
        if (y >= g.yMin && y <= g.yMax) lastVisible = { x, y };
      }
      return { d, color, dashed: !!f.dashed, label: f.label, lastVisible };
    });

    const xs = niceStep(g.xMax - g.xMin);
    const ys = niceStep(g.yMax - g.yMin);
    const xTicks = [];
    for (let v = Math.ceil(g.xMin / xs) * xs; v <= g.xMax + 1e-9; v += xs) xTicks.push(Math.round(v / xs) * xs);
    const yTicks = [];
    for (let v = Math.ceil(g.yMin / ys) * ys; v <= g.yMax + 1e-9; v += ys) yTicks.push(Math.round(v / ys) * ys);

    // Axes sit at 0 when 0 is in view, otherwise along the edge.
    const axisX = g.yMin <= 0 && g.yMax >= 0 ? sy(0) : (g.yMin > 0 ? sy(g.yMin) : sy(g.yMax));
    const axisY = g.xMin <= 0 && g.xMax >= 0 ? sx(0) : (g.xMin > 0 ? sx(g.xMin) : sx(g.xMax));

    return { W, H, pad, pw, ph, sx, sy, curves, xTicks, yTicks, axisX, axisY };
  }, [g]);

  if (!g || !data) return null;
  const { W, H, pad, pw, ph, sx, sy, curves, xTicks, yTicks, axisX, axisY } = data;
  const errors = curves.filter((c) => c.error);

  return (
    <div className="qcGraph" style={{ maxWidth, width: '100%', ...style }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="座標圖"
        style={{ display: 'block', background: '#fff', borderRadius: 12, border: '1px solid rgba(0,0,0,0.10)', fontFamily: 'inherit' }}>
        <defs>
          <clipPath id={clipId}><rect x={pad.l} y={pad.t} width={pw} height={ph} /></clipPath>
          <marker id={`${clipId}a`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#1D1D1F" />
          </marker>
        </defs>

        {g.grid && (
          <g stroke="#E5E5EA" strokeWidth="1">
            {xTicks.map((v) => <line key={`gx${v}`} x1={sx(v)} x2={sx(v)} y1={pad.t} y2={pad.t + ph} />)}
            {yTicks.map((v) => <line key={`gy${v}`} y1={sy(v)} y2={sy(v)} x1={pad.l} x2={pad.l + pw} />)}
          </g>
        )}

        {/* axes */}
        <line x1={pad.l} x2={pad.l + pw + 4} y1={axisX} y2={axisX} stroke="#1D1D1F" strokeWidth="1.4" markerEnd={`url(#${clipId}a)`} />
        <line x1={axisY} x2={axisY} y1={pad.t + ph} y2={pad.t - 4} stroke="#1D1D1F" strokeWidth="1.4" markerEnd={`url(#${clipId}a)`} />

        {/* tick labels */}
        <g fontSize="11" fill="#6E6E73" fontWeight="500">
          {xTicks.filter((v) => Math.abs(v) > 1e-9 || axisY !== sx(0)).map((v) => (
            <g key={`tx${v}`}>
              <line x1={sx(v)} x2={sx(v)} y1={axisX - 3} y2={axisX + 3} stroke="#1D1D1F" />
              <text x={sx(v)} y={Math.min(axisX + 14, H - 2)} textAnchor="middle">{fmt(v)}</text>
            </g>
          ))}
          {yTicks.filter((v) => Math.abs(v) > 1e-9 || axisX !== sy(0)).map((v) => (
            <g key={`ty${v}`}>
              <line y1={sy(v)} y2={sy(v)} x1={axisY - 3} x2={axisY + 3} stroke="#1D1D1F" />
              <text x={Math.max(axisY - 6, 10)} y={sy(v)} textAnchor="end" dominantBaseline="middle">{fmt(v)}</text>
            </g>
          ))}
          {g.xMin <= 0 && g.xMax >= 0 && g.yMin <= 0 && g.yMax >= 0 && (
            <text x={sx(0) - 6} y={sy(0) + 13} textAnchor="end" fontStyle="italic">O</text>
          )}
        </g>
        <text x={pad.l + pw - 2} y={axisX - 9} textAnchor="end" fontSize="14" fontStyle="italic" fill="#1D1D1F">{g.xLabel}</text>
        <text x={axisY + 9} y={pad.t + 10} fontSize="14" fontStyle="italic" fill="#1D1D1F">{g.yLabel}</text>

        <g clipPath={`url(#${clipId})`} fill="none" strokeLinecap="round" strokeLinejoin="round">
          {curves.map((c, i) => c.d && (
            <path key={`c${i}`} d={c.d} stroke={c.color} strokeWidth="2.4" strokeDasharray={c.dashed ? '7 6' : undefined} />
          ))}
          {g.segments.map((s, i) => (
            <line key={`s${i}`} x1={sx(+s.x1)} y1={sy(+s.y1)} x2={sx(+s.x2)} y2={sy(+s.y2)}
              stroke={s.color || '#1D1D1F'} strokeWidth="2" strokeDasharray={s.dashed ? '7 6' : undefined} />
          ))}
        </g>

        {curves.map((c, i) => c.label && c.lastVisible && (
          <Label key={`cl${i}`} x={Math.min(sx(c.lastVisible.x) - 4, W - 6)} y={Math.max(sy(c.lastVisible.y) - 12, 14)} text={c.label} color={c.color} anchor="end" />
        ))}

        {g.points.map((p, i) => {
          const x = sx(+p.x); const y = sy(+p.y);
          const color = p.color || '#1D1D1F';
          const right = x < pad.l + pw - 70;
          return (
            <g key={`p${i}`}>
              <circle cx={x} cy={y} r="4.2" fill={p.open ? '#fff' : color} stroke={color} strokeWidth="2" />
              <Label x={right ? x + 8 : x - 8} y={y - 12} text={p.label} color={color} anchor={right ? 'start' : 'end'} />
            </g>
          );
        })}
      </svg>
      {errors.length > 0 && (
        <div style={{ color: '#D70015', fontSize: 12, fontWeight: 600, marginTop: 6 }}>
          {errors.map((e, i) => <div key={i}>算式錯誤：{e.error}</div>)}
        </div>
      )}
    </div>
  );
}
