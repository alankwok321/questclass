import React, { useMemo } from 'react';
import { num } from './model.js';
import { AngleMark, Frame, Label, SideDecor, centroid } from './svg.jsx';

// 3D figures in oblique projection, hidden edges dashed.
// { shape, a, b, c, labels: 'A,B,C…', flip, faces: bool,
//   points:   [{ label, of: 'AB' | 'ABCD', t }],        // point on an edge (t from first letter) or centre of a face
//   segments: [{ from, to, style: 'solid'|'dashed'|'none', label }],
//   angles:   [{ at, from, to, mark, label }] }

export const SOLIDS = [
  { shape: 'cuboid', label: '長方體', dims: ['長', '闊', '高'], roles: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] },
  { shape: 'cube', label: '正方體', dims: ['邊長'], roles: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] },
  { shape: 'pyramid', label: '直立長方錐體', dims: ['底長', '底闊', '高'], roles: ['A', 'B', 'C', 'D', 'V'] },
  { shape: 'tetrahedron', label: '三角錐體（四面體）', dims: ['底邊', '底深', '高'], roles: ['A', 'B', 'C', 'D'] },
  { shape: 'prism', label: '三角柱體', dims: ['底', '長', '高'], roles: ['A', 'B', 'C', 'D', 'E', 'F'] },
  { shape: 'rightprism', label: '直角三角柱體', dims: ['底', '長', '高'], roles: ['A', 'B', 'C', 'D', 'E', 'F'] },
  { shape: 'cylinder', label: '圓柱體', dims: ['半徑', '', '高'], roles: ['O', 'P', 'A', 'B', 'C', 'D'], roleNames: ['底圓心', '頂圓心', '底右', '底左', '頂右', '頂左'], defaultLabels: ['', '', '', '', '', ''] },
  { shape: 'cone', label: '圓錐體', dims: ['半徑', '', '高'], roles: ['V', 'O', 'A', 'B'], roleNames: ['頂點', '底圓心', '底右', '底左'], defaultLabels: ['V', 'O', '', ''] },
  { shape: 'frustum', label: '平截頭圓錐體', dims: ['底半徑', '頂半徑', '高'], roles: ['O', 'P', 'A', 'B', 'C', 'D'], roleNames: ['底圓心', '頂圓心', '底右', '底左', '頂右', '頂左'], defaultLabels: ['', '', '', '', '', ''] },
  { shape: 'sphere', label: '球體', dims: ['半徑'], roles: ['O', 'A'], roleNames: ['球心', '球面右點'], defaultLabels: ['O', ''] },
  { shape: 'hemisphere', label: '半球體', dims: ['半徑'], roles: ['O', 'A', 'T'], roleNames: ['圓心', '底右', '頂點'], defaultLabels: ['O', '', ''] },
];

export const solidInfo = (shape) => SOLIDS.find((s) => s.shape === shape) || SOLIDS[0];

/** "A,B,C" / "A B C" / "ABC" → list. Missing entries fall back to the defaults. */
export function solidLabels(fig) {
  const info = solidInfo(fig.shape);
  const defaults = info.defaultLabels || info.roles;
  const raw = String(fig.labels ?? '').trim();
  const list = !raw ? [] : /[,\s，]/.test(raw) ? raw.split(/[,\s，]+/) : [...raw];
  return info.roles.map((_, i) => (list[i] !== undefined ? (list[i] === '-' ? '' : list[i]) : defaults[i]));
}

function geometry(fig) {
  const shape = fig.shape || 'cuboid';
  let a = Math.max(0.1, num(fig.a, 6));
  let b = Math.max(0.1, num(fig.b, 4));
  let c = Math.max(0.1, num(fig.c, 3));
  if (shape === 'cube') { b = a; c = a; }
  const V = (x, y, z) => ({ x, y, z });
  switch (shape) {
    case 'cuboid': case 'cube':
      return { kind: 'poly', verts: [V(0, 0, 0), V(a, 0, 0), V(a, b, 0), V(0, b, 0), V(0, 0, c), V(a, 0, c), V(a, b, c), V(0, b, c)],
        faces: [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]] };
    case 'pyramid':
      return { kind: 'poly', verts: [V(0, 0, 0), V(a, 0, 0), V(a, b, 0), V(0, b, 0), V(a / 2, b / 2, c)],
        faces: [[0, 1, 2, 3], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]] };
    case 'tetrahedron': {
      const C = V(a * 0.35, b, 0);
      return { kind: 'poly', verts: [V(0, 0, 0), V(a, 0, 0), C, V((a + C.x) / 3, b / 3, c)],
        faces: [[0, 1, 2], [0, 1, 3], [1, 2, 3], [2, 0, 3]] };
    }
    case 'prism': case 'rightprism': {
      // Triangle ABC at the front (x–z plane), DEF behind it.
      const px = shape === 'rightprism' ? 0 : a / 2;
      return { kind: 'poly', verts: [V(0, 0, 0), V(a, 0, 0), V(px, 0, c), V(0, b, 0), V(a, b, 0), V(px, b, c)],
        faces: [[0, 1, 2], [3, 4, 5], [0, 1, 4, 3], [1, 2, 5, 4], [2, 0, 3, 5]] };
    }
    case 'cylinder': return { kind: 'round', r: a, h: c, top: a, pts: [V(0, 0, 0), V(0, 0, c), V(a, 0, 0), V(-a, 0, 0), V(a, 0, c), V(-a, 0, c)] };
    case 'frustum': { const t = Math.min(b, a); return { kind: 'round', r: a, h: c, top: t, pts: [V(0, 0, 0), V(0, 0, c), V(a, 0, 0), V(-a, 0, 0), V(t, 0, c), V(-t, 0, c)] }; }
    case 'cone': return { kind: 'round', r: a, h: c, top: 0, pts: [V(0, 0, c), V(0, 0, 0), V(a, 0, 0), V(-a, 0, 0)] };
    case 'sphere': return { kind: 'sphere', r: a, pts: [V(0, 0, 0), V(a, 0, 0)] };
    case 'hemisphere': return { kind: 'hemi', r: a, pts: [V(0, 0, 0), V(a, 0, 0), V(0, 0, a)] };
    default: return null;
  }
}

const sub3 = (p, q) => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });
const cross = (u, v) => ({ x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x });
const dot = (u, v) => u.x * v.x + u.y * v.y + u.z * v.z;

export default function SolidFigure({ fig, maxWidth = 400, caption }) {
  const data = useMemo(() => build(fig), [fig]);
  if (!data) return null;
  const { W, H, edges, curves, labelPts, cen, segs, angs } = data;
  return (
    <Frame width={W} height={H} maxWidth={maxWidth} caption={caption} label="立體圖形">
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {curves.map((c, i) => <path key={`cv${i}`} d={c.d} stroke={c.hidden ? '#6E6E73' : '#1D1D1F'} strokeWidth={c.hidden ? 1.3 : 1.8} strokeDasharray={c.hidden ? '6 5' : undefined} />)}
        {edges.map((e, i) => (
          <line key={`e${i}`} x1={e.p.x} y1={e.p.y} x2={e.q.x} y2={e.q.y}
            stroke={e.hidden ? '#6E6E73' : '#1D1D1F'} strokeWidth={e.hidden ? 1.3 : 1.8} strokeDasharray={e.hidden ? '6 5' : undefined} />
        ))}
        {segs.map((s, i) => s.style !== 'none' && (
          <line key={`s${i}`} x1={s.p.x} y1={s.p.y} x2={s.q.x} y2={s.q.y} stroke={s.color || '#0071E3'} strokeWidth="1.6" strokeDasharray={s.style === 'dashed' ? '6 5' : undefined} />
        ))}
      </g>
      {segs.map((s, i) => s.label && <SideDecor key={`sl${i}`} p1={s.p} p2={s.q} label={s.label} away={cen} />)}
      {angs.map((a, i) => <AngleMark key={`a${i}`} V={a.V} P={a.P} N={a.N} mark={a.mark || '1'} label={a.label} radius={16} />)}
      {labelPts.map((l) => <circle key={`d${l.name}`} cx={l.p.x} cy={l.p.y} r={l.derived ? 2.6 : 0} fill="#1D1D1F" />)}
      {labelPts.map((l) => {
        let d = { x: l.p.x - cen.x, y: l.p.y - cen.y };
        const L = Math.hypot(d.x, d.y);
        d = L < 1 ? { x: 0.7, y: -0.7 } : { x: d.x / L, y: d.y / L };
        return <Label key={`l${l.name}`} x={l.p.x + d.x * 14} y={l.p.y + d.y * 14} text={l.name} size={14} italic={!/\$/.test(l.name)} />;
      })}
    </Frame>
  );
}

function build(fig) {
  const geo = geometry(fig);
  if (!geo) return null;
  const flip = !!fig.flip;
  const round = geo.kind !== 'poly';
  const th = round ? Math.PI / 2 : (35 * Math.PI) / 180;
  const k = round ? 0.32 : 0.5;
  const dir = flip ? -1 : 1;
  const proj = (p) => ({ x: p.x + dir * p.y * k * Math.cos(th), y: -(p.z + p.y * k * Math.sin(th)) });
  const viewDir = { x: -dir * k * Math.cos(th), y: 1, z: -k * Math.sin(th) };

  const labels = solidLabels(fig);
  const named3 = new Map();
  const basePts = geo.kind === 'poly' ? geo.verts : geo.pts;
  basePts.forEach((p, i) => { if (labels[i]) named3.set(labels[i], p); });

  // Derived points: on an edge ("AB", t) or the centre of a face ("ABCD").
  const splitNames = (s) => {
    const str = String(s || '').trim();
    if (/[,\s]/.test(str)) return str.split(/[,\s]+/).filter(Boolean);
    // Greedy match against known names (handles labels like O′ or V1).
    const out = []; let rest = str;
    const known = [...named3.keys()].sort((x, y) => y.length - x.length);
    while (rest) {
      const m = known.find((n) => rest.startsWith(n));
      if (!m) { out.push(rest[0]); rest = rest.slice(1); } else { out.push(m); rest = rest.slice(m.length); }
    }
    return out;
  };
  const derived = new Set();
  for (const p of Array.isArray(fig.points) ? fig.points : []) {
    if (!p?.label) continue;
    const refs = splitNames(p.of).map((n) => named3.get(n));
    if (!refs.length || refs.some((r) => !r)) continue;
    let q;
    if (refs.length === 2) {
      const t = num(p.t, 0.5);
      q = { x: refs[0].x + (refs[1].x - refs[0].x) * t, y: refs[0].y + (refs[1].y - refs[0].y) * t, z: refs[0].z + (refs[1].z - refs[0].z) * t };
    } else {
      q = { x: refs.reduce((s, r) => s + r.x, 0) / refs.length, y: refs.reduce((s, r) => s + r.y, 0) / refs.length, z: refs.reduce((s, r) => s + r.z, 0) / refs.length };
    }
    named3.set(p.label, q); derived.add(p.label);
  }

  // Raw 2D geometry before fitting.
  const edges = []; const curves = [];
  if (geo.kind === 'poly') {
    const c3 = geo.verts.reduce((s, v) => ({ x: s.x + v.x / geo.verts.length, y: s.y + v.y / geo.verts.length, z: s.z + v.z / geo.verts.length }), { x: 0, y: 0, z: 0 });
    const front = geo.faces.map((f) => {
      let n = cross(sub3(geo.verts[f[1]], geo.verts[f[0]]), sub3(geo.verts[f[2]], geo.verts[f[0]]));
      if (dot(n, sub3(geo.verts[f[0]], c3)) < 0) n = { x: -n.x, y: -n.y, z: -n.z };
      return dot(n, viewDir) < -1e-9;
    });
    const seen = new Map();
    geo.faces.forEach((f, fi) => f.forEach((v, i) => {
      const w = f[(i + 1) % f.length];
      const key = v < w ? `${v}-${w}` : `${w}-${v}`;
      seen.set(key, (seen.get(key) || false) || front[fi]);
    }));
    for (const [key, visible] of seen) {
      const [i, j] = key.split('-').map(Number);
      edges.push({ p: proj(geo.verts[i]), q: proj(geo.verts[j]), hidden: !visible });
    }
  } else {
    const ell = (cz, r, from, to) => { // ellipse arc in plane z=cz, angles in radians
      const pts = [];
      for (let i = 0; i <= 48; i += 1) { const t = from + ((to - from) * i) / 48; pts.push(proj({ x: r * Math.cos(t), y: r * Math.sin(t), z: cz })); }
      return pts;
    };
    if (geo.kind === 'round') {
      curves.push({ pts: ell(0, geo.r, Math.PI, 2 * Math.PI) }); // front half (y<0) visible
      curves.push({ pts: ell(0, geo.r, 0, Math.PI), hidden: true });
      if (geo.top > 0) curves.push({ pts: ell(geo.h, geo.top, 0, 2 * Math.PI) });
      const tr = geo.top;
      edges.push({ p: proj({ x: geo.r, y: 0, z: 0 }), q: proj({ x: tr, y: 0, z: geo.h }) });
      edges.push({ p: proj({ x: -geo.r, y: 0, z: 0 }), q: proj({ x: -tr, y: 0, z: geo.h }) });
    } else if (geo.kind === 'sphere') {
      const circ = [];
      for (let i = 0; i <= 96; i += 1) { const t = (2 * Math.PI * i) / 96; circ.push({ x: geo.r * Math.cos(t), y: -geo.r * Math.sin(t) }); }
      curves.push({ pts: circ });
      curves.push({ pts: ell(0, geo.r, Math.PI, 2 * Math.PI) });
      curves.push({ pts: ell(0, geo.r, 0, Math.PI), hidden: true });
    } else if (geo.kind === 'hemi') {
      const dome = [];
      for (let i = 0; i <= 48; i += 1) { const t = (Math.PI * i) / 48; dome.push({ x: geo.r * Math.cos(t), y: -geo.r * Math.sin(t) }); }
      curves.push({ pts: dome });
      curves.push({ pts: ell(0, geo.r, Math.PI, 2 * Math.PI) });
      curves.push({ pts: ell(0, geo.r, 0, Math.PI), hidden: true });
    }
  }

  const name2 = new Map([...named3].map(([n, p]) => [n, proj(p)]));
  const segsRaw = (Array.isArray(fig.segments) ? fig.segments : []).map((s) => ({ ...s, p: name2.get(String(s.from || '').trim()), q: name2.get(String(s.to || '').trim()) })).filter((s) => s.p && s.q);
  const angRaw = (Array.isArray(fig.angles) ? fig.angles : []).map((a) => ({ ...a, V: name2.get(String(a.at || '').trim()), P: name2.get(String(a.from || '').trim()), N: name2.get(String(a.to || '').trim()) })).filter((a) => a.V && a.P && a.N);

  // Fit into the frame.
  const all = [...edges.flatMap((e) => [e.p, e.q]), ...curves.flatMap((c) => c.pts), ...name2.values()];
  const minX = Math.min(...all.map((p) => p.x)); const maxX = Math.max(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y)); const maxY = Math.max(...all.map((p) => p.y));
  const W = 400; const pad = 34;
  let s = (W - 2 * pad) / Math.max(1e-6, maxX - minX);
  if ((maxY - minY) * s > 320) s = 320 / (maxY - minY);
  const H = Math.round((maxY - minY) * s + 2 * pad);
  const offX = (W - (maxX - minX) * s) / 2;
  const F = (p) => ({ x: offX + (p.x - minX) * s, y: pad + (p.y - minY) * s });

  const fe = edges.map((e) => ({ ...e, p: F(e.p), q: F(e.q) }));
  const fc = curves.map((c) => ({ hidden: c.hidden, d: c.pts.map((p, i) => { const q = F(p); return `${i ? 'L' : 'M'}${q.x.toFixed(2)},${q.y.toFixed(2)}`; }).join(' ') }));
  const labelPts = [...name2].map(([name, p]) => ({ name, p: F(p), derived: derived.has(name) }));
  const cen = centroid(geo.kind === 'poly' ? geo.verts.map((v) => F(proj(v))) : labelPts.map((l) => l.p).concat(fe.flatMap((e) => [e.p, e.q])));
  return {
    W, H, edges: fe, curves: fc, labelPts, cen,
    segs: segsRaw.map((x) => ({ ...x, p: F(x.p), q: F(x.q) })),
    angs: angRaw.map((x) => ({ ...x, V: F(x.V), P: F(x.P), N: F(x.N) })),
  };
}
