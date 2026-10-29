import React, { useMemo, useId } from 'react';
import { compileExpr } from '../lib/mathExpr.js';
import { COLORS, isNum, num } from './model.js';
import { AngleMark, Frame, Label, SideDecor, centroid, fmtNum, niceStep } from './svg.jsx';
import { aroundPoint, besideSegment, createPlacer, textWidth } from './labelPlace.js';

// Coordinate graphs + plane geometry.
// {
//   xMin,xMax,yMin,yMax, axes, grid, xLabel, yLabel, xUnit: ''|'deg'|'pi', xStep, yStep, equal,
//   functions: [{ expr, color, label, dashed, from, to, shade: ''|'above'|'below' }],
//   points:    [{ x, y, label, color, open }],
//   segments:  [{ x1,y1,x2,y2, color, dashed, label, ticks, arrows }],
//   lines:     [{ x1,y1,x2,y2, kind: 'line'|'ray', color, dashed, label }],
//   polygons:  [{ vertices: [{ x, y, label, mark, angleLabel }], sides: [{ label, ticks, arrows }], closed, fill, color, dashed }],
//   circles:   [{ cx, cy, r, color, dashed, fill, showCentre, centreLabel, showRadius, radiusAngle, radiusLabel }],
//   arcs:      [{ cx, cy, r, start, end, sector, fill, color, dashed, label }],     // degrees, anticlockwise
//   angles:    [{ ax,ay, bx,by, cx,cy, mark, label, color }],                       // ∠ABC at B
//   texts:     [{ x, y, text, color }],
// }

const INK = '#1D1D1F';
const arr = (v) => (Array.isArray(v) ? v : []);
const pt = (x, y) => isNum(x) && isNum(y);

export function plotHasGeometry(g) {
  return ['polygons', 'circles', 'arcs', 'angles'].some((k) => arr(g[k]).length > 0);
}

/** Bounding box of everything except functions — for "auto fit". */
export function plotBounds(g) {
  const xs = []; const ys = [];
  const add = (x, y) => { if (pt(x, y)) { xs.push(+x); ys.push(+y); } };
  arr(g.points).forEach((p) => add(p.x, p.y));
  arr(g.texts).forEach((p) => add(p.x, p.y));
  arr(g.segments).forEach((s) => { add(s.x1, s.y1); add(s.x2, s.y2); });
  arr(g.lines).forEach((s) => { add(s.x1, s.y1); add(s.x2, s.y2); });
  arr(g.angles).forEach((a) => { add(a.ax, a.ay); add(a.bx, a.by); add(a.cx, a.cy); });
  arr(g.polygons).forEach((p) => arr(p.vertices).forEach((v) => add(v.x, v.y)));
  [...arr(g.circles), ...arr(g.arcs)].forEach((c) => {
    if (pt(c.cx, c.cy) && isNum(c.r)) { add(+c.cx - +c.r, +c.cy - +c.r); add(+c.cx + +c.r, +c.cy + +c.r); }
  });
  if (!xs.length) return null;
  return { xMin: Math.min(...xs), xMax: Math.max(...xs), yMin: Math.min(...ys), yMax: Math.max(...ys) };
}

function degTicks(lo, hi, userStep) {
  const range = hi - lo;
  const step = isNum(userStep) && +userStep > 0 ? +userStep
    : [10, 15, 30, 45, 60, 90, 180, 360].find((s) => range / s <= 8) || 360;
  return step;
}

function piLabel(v) {
  const k = v / Math.PI;
  for (const d of [1, 2, 3, 4, 6]) {
    const n = Math.round(k * d);
    if (Math.abs(n / d - k) < 1e-6) {
      if (n === 0) return '0';
      const g = (a, b) => (b ? g(b, a % b) : a);
      const c = g(Math.abs(n), d);
      const nn = n / c; const dd = d / c;
      const top = nn === 1 ? 'π' : nn === -1 ? '−π' : `${fmtNum(nn)}π`;
      return dd === 1 ? top : `${top}/${dd}`;
    }
  }
  return fmtNum(v);
}

export default function PlotFigure({ fig, maxWidth = 440, caption }) {
  const uid = useId().replace(/:/g, '');
  // A narrower drawing for small figures (e.g. MC options) keeps text readable.
  const W = Math.round(Math.max(240, Math.min(440, maxWidth)));
  const data = useMemo(() => layout(fig, W), [fig, W]);
  if (!data) return null;
  const { H, pad, pw, ph, sx, sy, g, curves, xTicks, yTicks, axisX, axisY, tickNums, errors, labels } = data;
  const P = (x, y) => ({ x: sx(+x), y: sy(+y) });
  const clip = `url(#${uid}c)`;

  return (
    <div>
      <Frame width={W} height={H} maxWidth={maxWidth} caption={caption} label="座標圖">
        <defs>
          <clipPath id={`${uid}c`}><rect x={pad.l} y={pad.t} width={pw} height={ph} /></clipPath>
          <marker id={`${uid}a`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={INK} />
          </marker>
        </defs>

        {g.axes && g.grid && (
          <g stroke="#E5E5EA" strokeWidth="1">
            {xTicks.map((v) => <line key={`gx${v}`} x1={sx(v)} x2={sx(v)} y1={pad.t} y2={pad.t + ph} />)}
            {yTicks.map((v) => <line key={`gy${v}`} y1={sy(v)} y2={sy(v)} x1={pad.l} x2={pad.l + pw} />)}
          </g>
        )}

        {/* shaded regions & fills first */}
        <g clipPath={clip}>
          {curves.map((c, i) => c.shadeD && <path key={`sh${i}`} d={c.shadeD} fill={c.color} fillOpacity="0.13" stroke="none" />)}
          {arr(g.polygons).map((p, i) => {
            const vs = arr(p.vertices).filter((v) => pt(v.x, v.y));
            if (!p.fill || vs.length < 3) return null;
            return <polygon key={`pf${i}`} points={vs.map((v) => `${sx(+v.x)},${sy(+v.y)}`).join(' ')} fill={p.color || COLORS[i % COLORS.length]} fillOpacity="0.13" />;
          })}
          {arr(g.circles).map((c, i) => c.fill && pt(c.cx, c.cy) && isNum(c.r) && (
            <ellipse key={`cf${i}`} cx={sx(+c.cx)} cy={sy(+c.cy)} rx={Math.abs(sx(+c.r) - sx(0))} ry={Math.abs(sy(+c.r) - sy(0))} fill={c.color || INK} fillOpacity="0.1" />
          ))}
          {arr(g.arcs).map((a, i) => a.fill && a.sector && <path key={`af${i}`} d={arcPath(a, sx, sy, true)} fill={a.color || INK} fillOpacity="0.13" />)}
        </g>

        {g.axes && (
          <>
            <line x1={pad.l} x2={pad.l + pw + 4} y1={axisX} y2={axisX} stroke={INK} strokeWidth="1.4" markerEnd={`url(#${uid}a)`} />
            <line x1={axisY} x2={axisY} y1={pad.t + ph} y2={pad.t - 4} stroke={INK} strokeWidth="1.4" markerEnd={`url(#${uid}a)`} />
            <g stroke={INK}>
              {tickNums.x.map((t) => <line key={`tx${t.v}`} x1={t.x} x2={t.x} y1={axisX - 3} y2={axisX + 3} />)}
              {tickNums.y.map((t) => <line key={`ty${t.v}`} y1={t.y} y2={t.y} x1={axisY - 3} x2={axisY + 3} />)}
            </g>
          </>
        )}

        <g clipPath={clip} fill="none" strokeLinecap="round" strokeLinejoin="round">
          {curves.map((c, i) => c.d && (
            <path key={`c${i}`} d={c.d} stroke={c.color} strokeWidth="2.4" strokeDasharray={c.dashed ? '7 6' : undefined} />
          ))}
          {arr(g.lines).map((l, i) => {
            if (!pt(l.x1, l.y1) || !pt(l.x2, l.y2)) return null;
            const [a, b] = extend(l, g, l.kind === 'ray');
            return <line key={`l${i}`} x1={sx(a.x)} y1={sy(a.y)} x2={sx(b.x)} y2={sy(b.y)} stroke={l.color || INK} strokeWidth="1.8" strokeDasharray={l.dashed ? '7 6' : undefined} />;
          })}
          {arr(g.segments).map((s, i) => pt(s.x1, s.y1) && pt(s.x2, s.y2) && (
            <line key={`s${i}`} x1={sx(+s.x1)} y1={sy(+s.y1)} x2={sx(+s.x2)} y2={sy(+s.y2)}
              stroke={s.color || INK} strokeWidth="1.8" strokeDasharray={s.dashed ? '7 6' : undefined} />
          ))}
          {arr(g.polygons).map((p, i) => {
            const vs = arr(p.vertices).filter((v) => pt(v.x, v.y));
            if (vs.length < 2) return null;
            const d = vs.map((v, k) => `${k ? 'L' : 'M'}${sx(+v.x)},${sy(+v.y)}`).join(' ') + (p.closed !== false ? ' Z' : '');
            return <path key={`p${i}`} d={d} stroke={p.color || INK} strokeWidth="1.8" strokeDasharray={p.dashed ? '7 6' : undefined} />;
          })}
          {arr(g.circles).map((c, i) => pt(c.cx, c.cy) && isNum(c.r) && (
            <ellipse key={`ci${i}`} cx={sx(+c.cx)} cy={sy(+c.cy)} rx={Math.abs(sx(+c.r) - sx(0))} ry={Math.abs(sy(+c.r) - sy(0))}
              stroke={c.color || INK} strokeWidth="1.8" strokeDasharray={c.dashed ? '7 6' : undefined} />
          ))}
          {arr(g.arcs).map((a, i) => pt(a.cx, a.cy) && isNum(a.r) && (
            <path key={`ar${i}`} d={arcPath(a, sx, sy, !!a.sector)} stroke={a.color || INK} strokeWidth="1.8" strokeDasharray={a.dashed ? '7 6' : undefined} />
          ))}
        </g>

        {/* axis numbers: above the curves (white halo) so lines never hide them */}
        {g.axes && (
          <g fontSize="11" fill="#3A3A3C" fontWeight="500" style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3, strokeLinejoin: 'round' }}>
            {tickNums.x.filter((t) => t.show).map((t) => <text key={`nx${t.v}`} x={t.x} y={t.ly} textAnchor="middle" dominantBaseline="central">{t.text}</text>)}
            {tickNums.y.filter((t) => t.show).map((t) => <text key={`ny${t.v}`} x={t.lx} y={t.y} textAnchor="end" dominantBaseline="central">{t.text}</text>)}
            {g.xMin <= 0 && g.xMax >= 0 && g.yMin <= 0 && g.yMax >= 0 && (
              <text x={sx(0) - 6} y={sy(0) + 12} textAnchor="end" dominantBaseline="central" fontStyle="italic">O</text>
            )}
          </g>
        )}
        {g.axes && <Label x={pad.l + pw - 2} y={axisX - 11} text={g.xLabel} anchor="end" size={14} weight={500} italic />}
        {g.axes && <Label x={axisY + 9} y={pad.t + 8} text={g.yLabel} anchor="start" size={14} weight={500} italic />}

        {/* decorations (not clipped so labels can sit outside the window) */}
        {arr(g.polygons).map((p, i) => {
          const vs = arr(p.vertices).filter((v) => pt(v.x, v.y));
          if (!vs.length) return null;
          const px = vs.map((v) => P(v.x, v.y));
          const cen = centroid(px);
          const color = p.color || INK;
          const n = px.length;
          const sides = arr(p.sides);
          const closed = p.closed !== false;
          return (
            <g key={`pd${i}`}>
              {px.map((a, k) => {
                if (!closed && k === n - 1) return null;
                const s = sides[k] || {};
                if (!s.label && !s.ticks && !s.arrows) return null;
                const L = labels.sides[i]?.[k];
                return (
                  <g key={`sd${k}`}>
                    <SideDecor p1={a} p2={px[(k + 1) % n]} ticks={s.ticks} arrows={s.arrows} away={cen} color={color} />
                    {L && <Label x={L.x} y={L.y} text={s.label} color={color} size={12} />}
                  </g>
                );
              })}
              {px.map((a, k) => {
                const v = vs[k];
                const hasPrev = closed || k > 0; const hasNext = closed || k < n - 1;
                return (
                  <g key={`v${k}`}>
                    {v.mark && v.mark !== 'none' || v.angleLabel ? (hasPrev && hasNext && n >= 3 ? (
                      <AngleMark V={a} P={px[(k - 1 + n) % n]} N={px[(k + 1) % n]} mark={v.mark || 'none'} label={v.angleLabel} color={color} />
                    ) : null) : null}
                    {labels.vertices[i]?.[k] && (
                      <Label x={labels.vertices[i][k].x} y={labels.vertices[i][k].y} text={v.label} size={14} italic={!/[$\d]/.test(v.label)} />
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

        {arr(g.segments).map((s, i) => pt(s.x1, s.y1) && pt(s.x2, s.y2) && (s.label || s.ticks || s.arrows) && (
          <g key={`sdc${i}`}>
            <SideDecor p1={P(s.x1, s.y1)} p2={P(s.x2, s.y2)} ticks={s.ticks} arrows={s.arrows} color={s.color || INK} />
            {labels.segments[i] && <Label x={labels.segments[i].x} y={labels.segments[i].y} text={s.label} color={s.color || INK} size={12} />}
          </g>
        ))}

        {arr(g.lines).map((l, i) => labels.lines[i] && (
          <g key={`ll${i}`}>
            {labels.lines[i].leader && <line {...labels.lines[i].leader} stroke={l.color || INK} strokeWidth="1" />}
            <Label x={labels.lines[i].x} y={labels.lines[i].y} text={l.label} color={l.color || INK} />
          </g>
        ))}

        {arr(g.circles).map((c, i) => {
          if (!pt(c.cx, c.cy) || !isNum(c.r)) return null;
          const C = P(c.cx, c.cy);
          const ang = (num(c.radiusAngle, 30) * Math.PI) / 180;
          const R = P(+c.cx + +c.r * Math.cos(ang), +c.cy + +c.r * Math.sin(ang));
          return (
            <g key={`cd${i}`}>
              {c.showRadius && <line x1={C.x} y1={C.y} x2={R.x} y2={R.y} stroke={c.color || INK} strokeWidth="1.6" />}
              {labels.radii[i] && <Label x={labels.radii[i].x} y={labels.radii[i].y} text={c.radiusLabel} color={c.color || INK} size={12} />}
              {(c.showCentre || c.centreLabel) && <circle cx={C.x} cy={C.y} r="3" fill={c.color || INK} />}
              {labels.centres[i] && <Label x={labels.centres[i].x} y={labels.centres[i].y} text={c.centreLabel} size={14} italic={!/[$\d]/.test(c.centreLabel)} />}
            </g>
          );
        })}

        {arr(g.arcs).map((a, i) => {
          if (!a.label || !pt(a.cx, a.cy) || !isNum(a.r)) return null;
          const mid = ((num(a.start, 0) + num(a.end, 90)) / 2) * Math.PI / 180;
          const r = a.sector ? +a.r * 0.45 : +a.r * 1.18;
          const L = P(+a.cx + r * Math.cos(mid), +a.cy + r * Math.sin(mid));
          return <Label key={`al${i}`} x={L.x} y={L.y} text={a.label} color={a.color || INK} size={12} />;
        })}

        {arr(g.angles).map((a, i) => pt(a.ax, a.ay) && pt(a.bx, a.by) && pt(a.cx, a.cy) && (
          <AngleMark key={`an${i}`} V={P(a.bx, a.by)} P={P(a.ax, a.ay)} N={P(a.cx, a.cy)} mark={a.mark || '1'} label={a.label} color={a.color || INK} />
        ))}

        {arr(g.functions).map((f, i) => labels.functions[i] && (
          <g key={`fl${i}`}>
            {labels.functions[i].leader && <line {...labels.functions[i].leader} stroke={curves[i].color} strokeWidth="1" />}
            <Label x={labels.functions[i].x} y={labels.functions[i].y} text={f.label} color={curves[i].color} />
          </g>
        ))}

        {arr(g.points).map((p, i) => {
          if (!pt(p.x, p.y)) return null;
          const { x, y } = P(p.x, p.y);
          const color = p.color || INK;
          const L = labels.points[i];
          return (
            <g key={`pt${i}`}>
              <circle cx={x} cy={y} r="4" fill={p.open ? '#fff' : color} stroke={color} strokeWidth="1.8" />
              {L && <Label x={L.x} y={L.y} text={p.label} color={color} size={13} />}
            </g>
          );
        })}

        {arr(g.texts).map((t, i) => pt(t.x, t.y) && (
          <Label key={`tx${i}`} x={sx(+t.x)} y={sy(+t.y)} text={t.text} color={t.color || INK} size={13} />
        ))}
      </Frame>
      {errors.length > 0 && (
        <div style={{ color: '#D70015', fontSize: 12, fontWeight: 600, marginTop: 6 }}>
          {errors.map((e, i) => <div key={i}>算式錯誤：{e}</div>)}
        </div>
      )}
    </div>
  );
}

function arcPath(a, sx, sy, sector) {
  const cx = +a.cx; const cy = +a.cy; const r = +a.r;
  let s = num(a.start, 0); let e = num(a.end, 90);
  while (e < s) e += 360;
  const N = Math.max(8, Math.ceil((e - s) / 3));
  let d = '';
  for (let i = 0; i <= N; i += 1) {
    const t = ((s + ((e - s) * i) / N) * Math.PI) / 180;
    d += `${i ? 'L' : 'M'}${sx(cx + r * Math.cos(t)).toFixed(2)},${sy(cy + r * Math.sin(t)).toFixed(2)}`;
  }
  if (sector) {
    const t0 = (s * Math.PI) / 180;
    d = `M${sx(cx)},${sy(cy)} L${sx(cx + r * Math.cos(t0))},${sy(cy + r * Math.sin(t0))} ${d.replace(/^M/, 'L')} Z`;
  }
  return d;
}

/** The visible part of a line (or ray from p1 through p2) inside the window (Liang–Barsky). */
function extend(l, g, ray) {
  const x1 = +l.x1; const y1 = +l.y1; const dx = +l.x2 - x1; const dy = +l.y2 - y1;
  if (!dx && !dy) return [{ x: x1, y: y1 }, { x: x1, y: y1 }];
  let t0 = ray ? 0 : -Infinity; let t1 = Infinity;
  const clip = (p, q) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  const ok = clip(-dx, x1 - g.xMin) && clip(dx, g.xMax - x1) && clip(-dy, y1 - g.yMin) && clip(dy, g.yMax - y1);
  if (!ok || !Number.isFinite(t0) || !Number.isFinite(t1)) return [{ x: x1, y: y1 }, { x: x1, y: y1 }];
  return [{ x: x1 + dx * t0, y: y1 + dy * t0 }, { x: x1 + dx * t1, y: y1 + dy * t1 }];
}

function layout(fig, W) {
  if (!fig) return null;
  const g = {
    ...fig,
    axes: fig.axes !== false,
    grid: fig.grid !== false,
    xLabel: fig.xLabel ?? 'x',
    yLabel: fig.yLabel ?? 'y',
  };
  let xMin = num(fig.xMin, -5); let xMax = num(fig.xMax, 5);
  let yMin = num(fig.yMin, -5); let yMax = num(fig.yMax, 5);
  if (xMax <= xMin) { xMin = -5; xMax = 5; }
  if (yMax <= yMin) { yMin = -5; yMax = 5; }

  const equal = fig.equal != null ? !!fig.equal : (!g.axes || plotHasGeometry(fig));
  // Leave room for the axis numbers when an axis sits at (or near) the left/bottom edge.
  let pad = { l: 28, r: 28, t: 24, b: 24 };
  if (g.axes) {
    const yNumW = Math.max(...[yMin, yMax].map((v) => fmtNum(Math.round(v * 100) / 100).length)) * 6.5 + 10;
    const approxW = W - 28;
    const leftRoom = xMin >= 0 ? 0 : ((0 - xMin) / (xMax - xMin)) * approxW;
    const approxH = equal ? approxW * ((yMax - yMin) / (xMax - xMin)) : 300;
    const bottomRoom = yMin >= 0 ? 0 : ((0 - yMin) / (yMax - yMin)) * Math.min(520, Math.max(206, approxH));
    pad = { l: Math.max(14, Math.ceil(yNumW - leftRoom)), r: 14, t: 14, b: Math.max(14, Math.ceil(24 - bottomRoom)) };
  }
  const pw = W - pad.l - pad.r;
  let ph;
  if (equal) {
    let px = pw / (xMax - xMin);
    ph = (yMax - yMin) * px;
    if (ph > 520) {
      px = 520 / (yMax - yMin);
      ph = 520;
      const half = pw / px / 2; const c = (xMin + xMax) / 2;
      xMin = c - half; xMax = c + half;
    } else if (ph < 120) {
      const c = (yMin + yMax) / 2; const half = 120 / px / 2;
      yMin = c - half; yMax = c + half; ph = 120;
    }
  } else {
    ph = Math.round(Math.min(546, Math.max(206, pw * ((yMax - yMin) / (xMax - xMin)))));
  }
  const H = Math.round(ph + pad.t + pad.b);
  Object.assign(g, { xMin, xMax, yMin, yMax });
  const sx = (x) => pad.l + ((x - xMin) / (xMax - xMin)) * pw;
  const sy = (y) => pad.t + ((yMax - y) / (yMax - yMin)) * ph;
  const yRange = yMax - yMin;

  const errors = [];
  const curves = arr(g.functions).map((f, idx) => {
    const color = f.color || COLORS[idx % COLORS.length];
    if (!String(f.expr || '').trim()) return { color, d: '' };
    const { fn, error } = compileExpr(f.expr, g.xUnit === 'deg');
    if (!fn) { errors.push(`${f.expr}：${error}`); return { color, d: '' }; }
    const from = Math.max(xMin, num(f.from, xMin));
    const to = Math.min(xMax, num(f.to, xMax));
    const N = 800;
    let d = ''; let pen = false; let prev = null;
    const visible = [];
    const pts = [];
    const runs = []; // on-screen pieces, for label placement
    for (let i = 0; i <= N; i += 1) {
      const x = from + ((to - from) * i) / N;
      const y = fn(x);
      const bad = !Number.isFinite(y) || y > yMax + 4 * yRange || y < yMin - 4 * yRange;
      const jump = prev != null && Number.isFinite(y) && Math.abs(y - prev) > 1.5 * yRange;
      if (bad || jump) { pen = false; prev = bad ? null : y; if (bad) continue; }
      d += `${pen ? 'L' : 'M'}${sx(x).toFixed(2)},${sy(y).toFixed(2)}`;
      if (!pen) runs.push([]);
      runs[runs.length - 1].push({ x: sx(x), y: sy(y) });
      pen = true; prev = y;
      pts.push([x, y]);
      if (y >= yMin + 0.04 * yRange && y <= yMax - 0.06 * yRange) visible.push({ x, y });
    }
    let shadeD = '';
    if ((f.shade === 'above' || f.shade === 'below') && pts.length > 1) {
      const edge = f.shade === 'above' ? yMax + yRange : yMin - yRange;
      const clampY = (y) => Math.max(yMin - yRange, Math.min(yMax + yRange, y));
      shadeD = `M${sx(pts[0][0])},${sy(edge)} ` + pts.map(([x, y]) => `L${sx(x).toFixed(2)},${sy(clampY(y)).toFixed(2)}`).join(' ')
        + ` L${sx(pts[pts.length - 1][0])},${sy(edge)} Z`;
    }
    return { d, shadeD, color, dashed: !!f.dashed, visible, runs };
  });

  // ticks
  let xTicks = []; let yTicks = []; let tickLabel = fmtNum;
  if (g.axes) {
    let xs;
    if (g.xUnit === 'deg') { xs = degTicks(xMin, xMax, fig.xStep); tickLabel = (v) => `${fmtNum(v)}°`; }
    else if (g.xUnit === 'pi') {
      const range = (xMax - xMin) / Math.PI;
      const k = [1 / 6, 1 / 4, 1 / 2, 1, 2].find((s) => range / s <= 12) || 2;
      xs = k * Math.PI; tickLabel = piLabel;
    } else xs = isNum(fig.xStep) && +fig.xStep > 0 ? +fig.xStep : niceStep(xMax - xMin, Math.max(4, Math.min(10, pw / 50)));
    const ys = isNum(fig.yStep) && +fig.yStep > 0 ? +fig.yStep : niceStep(yMax - yMin, Math.max(3, Math.min(10, ph / 40)));
    if ((xMax - xMin) / xs <= 60) for (let v = Math.ceil(xMin / xs - 1e-9) * xs; v <= xMax + 1e-9; v += xs) xTicks.push(Math.round(v / xs) * xs);
    if ((yMax - yMin) / ys <= 60) for (let v = Math.ceil(yMin / ys - 1e-9) * ys; v <= yMax + 1e-9; v += ys) yTicks.push(Math.round(v / ys) * ys);
  }
  const axisX = yMin <= 0 && yMax >= 0 ? sy(0) : (yMin > 0 ? sy(yMin) : sy(yMax));
  const axisY = xMin <= 0 && xMax >= 0 ? sx(0) : (xMin > 0 ? sx(xMin) : sx(xMax));

  const tickNums = {
    x: xTicks.filter((v) => Math.abs(v) > 1e-9 || Math.abs(axisY - sx(0)) > 1).map((v) => {
      const text = tickLabel(v); const x = sx(v); const ly = Math.min(axisX + 13, H - 6); const w = text.length * 6.2;
      return { v, x, ly, text, show: true, box: { l: x - w / 2, r: x + w / 2, t: ly - 6, b: ly + 6 } };
    }),
    y: yTicks.filter((v) => Math.abs(v) > 1e-9 || Math.abs(axisX - sy(0)) > 1).map((v) => {
      const text = fmtNum(v); const y = sy(v); const lx = axisY - 6; const w = text.length * 6.2;
      return { v, y, lx, text, show: true, box: { l: lx - w, r: lx, t: y - 6, b: y + 6 } };
    }),
  };
  const data = { W, H, pad, pw, ph, sx, sy, g, curves, xTicks, yTicks, axisX, axisY, tickNums, errors };
  data.labels = placeLabels(data);
  return data;
}

// Decide where every name / length / formula label goes, so none sits on a line, curve, point,
// axis number or another label. Axis numbers that a label still has to cover are hidden.
function placeLabels(data) {
  const { W, H, g, sx, sy, curves, axisX, axisY, pad, pw, ph, tickNums } = data;
  const P = (x, y) => ({ x: sx(+x), y: sy(+y) });
  const pl = createPlacer(W, H);
  const out = { points: [], vertices: [], sides: [], segments: [], centres: [], radii: [], functions: [], lines: [] };

  // Obstacles: everything drawn.
  if (g.axes) {
    pl.addSegment({ x: pad.l, y: axisX }, { x: pad.l + pw + 4, y: axisX });
    pl.addSegment({ x: axisY, y: pad.t - 4 }, { x: axisY, y: pad.t + ph });
    pl.addRect({ l: axisY - 8, r: axisY + 8, t: axisX - 8, b: axisX + 8 }, 4); // origin
    pl.addRect({ l: pad.l + pw - 14, r: pad.l + pw + 4, t: axisX - 20, b: axisX - 2 }, 20); // "x"
    pl.addRect({ l: axisY + 2, r: axisY + 18, t: pad.t - 2, b: pad.t + 16 }, 20); // "y"
  }
  curves.forEach((c, i) => (c.runs || []).forEach((run) => pl.addPolyline(run, 3, `f${i}`)));
  const lineEnds = arr(g.lines).map((l, li) => {
    if (!pt(l.x1, l.y1) || !pt(l.x2, l.y2)) return null;
    const [a, b] = extend(l, g, l.kind === 'ray');
    const e = [P(a.x, a.y), P(b.x, b.y)];
    const pts = [];
    for (let k = 0; k <= 40; k += 1) pts.push({ x: e[0].x + ((e[1].x - e[0].x) * k) / 40, y: e[0].y + ((e[1].y - e[0].y) * k) / 40 });
    pl.addPolyline(pts, 1, `l${li}`);
    return e;
  });
  arr(g.segments).forEach((s) => { if (pt(s.x1, s.y1) && pt(s.x2, s.y2)) pl.addSegment(P(s.x1, s.y1), P(s.x2, s.y2)); });
  const polys = arr(g.polygons).map((p) => {
    const vs = arr(p.vertices).filter((v) => pt(v.x, v.y));
    const px = vs.map((v) => P(v.x, v.y));
    const closed = p.closed !== false;
    for (let k = 1; k < px.length; k += 1) pl.addSegment(px[k - 1], px[k]);
    if (closed && px.length > 2) pl.addSegment(px[px.length - 1], px[0]);
    return { p, vs, px, closed };
  });
  const ring = (cx, cy, r, from = 0, to = 360) => {
    const pts = [];
    for (let a = from; a <= to + 1e-9; a += 6) pts.push(P(cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)));
    return pts;
  };
  arr(g.circles).forEach((c) => { if (pt(c.cx, c.cy) && isNum(c.r)) pl.addPolyline(ring(+c.cx, +c.cy, +c.r)); });
  arr(g.arcs).forEach((a) => {
    if (!pt(a.cx, a.cy) || !isNum(a.r)) return;
    let s0 = num(a.start, 0); let e0 = num(a.end, 90); while (e0 < s0) e0 += 360;
    const pts = ring(+a.cx, +a.cy, +a.r, s0, e0);
    pl.addPolyline(pts);
    if (a.sector) { const C = P(a.cx, a.cy); pl.addSegment(C, pts[0]); pl.addSegment(C, pts[pts.length - 1]); }
  });
  arr(g.points).forEach((p) => { if (pt(p.x, p.y)) pl.addMarker(P(p.x, p.y)); });
  arr(g.circles).forEach((c) => { if (pt(c.cx, c.cy) && (c.showCentre || c.centreLabel)) pl.addMarker(P(c.cx, c.cy), 4); });
  [...tickNums.x, ...tickNums.y].forEach((t) => pl.addRect(t.box, 6));
  arr(g.texts).forEach((t) => { if (pt(t.x, t.y)) { const w = textWidth(t.text); const c = P(t.x, t.y); pl.addRect({ l: c.x - w / 2, r: c.x + w / 2, t: c.y - 9, b: c.y + 9 }, 40); } });

  // 1) point names
  out.points = arr(g.points).map((p) => {
    if (!pt(p.x, p.y) || !p.label) return null;
    const c = P(p.x, p.y);
    return pl.place(p.label, aroundPoint(c, p.label, { gap: 6 }));
  });
  // 2) polygon vertex names (away from the shape first)
  out.vertices = polys.map(({ vs, px }) => {
    const cen = centroid(px);
    return vs.map((v, k) => {
      if (!v.label) return null;
      const a = px[k];
      const prefer = px.length >= 3 ? { x: a.x - cen.x, y: a.y - cen.y } : { x: 1, y: -1 };
      return pl.place(v.label, aroundPoint(a, v.label, { size: 14, gap: 3, prefer }), { size: 14 });
    });
  });
  // 3) circle centres
  out.centres = arr(g.circles).map((c) => {
    if (!c.centreLabel || !pt(c.cx, c.cy)) return null;
    return pl.place(c.centreLabel, aroundPoint(P(c.cx, c.cy), c.centreLabel, { size: 14, gap: 4, prefer: { x: -1, y: 1 } }), { size: 14 });
  });
  // 4) side lengths
  out.sides = polys.map(({ p, px, closed }) => {
    const cen = centroid(px); const n = px.length; const sides = arr(p.sides);
    return px.map((a, k) => {
      if (!closed && k === n - 1) return null;
      const lab = sides[k]?.label;
      if (!lab) return null;
      return pl.place(lab, besideSegment(a, px[(k + 1) % n], lab, { away: n >= 3 ? cen : undefined }), { size: 12 });
    });
  });
  out.segments = arr(g.segments).map((s) => {
    if (!s.label || !pt(s.x1, s.y1) || !pt(s.x2, s.y2)) return null;
    return pl.place(s.label, besideSegment(P(s.x1, s.y1), P(s.x2, s.y2), s.label), { size: 12 });
  });
  out.radii = arr(g.circles).map((c) => {
    if (!c.showRadius || !c.radiusLabel || !pt(c.cx, c.cy) || !isNum(c.r)) return null;
    const ang = (num(c.radiusAngle, 30) * Math.PI) / 180;
    const C = P(c.cx, c.cy); const R = P(+c.cx + +c.r * Math.cos(ang), +c.cy + +c.r * Math.sin(ang));
    return pl.place(c.radiusLabel, besideSegment(C, R, c.radiusLabel), { size: 12 });
  });
  // 5) formula labels: somewhere along the curve, beside it
  out.functions = arr(g.functions).map((f, i) => {
    const c = curves[i];
    if (!f.label || !c?.visible?.length) return null;
    const cands = [];
    // Near the end of the curve first, then anywhere along it; beside it, then further out.
    const fracs = [0.85, 0.9, 0.8, 0.95, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1, 0.05];
    fracs.forEach((frac, fi) => {
      const v = c.visible[Math.floor((c.visible.length - 1) * frac)];
      const q = P(v.x, v.y);
      [6, 18, 32].forEach((gap, gi) => {
        aroundPoint(q, f.label, { gap, prefer: { x: -1, y: -1 } }).slice(0, 8).forEach((cand, di) => {
          cands.push({ ...cand, ax: q.x, ay: q.y, pen: fi * 0.6 + gi * 4 + di * 0.4 });
        });
      });
    });
    return pl.place(f.label, cands, { owner: `f${i}` });
  });
  out.lines = arr(g.lines).map((l, i) => {
    const e = lineEnds[i];
    if (!l.label || !e) return null;
    const [a, b] = e;
    const cands = [];
    [0.88, 0.8, 0.72, 0.64, 0.12, 0.2, 0.28, 0.36, 0.5].forEach((frac, fi) => {
      const m = { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac };
      besideSegment({ x: m.x - (b.x - a.x) * 0.01, y: m.y - (b.y - a.y) * 0.01 }, { x: m.x + (b.x - a.x) * 0.01, y: m.y + (b.y - a.y) * 0.01 }, l.label)
        .filter((_, k) => k % 5 === 0)
        .forEach((cand, si) => cands.push({ ...cand, ax: m.x, ay: m.y, pen: fi * 0.6 + si * 1.5 }));
    });
    return pl.place(l.label, cands, { owner: `l${i}` });
  });

  // Axis numbers under a point or a label make way.
  const boxes = pl.placedBoxes();
  const markers = arr(g.points).filter((p) => pt(p.x, p.y)).map((p) => { const c = P(p.x, p.y); return { l: c.x - 6, r: c.x + 6, t: c.y - 6, b: c.y + 6 }; });
  const hits = (b) => [...boxes, ...markers].some((o) => Math.min(b.r, o.r) > Math.max(b.l, o.l) && Math.min(b.b, o.b) > Math.max(b.t, o.t));
  [...tickNums.x, ...tickNums.y].forEach((t) => { t.show = !hits(t.box); });
  return out;
}
