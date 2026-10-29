import React, { useMemo, useId } from 'react';
import { compileExpr } from '../lib/mathExpr.js';
import { COLORS, isNum, num } from './model.js';
import { AngleMark, Frame, Label, SideDecor, VertexLabel, centroid, fmtNum, niceStep } from './svg.jsx';

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
  const { H, pad, pw, ph, sx, sy, g, curves, xTicks, yTicks, axisX, axisY, tickNums, errors } = data;
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
                return <SideDecor key={`sd${k}`} p1={a} p2={px[(k + 1) % n]} label={s.label} ticks={s.ticks} arrows={s.arrows} away={cen} color={color} />;
              })}
              {px.map((a, k) => {
                const v = vs[k];
                const hasPrev = closed || k > 0; const hasNext = closed || k < n - 1;
                return (
                  <g key={`v${k}`}>
                    {v.mark && v.mark !== 'none' || v.angleLabel ? (hasPrev && hasNext && n >= 3 ? (
                      <AngleMark V={a} P={px[(k - 1 + n) % n]} N={px[(k + 1) % n]} mark={v.mark || 'none'} label={v.angleLabel} color={color} />
                    ) : null) : null}
                    <VertexLabel p={a} centre={n >= 3 ? cen : { x: a.x - 1, y: a.y + 1 }} text={v.label} />
                  </g>
                );
              })}
            </g>
          );
        })}

        {arr(g.segments).map((s, i) => pt(s.x1, s.y1) && pt(s.x2, s.y2) && (s.label || s.ticks || s.arrows) && (
          <SideDecor key={`sdc${i}`} p1={P(s.x1, s.y1)} p2={P(s.x2, s.y2)} label={s.label} ticks={s.ticks} arrows={s.arrows} color={s.color || INK} />
        ))}

        {arr(g.lines).map((l, i) => {
          if (!l.label || !pt(l.x1, l.y1) || !pt(l.x2, l.y2)) return null;
          const [, b] = extend(l, g, l.kind === 'ray');
          const e = P(b.x, b.y); const s0 = P(l.x1, l.y1);
          const u = { x: s0.x - e.x, y: s0.y - e.y }; const L = Math.hypot(u.x, u.y) || 1;
          return <Label key={`ll${i}`} x={e.x + (u.x / L) * 22} y={e.y + (u.y / L) * 22 - 10} text={l.label} color={l.color || INK} />;
        })}

        {arr(g.circles).map((c, i) => {
          if (!pt(c.cx, c.cy) || !isNum(c.r)) return null;
          const C = P(c.cx, c.cy);
          const ang = (num(c.radiusAngle, 30) * Math.PI) / 180;
          const R = P(+c.cx + +c.r * Math.cos(ang), +c.cy + +c.r * Math.sin(ang));
          return (
            <g key={`cd${i}`}>
              {c.showRadius && <line x1={C.x} y1={C.y} x2={R.x} y2={R.y} stroke={c.color || INK} strokeWidth="1.6" />}
              {c.showRadius && c.radiusLabel && <SideDecor p1={C} p2={R} label={c.radiusLabel} color={c.color || INK} />}
              {(c.showCentre || c.centreLabel) && <circle cx={C.x} cy={C.y} r="3" fill={c.color || INK} />}
              {c.centreLabel && <Label x={C.x - 9} y={C.y + 11} text={c.centreLabel} size={14} italic anchor="middle" />}
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

        {arr(g.functions).map((f, i) => {
          const c = curves[i];
          if (!f.label || !c?.lastVisible) return null;
          return <Label key={`fl${i}`} x={Math.min(sx(c.lastVisible.x) - 4, W - 6)} y={Math.max(sy(c.lastVisible.y) - 12, 12)} text={f.label} color={c.color} anchor="end" />;
        })}

        {arr(g.points).map((p, i) => {
          if (!pt(p.x, p.y)) return null;
          const { x, y } = P(p.x, p.y);
          const color = p.color || INK;
          const right = x < pad.l + pw - 60;
          return (
            <g key={`pt${i}`}>
              <circle cx={x} cy={y} r="4" fill={p.open ? '#fff' : color} stroke={color} strokeWidth="1.8" />
              <Label x={right ? x + 8 : x - 8} y={y - 11} text={p.label} color={color} anchor={right ? 'start' : 'end'} size={13} />
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
    for (let i = 0; i <= N; i += 1) {
      const x = from + ((to - from) * i) / N;
      const y = fn(x);
      const bad = !Number.isFinite(y) || y > yMax + 4 * yRange || y < yMin - 4 * yRange;
      const jump = prev != null && Number.isFinite(y) && Math.abs(y - prev) > 1.5 * yRange;
      if (bad || jump) { pen = false; prev = bad ? null : y; if (bad) continue; }
      d += `${pen ? 'L' : 'M'}${sx(x).toFixed(2)},${sy(y).toFixed(2)}`;
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
    const lastVisible = visible.length ? visible[Math.floor((visible.length - 1) * 0.86)] : null;
    return { d, shadeD, color, dashed: !!f.dashed, lastVisible };
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

  // Points (and their labels) win over axis numbers that would sit underneath them.
  const marks = arr(fig.points).filter((p) => pt(p.x, p.y)).map((p) => ({ x: sx(+p.x), y: sy(+p.y) }));
  const blocked = (x, y, w) => marks.some((m) => Math.abs(m.x - x) < w / 2 + 8 && Math.abs(m.y - y) < 16);
  const tickNums = {
    x: xTicks.filter((v) => Math.abs(v) > 1e-9 || Math.abs(axisY - sx(0)) > 1).map((v) => {
      const text = tickLabel(v); const x = sx(v); const ly = Math.min(axisX + 13, H - 6);
      return { v, x, ly, text, show: !blocked(x, ly, text.length * 6.5) };
    }),
    y: yTicks.filter((v) => Math.abs(v) > 1e-9 || Math.abs(axisX - sy(0)) > 1).map((v) => {
      const text = fmtNum(v); const y = sy(v); const lx = axisY - 6;
      return { v, y, lx, text, show: !blocked(lx - text.length * 3.25, y, text.length * 6.5) };
    }),
  };
  return { H, pad, pw, ph, sx, sy, g, curves, xTicks, yTicks, axisX, axisY, tickNums, errors };
}
