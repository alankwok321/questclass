// Automatic label placement: each label tries several positions around its anchor and takes the
// one that touches the fewest lines, curves, numbers and other labels. Everything is in SVG pixels.

/** Rough width of a label in px (LaTeX commands count as one character). */
export function textWidth(text, size = 13) {
  const raw = String(text ?? '');
  let w = 0;
  // Plain text and maths are measured separately: KaTeX adds space around = + − and sets letters wider.
  raw.split(/(\$[^$]*\$)/).forEach((part) => {
    if (!part) return;
    const math = part.startsWith('$') && part.endsWith('$') && part.length > 1;
    let t = math ? part.slice(1, -1) : part;
    let extra = 0;
    if (math) {
      t = t.replace(/\\(d?frac)\{([^}]*)\}\{([^}]*)\}/g, (_, __, a, b) => (a.length > b.length ? a : b));
      t = t.replace(/\\(sin|cos|tan|log|ln|exp|min|max)/g, '$1');
      t = t.replace(/\\[a-zA-Z]+/g, 'x');
      extra += (t.match(/[=<>+\-−≤≥]|\\le|\\ge/g) || []).length * size * 0.55;
      t = t.replace(/[{}^_\\]/g, '');
    }
    for (const ch of t) {
      w += /[⺀-鿿＀-￯]/.test(ch) ? size
        : /[A-Z0-9()]/.test(ch) ? size * (math ? 0.75 : 0.64)
        : ch === ' ' ? size * 0.3
        : size * (math ? 0.72 : 0.55);
    }
    w += extra;
  });
  return w + 6;
}

const boxOf = (cx, cy, w, h) => ({ l: cx - w / 2, r: cx + w / 2, t: cy - h / 2, b: cy + h / 2 });
const overlap = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));

function segHitsBox(x1, y1, x2, y2, bx) {
  // Liang–Barsky against the box.
  let t0 = 0; let t1 = 1;
  const dx = x2 - x1; const dy = y2 - y1;
  const edges = [[-dx, x1 - bx.l], [dx, bx.r - x1], [-dy, y1 - bx.t], [dy, bx.b - y1]];
  for (const [p, q] of edges) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}

export function createPlacer(width, height) {
  const segs = [];   // [x1, y1, x2, y2]
  const rects = [];  // { box, weight }
  const placed = []; // boxes of labels already placed
  const owned = new Map(); // owner id → sampled points of that curve/line (to keep labels next to their own)

  const api = {
    addSegment(a, b) {
      if ([a.x, a.y, b.x, b.y].every(Number.isFinite)) segs.push([a.x, a.y, b.x, b.y]);
    },
    addPolyline(pts, step = 1, owner) {
      if (owner) owned.set(owner, [...(owned.get(owner) || []), ...pts.filter((_, i) => i % step === 0)]);
      for (let i = step; i < pts.length; i += step) api.addSegment(pts[i - step], pts[i]);
      if (pts.length > 1 && (pts.length - 1) % step) api.addSegment(pts[pts.length - 1 - ((pts.length - 1) % step)], pts[pts.length - 1]);
    },
    addRect(box, weight = 6) { rects.push({ box, weight }); },
    addMarker(p, r = 5) { rects.push({ box: { l: p.x - r, r: p.x + r, t: p.y - r, b: p.y + r }, weight: 30 }); },

    cost(box) {
      let c = 0;
      const pad = 3; const out = Math.max(0, pad - box.l) + Math.max(0, box.r - (width - pad)) + Math.max(0, pad - box.t) + Math.max(0, box.b - (height - pad));
      c += out * 8;
      // A little breathing room: a line grazing the label's edge looks as bad as one through it.
      const grown = { l: box.l - 3, r: box.r + 3, t: box.t - 2, b: box.b + 2 };
      for (const s of segs) if (segHitsBox(s[0], s[1], s[2], s[3], grown)) c += 25;
      for (const { box: rb, weight } of rects) if (overlap(box, rb) > 0) c += weight + overlap(box, rb) * 0.05;
      for (const pb of placed) { const o = overlap(box, pb); if (o > 0) c += 60 + o * 0.2; }
      return c;
    },

    /**
     * candidates: [{ x, y }] label centres in order of preference.
     * Returns the chosen centre and remembers the label so later ones avoid it.
     */
    // Distance from a box to the nearest sampled point of a curve/line.
    distTo(box, pts) {
      let d = Infinity;
      for (const p of pts) {
        const dx = Math.max(box.l - p.x, 0, p.x - box.r); const dy = Math.max(box.t - p.y, 0, p.y - box.b);
        const v = Math.hypot(dx, dy);
        if (v < d) d = v;
      }
      return d;
    },

    /**
     * candidates: [{ x, y, pen?, ax?, ay? }] label centres in order of preference.
     * owner: the curve/line the label names — the label must end up nearer to it than to any other.
     * Returns the chosen centre (plus a leader line when it sits away from its curve).
     */
    place(text, candidates, { size = 13, h = size + 5, owner } = {}) {
      const w = textWidth(text, size);
      const mine = owner ? owned.get(owner) : null;
      const others = owner ? [...owned].filter(([k]) => k !== owner).map(([, v]) => v) : [];
      let best = null;
      candidates.forEach((cand, i) => {
        const box = boxOf(cand.x, cand.y, w, h);
        let c = api.cost(box) + (cand.pen ?? i * 0.8);
        if (mine?.length) {
          const dMine = api.distTo(box, mine);
          c += dMine * 0.6;
          // Nearer to another curve than to its own: a reader would match it to the wrong graph.
          for (const o of others) if (api.distTo(box, o) < dMine + 4) { c += 80; break; }
        }
        if (!best || c < best.c) best = { c, x: cand.x, y: cand.y, box, ax: cand.ax, ay: cand.ay, d: mine?.length ? api.distTo(box, mine) : 0 };
      });
      if (!best) return null;
      placed.push(best.box);
      const res = { x: best.x, y: best.y, box: best.box };
      if (best.d > 10 && Number.isFinite(best.ax)) {
        // Leader from the box edge to the curve point.
        const ex = Math.max(best.box.l, Math.min(best.ax, best.box.r));
        const ey = Math.max(best.box.t, Math.min(best.ay, best.box.b));
        res.leader = { x1: ex, y1: ey, x2: best.ax, y2: best.ay };
      }
      return res;
    },
    placedBoxes: () => placed,
  };
  return api;
}

/** Candidate centres around a point (8 directions × 2 distances), preferred direction first. */
export function aroundPoint(p, text, { size = 13, gap = 5, prefer = { x: 1, y: -1 } } = {}) {
  const w = textWidth(text, size); const h = size + 5;
  const dirs = [[1, -1], [-1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [1, 0], [-1, 0]];
  const pl = Math.hypot(prefer.x, prefer.y) || 1;
  const px = prefer.x / pl; const py = prefer.y / pl;
  dirs.sort((a, b) => {
    const da = (a[0] * px + a[1] * py) / Math.hypot(a[0], a[1]);
    const db = (b[0] * px + b[1] * py) / Math.hypot(b[0], b[1]);
    return db - da;
  });
  const out = [];
  for (const extra of [0, 9]) {
    for (const [dx, dy] of dirs) {
      out.push({ x: p.x + dx * (w / 2 + gap + extra), y: p.y + dy * (h / 2 + gap - 2 + extra) });
    }
  }
  return out;
}

/** Candidate centres beside a segment a→b: preferred side first, sliding along the segment. */
export function besideSegment(a, b, text, { size = 12, away } = {}) {
  const w = textWidth(text, size); const h = size + 5;
  const dx = b.x - a.x; const dy = b.y - a.y; const L = Math.hypot(dx, dy) || 1;
  const tx = dx / L; const ty = dy / L;
  let nx = -ty; let ny = tx;
  if (away) {
    const mx = (a.x + b.x) / 2; const my = (a.y + b.y) / 2;
    if (nx * (away.x - mx) + ny * (away.y - my) > 0) { nx = -nx; ny = -ny; }
  } else if (ny > 0) { nx = -nx; ny = -ny; }
  // Distance so the label box just clears the line, whatever the slope.
  const clear = Math.abs(nx) * (w / 2) + Math.abs(ny) * (h / 2) + 4;
  const out = [];
  for (const side of [1, -1]) {
    for (const f of [0.5, 0.35, 0.65, 0.22, 0.78]) {
      const mx = a.x + dx * f; const my = a.y + dy * f;
      out.push({ x: mx + nx * clear * side, y: my + ny * clear * side });
    }
  }
  return out;
}
