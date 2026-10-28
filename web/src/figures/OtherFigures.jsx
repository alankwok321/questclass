import React, { useMemo, useId } from 'react';
import { COLORS, isNum, num } from './model.js';
import { Frame, Label, fmtNum } from './svg.jsx';

const INK = '#1D1D1F';
const W = 440;

// ── Number line ───────────────────────────────────────────────────────────────
// { min, max, step, intervals: [{ from, to, fromIncl, toIncl }], points: [{ at, open, label }] }
// An empty "from" means −∞, an empty "to" means +∞.
export function NumberLineFigure({ fig, maxWidth = 440, caption }) {
  const min = num(fig.min, -5); let max = num(fig.max, 5);
  if (max <= min) max = min + 10;
  const step = num(fig.step, 1) > 0 ? num(fig.step, 1) : 1;
  const ivs = (Array.isArray(fig.intervals) ? fig.intervals : []).filter((iv) => iv && (isNum(iv.from) || isNum(iv.to)));
  const pts = (Array.isArray(fig.points) ? fig.points : []).filter((p) => p && isNum(p.at));
  const single = ivs.length <= 1;
  const levels = single ? 0 : ivs.length;
  const L = 26; const R = W - 26;
  const axisY = 30 + levels * 20;
  const H = axisY + 34;
  const sx = (x) => L + 10 + ((x - min) / (max - min)) * (R - L - 20);
  const ticks = [];
  if ((max - min) / step <= 40) for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + 1e-9; v += step) ticks.push(Math.round(v / step) * step);
  const uid = useId().replace(/:/g, '');
  return (
    <Frame width={W} height={H} maxWidth={maxWidth} caption={caption} label="數線">
      <defs>
        <marker id={`${uid}a`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={INK} />
        </marker>
        <marker id={`${uid}b`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={COLORS[0]} />
        </marker>
      </defs>
      <line x1={L} x2={R} y1={axisY} y2={axisY} stroke={INK} strokeWidth="1.4" markerStart={`url(#${uid}a)`} markerEnd={`url(#${uid}a)`} />
      {ticks.map((v) => (
        <g key={`t${v}`}>
          <line x1={sx(v)} x2={sx(v)} y1={axisY - 4} y2={axisY + 4} stroke={INK} />
          <text x={sx(v)} y={axisY + 17} fontSize="12" fill="#3A3A3C" textAnchor="middle">{fmtNum(v)}</text>
        </g>
      ))}
      {ivs.map((iv, i) => {
        const y = single ? axisY : axisY - 20 * (i + 1);
        const color = iv.color || COLORS[0];
        const a = isNum(iv.from) ? sx(+iv.from) : L + 2;
        const b = isNum(iv.to) ? sx(+iv.to) : R - 2;
        return (
          <g key={`i${i}`}>
            <line x1={a} x2={b} y1={y} y2={y} stroke={color} strokeWidth="3.2"
              markerStart={!isNum(iv.from) ? `url(#${uid}b)` : undefined} markerEnd={!isNum(iv.to) ? `url(#${uid}b)` : undefined} />
            {!single && isNum(iv.from) && <line x1={a} x2={a} y1={y} y2={axisY} stroke={color} strokeWidth="1" strokeDasharray="3 3" />}
            {!single && isNum(iv.to) && <line x1={b} x2={b} y1={y} y2={axisY} stroke={color} strokeWidth="1" strokeDasharray="3 3" />}
            {isNum(iv.from) && <circle cx={a} cy={y} r="5" fill={iv.fromIncl ? color : '#fff'} stroke={color} strokeWidth="2" />}
            {isNum(iv.to) && <circle cx={b} cy={y} r="5" fill={iv.toIncl ? color : '#fff'} stroke={color} strokeWidth="2" />}
          </g>
        );
      })}
      {pts.map((p, i) => (
        <g key={`p${i}`}>
          <circle cx={sx(+p.at)} cy={axisY} r="5" fill={p.open ? '#fff' : INK} stroke={INK} strokeWidth="2" />
          {p.label && <Label x={sx(+p.at)} y={axisY - 16} text={p.label} size={13} />}
        </g>
      ))}
    </Frame>
  );
}

// ── Venn diagram ──────────────────────────────────────────────────────────────
// { sets: 2|3, labels: ['A','B','C'], universal: 'U', regions: { a, b, ab, none, … }, shaded: ['ab', …] }
export const VENN_REGIONS = {
  2: [['a', '只屬 A'], ['b', '只屬 B'], ['ab', 'A 和 B'], ['none', '兩者皆否']],
  3: [['a', '只屬 A'], ['b', '只屬 B'], ['c', '只屬 C'], ['ab', 'A、B 非 C'], ['ac', 'A、C 非 B'], ['bc', 'B、C 非 A'], ['abc', 'A、B、C'], ['none', '三者皆否']],
};
const VENN = {
  2: { H: 270, circles: [[168, 135, 92], [272, 135, 92]], pos: { a: [122, 135], b: [318, 135], ab: [220, 135], none: [40, 248] } },
  3: { H: 310, circles: [[180, 118, 82], [262, 118, 82], [221, 190, 82]], pos: { a: [146, 98], b: [296, 98], c: [221, 232], ab: [221, 86], ac: [174, 176], bc: [268, 176], abc: [221, 146], none: [40, 288] } },
};

export function VennFigure({ fig, maxWidth = 420, caption }) {
  const uid = useId().replace(/:/g, '');
  const n = Number(fig.sets) === 3 ? 3 : 2;
  const cfg = VENN[n];
  const keys = ['a', 'b', 'c'].slice(0, n);
  const labels = Array.isArray(fig.labels) ? fig.labels : ['A', 'B', 'C'];
  const regions = fig.regions && typeof fig.regions === 'object' ? fig.regions : {};
  const shaded = Array.isArray(fig.shaded) ? fig.shaded : [];
  const U = { x: 12, y: 12, w: W - 24, h: cfg.H - 24 };
  return (
    <Frame width={W} height={cfg.H} maxWidth={maxWidth} caption={caption} label="溫氏圖">
      <defs>
        {cfg.circles.map(([cx, cy, r], i) => <clipPath key={i} id={`${uid}c${i}`}><circle cx={cx} cy={cy} r={r} /></clipPath>)}
        {shaded.map((key) => {
          const inn = key === 'none' ? [] : [...key].map((ch) => keys.indexOf(ch)).filter((i) => i >= 0);
          const out = keys.map((_, i) => i).filter((i) => !inn.includes(i));
          let core = <rect x={U.x} y={U.y} width={U.w} height={U.h} fill="#fff" />;
          for (const i of inn) core = <g clipPath={`url(#${uid}c${i})`}>{core}</g>;
          return (
            <mask key={key} id={`${uid}m${key}`}>
              <rect x="0" y="0" width={W} height={cfg.H} fill="#000" />
              {core}
              {out.map((i) => { const [cx, cy, r] = cfg.circles[i]; return <circle key={i} cx={cx} cy={cy} r={r} fill="#000" />; })}
            </mask>
          );
        })}
      </defs>
      {shaded.map((key) => <rect key={key} x={U.x} y={U.y} width={U.w} height={U.h} fill={COLORS[0]} fillOpacity="0.28" mask={`url(#${uid}m${key})`} />)}
      <rect x={U.x} y={U.y} width={U.w} height={U.h} fill="none" stroke={INK} strokeWidth="1.5" />
      <Label x={U.x + 14} y={U.y + 16} text={fig.universal ?? 'U'} size={15} italic anchor="start" />
      {cfg.circles.map(([cx, cy, r], i) => <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={INK} strokeWidth="1.6" />)}
      {cfg.circles.map(([cx, cy, r], i) => {
        const dx = i === 1 ? 0.78 : i === 0 ? -0.78 : 0.95; const dy = i === 2 ? 0.75 : -0.8;
        return <Label key={`n${i}`} x={cx + dx * r} y={cy + dy * r - (i === 2 ? -6 : 6)} text={labels[i] || keys[i].toUpperCase()} size={15} italic anchor="middle" />;
      })}
      {Object.entries(cfg.pos).map(([k, [x, y]]) => regions[k] !== undefined && regions[k] !== '' && (
        <Label key={k} x={x} y={y} text={String(regions[k])} size={13} anchor={k === 'none' ? 'start' : 'middle'} />
      ))}
    </Frame>
  );
}

// ── Tree diagram ──────────────────────────────────────────────────────────────
// text: one branch per line, indented two spaces per level: "label | probability"
export function parseTree(text) {
  const root = { children: [], depth: -1 };
  const stack = [root];
  for (const raw of String(text || '').split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const indent = raw.replace(/\t/g, '  ').match(/^ */)[0].length;
    const depth = Math.floor(indent / 2);
    const [label, prob] = raw.trim().split('|').map((s) => s.trim());
    const node = { label, prob: prob || '', children: [], depth };
    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
    const parent = stack[stack.length - 1];
    node.depth = parent.depth + 1;
    parent.children.push(node);
    stack.push(node);
  }
  return root;
}

export function TreeFigure({ fig, maxWidth = 440, caption }) {
  const layout = useMemo(() => {
    const root = parseTree(fig.text);
    const leaves = [];
    let maxDepth = 0;
    const walk = (n, path) => {
      if (n.depth >= 0) maxDepth = Math.max(maxDepth, n.depth + 1);
      if (!n.children.length && n.depth >= 0) { leaves.push(n); n.path = path; }
      n.children.forEach((c) => walk(c, [...path, c.label]));
    };
    walk(root, []);
    if (!leaves.length) return null;
    const rowH = 36; const T = 20;
    const H = T * 2 + rowH * (leaves.length - 1) + 10;
    leaves.forEach((l, i) => { l.y = T + 5 + rowH * i; });
    const setY = (n) => { if (n.children.length) { n.children.forEach(setY); n.y = n.children.reduce((s, c) => s + c.y, 0) / n.children.length; } };
    setY(root);
    const outW = fig.showOutcomes ? 70 : 0;
    const colW = (W - 30 - outW) / maxDepth;
    const nodes = []; const edges = [];
    const place = (n) => {
      n.x = 16 + (n.depth + 1) * colW;
      n.children.forEach((c) => { place(c); edges.push({ from: n, to: c }); });
      if (n.depth >= 0) nodes.push(n);
    };
    root.x = 16;
    root.children.forEach((c) => { place(c); edges.push({ from: root, to: c }); });
    return { H, nodes, edges, leaves, outW };
  }, [fig.text, fig.showOutcomes]);
  if (!layout) return null;
  const { H, nodes, edges, leaves, outW } = layout;
  return (
    <Frame width={W} height={H} maxWidth={maxWidth} caption={caption} label="樹形圖">
      {edges.map((e, i) => {
        const x1 = e.from.depth < 0 ? e.from.x : e.from.x + 14; const x2 = e.to.x - 14;
        const mx = (x1 + x2) / 2; const my = (e.from.y + e.to.y) / 2;
        const above = e.to.y <= e.from.y;
        return (
          <g key={i}>
            <line x1={x1} y1={e.from.y} x2={x2} y2={e.to.y} stroke={INK} strokeWidth="1.4" />
            {e.to.prob && <Label x={mx} y={my + (above ? -13 : 13)} text={e.to.prob} size={16} />}
          </g>
        );
      })}
      {nodes.map((n, i) => <Label key={i} x={n.x} y={n.y} text={n.label} size={14} />)}
      {outW > 0 && leaves.map((l, i) => <Label key={`o${i}`} x={W - outW / 2 - 6} y={l.y} text={l.path.join('')} size={13} weight={500} />)}
    </Frame>
  );
}

// ── Image ─────────────────────────────────────────────────────────────────────
export function ImageFigure({ fig, maxWidth = 440, caption }) {
  if (!fig.src) return null;
  return (
    <figure style={{ margin: 0, maxWidth, width: '100%' }}>
      <img src={fig.src} alt={fig.alt || '題目圖片'} style={{ display: 'block', maxWidth: '100%', borderRadius: 12, border: '1px solid rgba(0,0,0,0.10)', background: '#fff' }} />
      {caption ? <figcaption style={{ textAlign: 'center', fontSize: 13, color: '#3A3A3C', marginTop: 4 }}>{caption}</figcaption> : null}
    </figure>
  );
}
