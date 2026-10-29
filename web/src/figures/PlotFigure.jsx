import React, { useId, useMemo, useRef, useState } from 'react';
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

// ── figure editing helpers ───────────────────────────────────────────────────
const round2 = (v) => Math.round(v * 100) / 100;

/** Change one list item (or sub-item) of the figure immutably. */
function updateItem(fig, id, fn) {
  const [kind, a, b] = id.split(':');
  const key = LABEL_KEYS[kind];
  if (!key) return fig;
  const list = [...arr(fig[key.list])];
  const i = +a;
  if (!list[i] && !key.sub) return fig;
  if (key.sub) {
    const parent = { ...(list[i] || {}) };
    const sub = [...arr(parent[key.sub])];
    while (sub.length <= +b) sub.push({});
    const next = fn({ ...(sub[+b] || {}) });
    sub[+b] = next;
    parent[key.sub] = sub;
    list[i] = parent;
  } else {
    list[i] = fn({ ...list[i] });
  }
  return { ...fig, [key.list]: list.filter((x) => x !== null) };
}

function labelText(fig, id) {
  const [kind, a, b] = id.split(':');
  const key = LABEL_KEYS[kind];
  const item = key.sub ? arr(arr(fig[key.list])[+a]?.[key.sub])[+b] : arr(fig[key.list])[+a];
  return item?.[key.text] ?? '';
}

const LABEL_NAMES = { p: '點的名稱', v: '頂點名稱', va: '角', s: '邊長', g: '線段標籤', l: '直線標籤', f: '函數標籤', c: '圓心', r: '半徑', a: '弧標籤', an: '角', t: '文字' };

/** Graph position of a draggable point handle (pm:i point, vm:i:k vertex, cm:i circle centre). */
function pointOrigin(fig, id) {
  const [kind, a, b] = id.split(':');
  const src = kind === 'pm' ? arr(fig.points)[+a] : kind === 'vm' ? arr(arr(fig.polygons)[+a]?.vertices)[+b] : arr(fig.circles)[+a];
  if (!src) return { x: NaN, y: NaN };
  return kind === 'cm' ? { x: +src.cx, y: +src.cy } : { x: +src.x, y: +src.y };
}

/** Move a point and everything drawn from it: any end / vertex / centre at the same spot moves too. */
function moveLinked(fig, from, to) {
  const same = (x, y) => isNum(x) && isNum(y) && Math.abs(+x - from.x) < 1e-6 && Math.abs(+y - from.y) < 1e-6;
  const mv = (o, kx, ky) => (same(o[kx], o[ky]) ? { ...o, [kx]: to.x, [ky]: to.y } : o);
  const out = { ...fig };
  if (out.points) out.points = arr(out.points).map((o) => mv(o, 'x', 'y'));
  for (const k of ['segments', 'lines']) if (out[k]) out[k] = arr(out[k]).map((o) => mv(mv(o, 'x1', 'y1'), 'x2', 'y2'));
  if (out.angles) out.angles = arr(out.angles).map((o) => mv(mv(mv(o, 'ax', 'ay'), 'bx', 'by'), 'cx', 'cy'));
  if (out.polygons) out.polygons = arr(out.polygons).map((pg) => ({ ...pg, vertices: arr(pg.vertices).map((v) => mv(v, 'x', 'y')) }));
  for (const k of ['circles', 'arcs']) if (out[k]) out[k] = arr(out[k]).map((o) => mv(o, 'cx', 'cy'));
  return out;
}

// Snap a dragged point to a tidy value: whole numbers when close, otherwise 0.1.
const snap = (v, step) => {
  const whole = Math.round(v);
  if (Math.abs(v - whole) < step * 0.15) return whole;
  return Math.round(v * 10) / 10;
};

export default function PlotFigure({ fig, maxWidth = 440, caption, edit = false, onChange }) {
  const uid = useId().replace(/:/g, '');
  // A narrower drawing for small figures (e.g. MC options) keeps text readable.
  const W = Math.round(Math.max(240, Math.min(440, maxWidth)));
  const svgRef = useRef(null);
  const [mode, setMode] = useState('move'); // move | text | point
  const [selected, setSelected] = useState(null);
  const [drag, setDrag] = useState(null); // { id, kind: 'label'|'point', dx, dy, x, y, moved, to }
  // While a point is being dragged, draw the figure as if it were already moved (lines follow it).
  const shown = useMemo(() => (drag?.kind === 'point' && drag.moved && drag.to ? moveLinked(fig, pointOrigin(fig, drag.id), drag.to) : fig), [fig, drag]);
  const data = useMemo(() => layout(shown, W), [shown, W]);
  if (!data) return null;
  const { H, pad, pw, ph, sx, sy, g, curves, xTicks, yTicks, axisX, axisY, tickNums, errors, labels } = data;
  const P = (x, y) => ({ x: sx(+x), y: sy(+y) });
  const clip = `url(#${uid}c)`;
  const editing = edit && typeof onChange === 'function';
  const toGraph = (px, py) => ({
    x: g.xMin + ((px - pad.l) / pw) * (g.xMax - g.xMin),
    y: g.yMax - ((py - pad.t) / ph) * (g.yMax - g.yMin),
  });
  const svgPoint = (e) => {
    const svg = svgRef.current; if (!svg) return { x: 0, y: 0 };
    const m = svg.getScreenCTM(); if (!m) return { x: 0, y: 0 };
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: q.x, y: q.y };
  };

  // Live positions while dragging.
  const labelAt = (it) => (drag?.kind === 'label' && drag.id === it.id && drag.moved ? { x: drag.x - drag.dx, y: drag.y - drag.dy } : it);
  const pointAt = (id, x, y) => P(x, y);

  function commitDrag() {
    if (!drag) return;
    if (!drag.moved) {
      setSelected(drag.id.replace(/^pm:/, 'p:').replace(/^vm:/, 'v:').replace(/^cm:/, 'c:'));
      setDrag(null);
      return;
    }
    if (drag.kind === 'label') {
      const at = toGraph(drag.x - drag.dx, drag.y - drag.dy);
      const pos = { x: round2(at.x), y: round2(at.y) };
      const [kind] = drag.id.split(':');
      const key = LABEL_KEYS[kind];
      onChange(updateItem(fig, drag.id, (o) => (key.at ? { ...o, [key.at]: pos } : { ...o, ...pos })));
    } else {
      const q = toGraph(drag.x, drag.y);
      const pos = { x: snap(q.x, 1), y: snap(q.y, 1) };
      onChange(moveLinked(fig, pointOrigin(fig, drag.id), pos));
    }
    setDrag(null);
  }

  const svgProps = editing ? {
    onPointerMove: (e) => {
      if (!drag) return;
      const q = svgPoint(e);
      const moved = drag.moved || Math.hypot(q.x - drag.sx0, q.y - drag.sy0) > 3;
      const gq = toGraph(q.x, q.y);
      setDrag({ ...drag, x: q.x, y: q.y, moved, to: drag.kind === 'point' ? { x: snap(gq.x, 1), y: snap(gq.y, 1) } : undefined });
    },
    onPointerUp: commitDrag,
    onPointerLeave: () => drag && commitDrag(),
    onPointerDown: (e) => {
      if (e.target.closest?.('[data-hit]')) return;
      e.preventDefault(); // keep focus in the label box and don't select page text
      const q = svgPoint(e);
      if (mode === 'text' || mode === 'point') {
        const at = toGraph(q.x, q.y);
        const pos = { x: round2(at.x), y: round2(at.y) };
        if (mode === 'text') {
          const texts = [...arr(fig.texts), { ...pos, text: '文字' }];
          onChange({ ...fig, texts });
          setSelected(`t:${texts.length - 1}`);
        } else {
          const used = new Set([...arr(fig.points).map((p) => p.label), ...arr(fig.polygons).flatMap((pg) => arr(pg.vertices).map((v) => v.label))]);
          const name = 'PQRSTUVWKLMN'.split('').find((c) => !used.has(c)) || '';
          const points = [...arr(fig.points), { x: snap(at.x, 1), y: snap(at.y, 1), label: name }];
          onChange({ ...fig, points });
          setSelected(`p:${points.length - 1}`);
        }
        setMode('move');
        return;
      }
      setSelected(null);
    },
    style: { cursor: mode === 'move' ? 'default' : 'crosshair', userSelect: 'none', WebkitUserSelect: 'none' },
  } : undefined;

  const startDrag = (id, kind, e, origin) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const q = svgPoint(e);
    setDrag({ id, kind, sx0: q.x, sy0: q.y, x: q.x, y: q.y, dx: q.x - origin.x, dy: q.y - origin.y, moved: false });
  };

  const sel = selected && labels.items.find((it) => it.id === selected);
  const selKind = selected?.split(':')[0];

  const overlay = editing && selected ? (
    <SelectionPanel
      key={selected}
      fig={fig} id={selected} item={sel} W={W} H={H}
      onChange={onChange} onClose={() => setSelected(null)}
      title={LABEL_NAMES[selKind] || '標籤'}
    />
  ) : null;

  return (
    <div>
      {editing && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
          {[['move', '↖ 移動 / 選取'], ['text', '＋ 文字'], ['point', '＋ 點']].map(([m, l]) => (
            <button key={m} type="button" onClick={() => setMode(m)} style={{
              border: 0, borderRadius: 999, padding: '5px 11px', fontSize: 12, cursor: 'pointer', fontWeight: 600,
              background: mode === m ? '#0071E3' : '#E3E3E8', color: mode === m ? '#fff' : '#1D1D1F',
            }}>{l}</button>
          ))}
          <button type="button" onClick={() => { onChange(clearLabelPositions(fig)); setSelected(null); }}
            style={{ border: 0, borderRadius: 999, padding: '5px 11px', fontSize: 12, cursor: 'pointer', background: '#E3E3E8' }}>全部標籤自動排位</button>
          <span style={{ fontSize: 11, color: '#86868B' }}>
            {mode === 'move' ? '拖動標籤或點即可移動；點擊標籤可修改或刪除' : mode === 'text' ? '在圖上點擊要加文字的位置' : '在圖上點擊要加點的位置'}
          </span>
        </div>
      )}
      <Frame width={W} height={H} maxWidth={maxWidth} caption={caption} label="座標圖" svgRef={svgRef} svgProps={svgProps} overlay={overlay}>
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
            const pts = arr(p.vertices).map((v, k) => (pt(v.x, v.y) ? pointAt(`vm:${i}:${k}`, v.x, v.y) : null)).filter(Boolean);
            if (pts.length < 2) return null;
            const d = pts.map((q, k) => `${k ? 'L' : 'M'}${q.x},${q.y}`).join(' ') + (p.closed !== false ? ' Z' : '');
            return <path key={`p${i}`} d={d} stroke={p.color || INK} strokeWidth="1.8" strokeDasharray={p.dashed ? '7 6' : undefined} />;
          })}
          {arr(g.circles).map((c, i) => {
            if (!pt(c.cx, c.cy) || !isNum(c.r)) return null;
            const C = pointAt(`cm:${i}`, c.cx, c.cy);
            return <ellipse key={`ci${i}`} cx={C.x} cy={C.y} rx={Math.abs(sx(+c.r) - sx(0))} ry={Math.abs(sy(+c.r) - sy(0))}
              stroke={c.color || INK} strokeWidth="1.8" strokeDasharray={c.dashed ? '7 6' : undefined} />;
          })}
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

        {/* side ticks / parallel arrows, angle arcs (labels are drawn with the other labels) */}
        {arr(g.polygons).map((p, i) => {
          const ks = arr(p.vertices).map((_, k) => k).filter((k) => pt(p.vertices[k].x, p.vertices[k].y));
          const px = ks.map((k) => pointAt(`vm:${i}:${k}`, p.vertices[k].x, p.vertices[k].y));
          if (!px.length) return null;
          const cen = centroid(px); const n = px.length; const closed = p.closed !== false;
          return (
            <g key={`pd${i}`}>
              {px.map((a, j) => {
                if (!closed && j === n - 1) return null;
                const sd = arr(p.sides)[ks[j]] || {};
                if (!sd.ticks && !sd.arrows) return null;
                return <SideDecor key={`sd${j}`} p1={a} p2={px[(j + 1) % n]} ticks={sd.ticks} arrows={sd.arrows} away={cen} color={p.color || INK} />;
              })}
            </g>
          );
        })}
        {labels.angleDefs.map((d) => d.mark && d.mark !== 'none' && (
          <AngleMark key={`am${d.id}`} V={d.V} P={d.A} N={d.B} mark={d.mark} color={d.color} />
        ))}
        {arr(g.segments).map((s, i) => pt(s.x1, s.y1) && pt(s.x2, s.y2) && (s.ticks || s.arrows) && (
          <SideDecor key={`sdc${i}`} p1={P(s.x1, s.y1)} p2={P(s.x2, s.y2)} ticks={s.ticks} arrows={s.arrows} color={s.color || INK} />
        ))}
        {arr(g.circles).map((c, i) => {
          if (!pt(c.cx, c.cy) || !isNum(c.r)) return null;
          const C = pointAt(`cm:${i}`, c.cx, c.cy);
          const ang = (num(c.radiusAngle, 30) * Math.PI) / 180;
          const R = { x: C.x + (sx(+c.r) - sx(0)) * Math.cos(ang), y: C.y + (sy(+c.r) - sy(0)) * Math.sin(ang) };
          return (
            <g key={`cd${i}`}>
              {c.showRadius && <line x1={C.x} y1={C.y} x2={R.x} y2={R.y} stroke={c.color || INK} strokeWidth="1.6" />}
              {(c.showCentre || c.centreLabel) && <circle cx={C.x} cy={C.y} r="3" fill={c.color || INK} />}
            </g>
          );
        })}

        {arr(g.points).map((p, i) => {
          if (!pt(p.x, p.y)) return null;
          const { x, y } = pointAt(`pm:${i}`, p.x, p.y);
          const color = p.color || INK;
          return <circle key={`pt${i}`} cx={x} cy={y} r="4" fill={p.open ? '#fff' : color} stroke={color} strokeWidth="1.8" />;
        })}

        {/* all labels */}
        {labels.items.map((it) => {
          const q = labelAt(it);
          return (
            <g key={`lb${it.id}`}>
              {it.leader && !(drag?.id === it.id && drag.moved) && <line {...it.leader} stroke={it.color || INK} strokeWidth="1" />}
              <Label x={q.x} y={q.y} text={it.text} color={it.color || INK} size={it.size || 13} italic={!!it.italic} />
            </g>
          );
        })}

        {/* edit mode: grab handles */}
        {editing && (
          <g>
            {labels.items.map((it) => {
              const q = labelAt(it); const w = it.box.r - it.box.l; const h = it.box.b - it.box.t;
              const on = selected === it.id;
              return (
                <rect key={`h${it.id}`} data-hit="1" x={q.x - w / 2 - 2} y={q.y - h / 2 - 1} width={w + 4} height={h + 2} rx="4"
                  fill={on ? 'rgba(0,113,227,0.10)' : 'transparent'} stroke={on ? '#0071E3' : 'transparent'} strokeDasharray="3 2"
                  style={{ cursor: 'move' }}
                  onPointerDown={(e) => startDrag(it.id, 'label', e, q)} />
              );
            })}
            {arr(g.points).map((p, i) => pt(p.x, p.y) && (() => {
              const q = pointAt(`pm:${i}`, p.x, p.y);
              return <circle key={`hp${i}`} data-hit="1" cx={q.x} cy={q.y} r="9" fill="transparent" style={{ cursor: 'grab' }} onPointerDown={(e) => startDrag(`pm:${i}`, 'point', e, q)} />;
            })())}
            {arr(g.polygons).map((pg, i) => arr(pg.vertices).map((v, k) => pt(v.x, v.y) && (() => {
              const q = pointAt(`vm:${i}:${k}`, v.x, v.y);
              return <circle key={`hv${i}-${k}`} data-hit="1" cx={q.x} cy={q.y} r="8" fill="rgba(0,113,227,0.12)" stroke="#0071E3" strokeWidth="1" style={{ cursor: 'grab' }} onPointerDown={(e) => startDrag(`vm:${i}:${k}`, 'point', e, q)} />;
            })()))}
            {arr(g.circles).map((c, i) => pt(c.cx, c.cy) && (() => {
              const q = pointAt(`cm:${i}`, c.cx, c.cy);
              return <circle key={`hc${i}`} data-hit="1" cx={q.x} cy={q.y} r="8" fill="rgba(0,113,227,0.12)" stroke="#0071E3" strokeWidth="1" style={{ cursor: 'grab' }} onPointerDown={(e) => startDrag(`cm:${i}`, 'point', e, q)} />;
            })())}
          </g>
        )}
      </Frame>
      {errors.length > 0 && (
        <div style={{ color: '#D70015', fontSize: 12, fontWeight: 600, marginTop: 6 }}>
          {errors.map((e, i) => <div key={i}>算式錯誤：{e}</div>)}
        </div>
      )}
    </div>
  );
}

/** Remove every saved label position, so all labels are placed automatically again. */
export function clearLabelPositions(fig) {
  const strip = (o) => {
    if (!o || typeof o !== 'object') return o;
    const { labelAt, angleLabelAt, centreLabelAt, radiusLabelAt, ...rest } = o; // eslint-disable-line no-unused-vars
    return rest;
  };
  const out = { ...fig };
  for (const k of ['points', 'segments', 'lines', 'functions', 'circles', 'arcs', 'angles']) if (Array.isArray(out[k])) out[k] = out[k].map(strip);
  if (Array.isArray(out.polygons)) out.polygons = out.polygons.map((p) => ({ ...p, vertices: arr(p.vertices).map(strip), sides: arr(p.sides).map(strip) }));
  return out;
}

/** Small panel over the figure for the selected label: edit text, reset position, delete. */
function SelectionPanel({ fig, id, item, W, H, onChange, onClose, title }) {
  const [kind, a] = id.split(':');
  const key = LABEL_KEYS[kind];
  const [text, setText] = useState(() => labelText(fig, id));
  const x = item ? item.x : W / 2; const y = item ? item.box.b : H / 2;
  const left = `${Math.min(70, Math.max(0, (x / W) * 100 - 20))}%`;
  const top = `${Math.min(92, (y / H) * 100 + 2)}%`;
  const setLabel = (v) => {
    setText(v);
    onChange(updateItem(fig, id, (o) => ({ ...o, [key.text]: v })));
  };
  const resetPos = () => onChange(updateItem(fig, id, (o) => { const n = { ...o }; delete n[key.at]; return n; }));
  const removeLabel = () => { onChange(updateItem(fig, id, (o) => { const n = { ...o, [key.text]: '' }; if (key.at) delete n[key.at]; return n; })); onClose(); };
  const removeWhole = (list) => { onChange({ ...fig, [list]: arr(fig[list]).filter((_, i) => i !== +a) }); onClose(); };
  const btn = { border: 0, borderRadius: 999, padding: '5px 10px', fontSize: 12, cursor: 'pointer', background: '#E3E3E8', whiteSpace: 'nowrap' };
  return (
    <div onPointerDown={(e) => e.stopPropagation()} style={{
      position: 'absolute', left, top, zIndex: 5, background: '#fff', borderRadius: 12, padding: 8, minWidth: 220,
      boxShadow: '0 8px 24px rgba(0,0,0,0.18)', border: '1px solid rgba(0,0,0,0.08)', display: 'grid', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <b style={{ fontSize: 12, color: '#6E6E73' }}>{title}</b>
        <button type="button" onClick={onClose} style={{ ...btn, marginLeft: 'auto', padding: '2px 8px' }} aria-label="關閉">×</button>
      </div>
      <input autoFocus value={text} onChange={(e) => setLabel(e.target.value)} placeholder="標籤（可用 $…$）"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') onClose(); }}
        style={{ padding: '6px 9px', border: '1px solid #D2D2D7', borderRadius: 8, fontSize: 13, outline: 'none' }} />
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {key.at && item && item.fixed && <button type="button" style={btn} onClick={resetPos}>自動排位</button>}
        {kind !== 't' && <button type="button" style={{ ...btn, color: '#D70015' }} onClick={removeLabel}>刪除標籤</button>}
        {kind === 'p' && <button type="button" style={{ ...btn, color: '#D70015' }} onClick={() => removeWhole('points')}>刪除點</button>}
        {kind === 't' && <button type="button" style={{ ...btn, color: '#D70015' }} onClick={() => removeWhole('texts')}>刪除文字</button>}
        {kind === 'an' && <button type="button" style={{ ...btn, color: '#D70015' }} onClick={() => removeWhole('angles')}>刪除角號</button>}
        {kind === 'g' && <button type="button" style={{ ...btn, color: '#D70015' }} onClick={() => removeWhole('segments')}>刪除線段</button>}
        {kind === 'l' && <button type="button" style={{ ...btn, color: '#D70015' }} onClick={() => removeWhole('lines')}>刪除直線</button>}
        {kind === 'va' && <button type="button" style={{ ...btn, color: '#D70015' }} onClick={() => { onChange(updateItem(fig, id, (o) => ({ ...o, mark: 'none', angleLabel: '' }))); onClose(); }}>刪除角號</button>}
      </div>
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
  // Geometry without axes: never cut a shape off — widen the window to hold everything.
  if (!g.axes) {
    const b = plotBounds(fig);
    if (b) {
      const m = Math.max(b.xMax - b.xMin, b.yMax - b.yMin) * 0.08 || 0.5;
      xMin = Math.min(xMin, b.xMin - m); xMax = Math.max(xMax, b.xMax + m);
      yMin = Math.min(yMin, b.yMin - m); yMax = Math.max(yMax, b.yMax + m);
    }
  }

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

// Every label in a plot figure, as editable items:
//   id    where it lives in the figure (see LABEL_KEYS) — used for dragging / editing / deleting
//   x, y  centre in SVG px; box: its rectangle; leader: optional pointer line to its curve
// A label with a saved position (labelAt, in graph units) stays there; the rest are placed
// automatically where they touch the fewest lines, curves, points, numbers and other labels.
export const LABEL_KEYS = {
  p: { list: 'points', text: 'label', at: 'labelAt' },
  v: { list: 'polygons', sub: 'vertices', text: 'label', at: 'labelAt' },
  va: { list: 'polygons', sub: 'vertices', text: 'angleLabel', at: 'angleLabelAt' },
  s: { list: 'polygons', sub: 'sides', text: 'label', at: 'labelAt' },
  g: { list: 'segments', text: 'label', at: 'labelAt' },
  l: { list: 'lines', text: 'label', at: 'labelAt' },
  f: { list: 'functions', text: 'label', at: 'labelAt' },
  c: { list: 'circles', text: 'centreLabel', at: 'centreLabelAt' },
  r: { list: 'circles', text: 'radiusLabel', at: 'radiusLabelAt' },
  a: { list: 'arcs', text: 'label', at: 'labelAt' },
  an: { list: 'angles', text: 'label', at: 'labelAt' },
  t: { list: 'texts', text: 'text', at: null },
};

function placeLabels(data) {
  const { W, H, g, sx, sy, curves, axisX, axisY, pad, pw, ph, tickNums } = data;
  const P = (x, y) => ({ x: sx(+x), y: sy(+y) });
  const pl = createPlacer(W, H);
  const items = [];
  const fixedAt = (at) => (at && pt(at.x, at.y) ? P(at.x, at.y) : null);
  const add = (id, text, opts, cands, placeOpts = {}) => {
    if (!text) return;
    const size = opts.size || 13;
    const at = fixedAt(opts.at);
    let r;
    if (at) {
      const w = textWidth(text, size); const h = size + 5;
      const box = { l: at.x - w / 2, r: at.x + w / 2, t: at.y - h / 2, b: at.y + h / 2 };
      pl.placedBoxes().push(box);
      r = { x: at.x, y: at.y, box, fixed: true };
    } else {
      r = pl.place(text, cands(), { size, ...placeOpts });
    }
    if (r) items.push({ id, text, ...opts, ...r });
  };

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
    const ks = arr(p.vertices).map((v, k) => k).filter((k) => pt(p.vertices[k].x, p.vertices[k].y));
    const px = ks.map((k) => P(p.vertices[k].x, p.vertices[k].y));
    const closed = p.closed !== false;
    for (let k = 1; k < px.length; k += 1) pl.addSegment(px[k - 1], px[k]);
    if (closed && px.length > 2) pl.addSegment(px[px.length - 1], px[0]);
    return { p, ks, px, closed };
  });
  const ring = (cx, cy, r, from = 0, to = 360) => {
    const pts = [];
    for (let a = from; a <= to + 1e-9; a += 6) pts.push(P(cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)));
    return pts;
  };
  arr(g.circles).forEach((c) => { if (pt(c.cx, c.cy) && isNum(c.r)) pl.addPolyline(ring(+c.cx, +c.cy, +c.r)); });
  arr(g.circles).forEach((c) => {
    if (!c.showRadius || !pt(c.cx, c.cy) || !isNum(c.r)) return;
    const ang = (num(c.radiusAngle, 30) * Math.PI) / 180;
    pl.addSegment(P(c.cx, c.cy), P(+c.cx + +c.r * Math.cos(ang), +c.cy + +c.r * Math.sin(ang)));
  });
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
  // Angle arcs are obstacles too.
  const angleDefs = [];
  polys.forEach(({ p, ks, px, closed }, i) => {
    const n = px.length;
    ks.forEach((k, j) => {
      const v = p.vertices[k];
      if (n < 3 || (!closed && (j === 0 || j === n - 1))) return;
      if ((v.mark && v.mark !== 'none') || v.angleLabel) angleDefs.push({ id: `va:${i}:${k}`, V: px[j], A: px[(j - 1 + n) % n], B: px[(j + 1) % n], mark: v.mark || 'none', label: v.angleLabel, at: v.angleLabelAt, color: p.color || INK });
    });
  });
  arr(g.angles).forEach((a, i) => {
    if (pt(a.ax, a.ay) && pt(a.bx, a.by) && pt(a.cx, a.cy)) angleDefs.push({ id: `an:${i}`, V: P(a.bx, a.by), A: P(a.ax, a.ay), B: P(a.cx, a.cy), mark: a.mark || '1', label: a.label, at: a.labelAt, color: a.color || INK });
  });
  const angleGeom = (d) => {
    const a1 = Math.atan2(d.A.y - d.V.y, d.A.x - d.V.x);
    let sw = Math.atan2(d.B.y - d.V.y, d.B.x - d.V.x) - a1;
    while (sw <= -Math.PI) sw += 2 * Math.PI;
    while (sw > Math.PI) sw -= 2 * Math.PI;
    return { a1, sw };
  };
  angleDefs.forEach((d) => {
    if (!d.mark || d.mark === 'none' || d.mark === 'right') return;
    const { a1, sw } = angleGeom(d); const r = Math.abs(sw) < 0.5 ? 30 : 20;
    const pts = [];
    for (let k = 0; k <= 12; k += 1) { const t = a1 + (sw * k) / 12; pts.push({ x: d.V.x + r * Math.cos(t), y: d.V.y + r * Math.sin(t) }); }
    pl.addPolyline(pts);
  });
  // Free text: placed exactly where the teacher put it.
  arr(g.texts).forEach((t, i) => {
    if (!pt(t.x, t.y) || !t.text) return;
    const c = P(t.x, t.y); const w = textWidth(t.text); const box = { l: c.x - w / 2, r: c.x + w / 2, t: c.y - 9, b: c.y + 9 };
    pl.placedBoxes().push(box);
    items.push({ id: `t:${i}`, text: t.text, color: t.color || INK, size: 13, x: c.x, y: c.y, box, fixed: true });
  });

  // 1) point names
  arr(g.points).forEach((p, i) => {
    if (!pt(p.x, p.y)) return;
    const c = P(p.x, p.y);
    add(`p:${i}`, p.label, { color: p.color || INK, size: 13, at: p.labelAt }, () => aroundPoint(c, p.label, { gap: 6 }));
  });
  // 2) vertex names (outside the shape first)
  polys.forEach(({ p, ks, px }, i) => {
    const cen = centroid(px);
    ks.forEach((k, j) => {
      const v = p.vertices[k]; const a = px[j];
      const prefer = px.length >= 3 ? { x: a.x - cen.x, y: a.y - cen.y } : { x: 1, y: -1 };
      add(`v:${i}:${k}`, v.label, { size: 14, italic: !/[$\d]/.test(v.label || ''), at: v.labelAt }, () => aroundPoint(a, v.label, { size: 14, gap: 3, prefer }));
    });
  });
  // 3) circle centres
  arr(g.circles).forEach((c, i) => {
    if (!pt(c.cx, c.cy)) return;
    add(`c:${i}`, c.centreLabel, { size: 14, italic: !/[$\d]/.test(c.centreLabel || ''), at: c.centreLabelAt },
      () => aroundPoint(P(c.cx, c.cy), c.centreLabel, { size: 14, gap: 4, prefer: { x: -1, y: 1 } }));
  });
  // 4) angle labels: inside the angle, off its bisector if a line runs along it
  angleDefs.forEach((d) => {
    const { a1, sw } = angleGeom(d);
    const base = Math.abs(sw) < 0.5 ? 30 : 20;
    add(d.id, d.label, { color: d.color, size: 12, at: d.at }, () => {
      const out = [];
      [base + 14, base + 22, base + 32, base + 44, base + 58, base + 74].forEach((r, ri) => {
        [0.5, 0.35, 0.65, 0.25, 0.75, 0.15, 0.85].forEach((t, ti) => {
          const ang = a1 + sw * t;
          out.push({ x: d.V.x + r * Math.cos(ang), y: d.V.y + r * Math.sin(ang), pen: ri * 3 + ti * 1.2 });
        });
      });
      return out;
    });
  });
  // 5) side lengths
  polys.forEach(({ p, ks, px, closed }, i) => {
    const cen = centroid(px); const n = px.length;
    ks.forEach((k, j) => {
      if (!closed && j === n - 1) return;
      const sd = arr(p.sides)[k] || {};
      add(`s:${i}:${k}`, sd.label, { color: p.color || INK, size: 12, at: sd.labelAt }, () => besideSegment(px[j], px[(j + 1) % n], sd.label, { away: n >= 3 ? cen : undefined }));
    });
  });
  arr(g.segments).forEach((sg, i) => {
    if (!pt(sg.x1, sg.y1) || !pt(sg.x2, sg.y2)) return;
    add(`g:${i}`, sg.label, { color: sg.color || INK, size: 12, at: sg.labelAt }, () => besideSegment(P(sg.x1, sg.y1), P(sg.x2, sg.y2), sg.label));
  });
  arr(g.circles).forEach((c, i) => {
    if (!c.showRadius || !pt(c.cx, c.cy) || !isNum(c.r)) return;
    const ang = (num(c.radiusAngle, 30) * Math.PI) / 180;
    const C = P(c.cx, c.cy); const R = P(+c.cx + +c.r * Math.cos(ang), +c.cy + +c.r * Math.sin(ang));
    add(`r:${i}`, c.radiusLabel, { color: c.color || INK, size: 12, at: c.radiusLabelAt }, () => besideSegment(C, R, c.radiusLabel));
  });
  arr(g.arcs).forEach((a, i) => {
    if (!pt(a.cx, a.cy) || !isNum(a.r)) return;
    let s0 = num(a.start, 0); let e0 = num(a.end, 90); while (e0 < s0) e0 += 360;
    add(`a:${i}`, a.label, { color: a.color || INK, size: 12, at: a.labelAt }, () => {
      const out = [];
      (a.sector ? [0.45, 0.6, 0.3, 1.2] : [1.18, 1.32, 0.8]).forEach((k, ki) => [0.5, 0.35, 0.65].forEach((t, ti) => {
        const ang = ((s0 + (e0 - s0) * t) * Math.PI) / 180;
        const q = P(+a.cx + +a.r * k * Math.cos(ang), +a.cy + +a.r * k * Math.sin(ang));
        out.push({ ...q, pen: ki * 3 + ti });
      }));
      return out;
    });
  });
  // 6) formula labels, beside their own curve
  arr(g.functions).forEach((f, i) => {
    const c = curves[i];
    if (!c?.visible?.length) return;
    add(`f:${i}`, f.label, { color: c.color, size: 13, at: f.labelAt }, () => {
      const cands = [];
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
      return cands;
    }, { owner: `f${i}` });
  });
  arr(g.lines).forEach((l, i) => {
    const e = lineEnds[i];
    if (!e) return;
    const [a, b] = e;
    add(`l:${i}`, l.label, { color: l.color || INK, size: 13, at: l.labelAt }, () => {
      const cands = [];
      [0.88, 0.8, 0.72, 0.64, 0.12, 0.2, 0.28, 0.36, 0.5].forEach((frac, fi) => {
        const m = { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac };
        besideSegment({ x: m.x - (b.x - a.x) * 0.01, y: m.y - (b.y - a.y) * 0.01 }, { x: m.x + (b.x - a.x) * 0.01, y: m.y + (b.y - a.y) * 0.01 }, l.label)
          .filter((_, k) => k % 5 === 0)
          .forEach((cand, si) => cands.push({ ...cand, ax: m.x, ay: m.y, pen: fi * 0.6 + si * 1.5 }));
      });
      return cands;
    }, { owner: `l${i}` });
  });

  // Axis numbers under a point or a label make way.
  const boxes = pl.placedBoxes();
  const markers = arr(g.points).filter((p) => pt(p.x, p.y)).map((p) => { const c = P(p.x, p.y); return { l: c.x - 6, r: c.x + 6, t: c.y - 6, b: c.y + 6 }; });
  const hits = (b) => [...boxes, ...markers].some((o) => Math.min(b.r, o.r) > Math.max(b.l, o.l) && Math.min(b.b, o.b) > Math.max(b.t, o.t));
  [...tickNums.x, ...tickNums.y].forEach((t) => { t.show = !hits(t.box); });
  return { items, angleDefs };
}
