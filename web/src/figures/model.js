// Figures attached to a question: question.media.figures = [figure, …].
// Older questions have a single coordinate graph in question.media.graph — read as a 'plot' figure.
//
// Figure types (HKDSE Core + M1/M2 diagrams):
//   plot        coordinate graphs + plane geometry (functions, lines, polygons, circles, arcs, angles…)
//   solid       3D figures (cuboid, pyramid, prism, tetrahedron, cone, cylinder, sphere, hemisphere)
//   stats       statistics charts (bar, histogram, frequency polygon, cumulative frequency, pie,
//               box-and-whisker, scatter, line, stem-and-leaf, dot plot)
//   numberline  solution sets of inequalities
//   venn        2- or 3-set Venn diagrams
//   tree        probability tree diagrams
//   image       an uploaded picture (fallback for anything else)

export const COLORS = ['#0071E3', '#D70015', '#248A3D', '#C93400', '#8944AB', '#1D1D1F'];

export const FIGURE_TYPES = [
  { type: 'plot', label: '座標 / 幾何圖', hint: '函數圖像、直線、三角形、多邊形、圓、弧、扇形、角、線性規劃' },
  { type: 'solid', label: '立體圖形', hint: '長方體、角錐、角柱、四面體、圓錐、圓柱、球體' },
  { type: 'stats', label: '統計圖表', hint: '棒形圖、直方圖、頻數多邊形、累積頻數曲線、圓形圖、框線圖、散點圖、莖葉圖' },
  { type: 'numberline', label: '數線', hint: '不等式的解' },
  { type: 'venn', label: '溫氏圖', hint: '兩個或三個集合' },
  { type: 'tree', label: '樹形圖', hint: '概率' },
  { type: 'image', label: '上載圖片', hint: '其他圖像' },
];

export const typeLabel = (t) => FIGURE_TYPES.find((f) => f.type === t)?.label || t;

export function newFigure(type) {
  switch (type) {
    case 'plot': return {
      type, xMin: -5, xMax: 5, yMin: -5, yMax: 5, axes: true, grid: true, xLabel: 'x', yLabel: 'y', xUnit: '',
      functions: [{ expr: '', color: COLORS[0], label: '' }], points: [], segments: [], lines: [],
      polygons: [], circles: [], arcs: [], angles: [], texts: [],
    };
    case 'solid': return { type, shape: 'cuboid', a: 6, b: 4, c: 3, labels: '', segments: [], points: [], angles: [] };
    case 'stats': return { type, chart: 'bar', xLabel: '', yLabel: '頻數', data: '星期一, 12\n星期二, 8\n星期三, 15\n星期四, 10' };
    case 'numberline': return { type, min: -5, max: 5, step: 1, intervals: [{ from: 1, to: '', fromIncl: false, toIncl: false }], points: [] };
    case 'venn': return { type, sets: 2, labels: ['A', 'B', 'C'], universal: 'U', regions: {}, shaded: [] };
    case 'tree': return { type, text: 'R | $\\frac{3}{5}$\n  R | $\\frac{2}{4}$\n  B | $\\frac{2}{4}$\nB | $\\frac{2}{5}$\n  R | $\\frac{3}{4}$\n  B | $\\frac{1}{4}$', showOutcomes: true };
    case 'image': return { type, src: '', alt: '' };
    default: return { type };
  }
}

export const isNum = (v) => v !== '' && v != null && Number.isFinite(Number(v));
export const num = (v, d) => (isNum(v) ? Number(v) : d);

/** All figures of a question (handles the old media.graph). */
export function questionFigures(q) {
  const m = q?.media;
  if (!m || typeof m !== 'object') return [];
  if (Array.isArray(m.figures)) return m.figures.filter((f) => f && !figureIsEmpty(f));
  if (m.graph && typeof m.graph === 'object') {
    const f = { type: 'plot', ...m.graph };
    return figureIsEmpty(f) ? [] : [f];
  }
  return [];
}

/** The figures list to edit (includes empty ones being worked on). */
export function editableFigures(q) {
  const m = q?.media;
  if (Array.isArray(m?.figures)) return m.figures;
  if (m?.graph && typeof m.graph === 'object') return [{ type: 'plot', ...m.graph }];
  return [];
}

export function figureIsEmpty(f) {
  if (!f || typeof f !== 'object') return true;
  switch (f.type || 'plot') {
    case 'plot': {
      const lists = ['functions', 'points', 'segments', 'lines', 'polygons', 'circles', 'arcs', 'angles', 'texts'];
      return !lists.some((k) => Array.isArray(f[k]) && f[k].some((it) => it && (k !== 'functions' || String(it.expr || '').trim())));
    }
    case 'stats': return !String(f.data || '').trim();
    case 'tree': return !String(f.text || '').trim();
    case 'image': return !f.src;
    default: return false;
  }
}

/** Drops editor-only fields (keys starting with "_", e.g. the source picture kept for comparison). */
export function stripPrivate(fig) {
  if (!fig || typeof fig !== 'object') return fig;
  return Object.fromEntries(Object.entries(fig).filter(([k]) => !k.startsWith('_')));
}

/** Figures ready to save: no empty ones, no editor-only fields. */
export function figuresToSave(figures) {
  return (Array.isArray(figures) ? figures : []).filter((f) => !figureIsEmpty(f)).map(stripPrivate);
}

/** Media object to save: figures without empty ones; drops the old single graph. */
export function mediaWithFigures(media, figures) {
  const out = { ...(media && typeof media === 'object' ? media : {}) };
  delete out.graph;
  const keep = figuresToSave(figures);
  if (keep.length) out.figures = keep; else delete out.figures;
  return out;
}

// ── data-text parsing (stats / tables) ─────────────────────────────────────────
/** "label, 3" or tab-separated lines → [[cells…]] */
export function parseRows(text) {
  return String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .map((l) => l.split(/\s*[,\t，]\s*/));
}
