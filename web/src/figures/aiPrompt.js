// What the question generators tell the AI about figures, and how the AI's answer is tidied up.
import { compileExpr } from '../lib/mathExpr.js';
import { figureIsEmpty } from './model.js';

// Language of generated questions. The teacher's last choice is remembered in this browser.
export const QUESTION_LANGS = [['zh', '中文'], ['en', 'English']];

export function loadQuestionLang() {
  try { return window.localStorage?.getItem('qc_question_lang') === 'en' ? 'en' : 'zh'; } catch { return 'zh'; }
}
export function saveQuestionLang(lang) {
  try { window.localStorage?.setItem('qc_question_lang', lang); } catch { /* not available */ }
}

/** The language instruction for the generator's system prompt. */
export function languageRule(lang) {
  if (lang === 'en') {
    return 'LANGUAGE: Write EVERYTHING in English — question_text, options, answers (correct_answer / ideal_answer / blanks accepted answers), matching pairs, grading_rubric, topic, and every figure label, axis title and chart category (e.g. "Find the value of $x$.", "Frequency", "Marks"). Use the mathematical English of Hong Kong secondary schools / HKDSE English-version papers. Do not use any Chinese. The Chinese examples in this prompt only show the JSON format.';
  }
  return '語言：全部用繁體中文（香港用語）書寫，包括題目、選項、答案、評分標準、主題，以及圖形的標籤、軸名和統計圖類別。';
}

export const FIGURE_MODES = [
  ['auto', '需要時加圖'],
  ['always', '每題都要有圖'],
  ['none', '不要圖'],
];

const MODE_RULE = {
  auto: '圖形要求：凡涉及函數圖像、座標、直線、幾何（三角形、多邊形、圓、角）、立體圖形、統計圖表、概率（樹形圖、溫氏圖）或不等式的題目，都必須在該題加上 "media":{"figures":[…]}，就像 DSE 試題附圖一樣；題目文字可寫「如圖所示」。純計算題不用加。',
  always: '圖形要求：每一題都必須加上 "media":{"figures":[…]}，題目要圍繞圖形設計（例如讀圖、求長度／角度／面積、找方程、從統計圖求數據）。不可以有任何一題沒有圖。',
  none: '不要加任何圖形（不要 media）。',
};

/** Lines describing the figure format, for the generator's system prompt. */
export function figurePromptLines(mode = 'auto') {
  if (mode === 'none') return [MODE_RULE.none];
  return [
    MODE_RULE[mode] || MODE_RULE.auto,
    '圖形放在每題的 "media":{"figures":[ 圖形, … ]}（一定要是陣列）。圖形種類（type）：',
    '1) "plot" 座標圖／平面幾何：{"type":"plot","xMin":-5,"xMax":5,"yMin":-5,"yMax":5,"axes":true,"xUnit":""(或"deg"表示 0°–360°),"functions":[{"expr":"x^2-2x-3","label":"$y=x^2-2x-3$","shade":""}],"points":[{"x":1,"y":2,"label":"A"}],"lines":[{"x1":0,"y1":1,"x2":1,"y2":3,"label":"$L$"}],"segments":[{"x1":0,"y1":0,"x2":3,"y2":0,"label":"3 cm","ticks":0,"arrows":0}],"polygons":[{"vertices":[{"x":0,"y":0,"label":"A","mark":"right"},{"x":4,"y":0,"label":"B","mark":"1","angleLabel":"$\\\\theta$"},{"x":0,"y":3,"label":"C"}],"sides":[{"label":"4 cm"},{"label":"$x$"},{"label":"3 cm"}]}],"circles":[{"cx":0,"cy":0,"r":3,"centreLabel":"O"}],"arcs":[{"cx":0,"cy":0,"r":3,"start":0,"end":60,"sector":true}],"angles":[{"ax":1,"ay":0,"bx":0,"by":0,"cx":0,"cy":1,"mark":"1","label":"$40^\\\\circ$"}],"texts":[{"x":1,"y":1,"text":"N"}]}',
    '   純幾何圖用 "axes":false，自訂座標但要符合題目數據的比例（直角要真的是直角、圓上的點要在圓上），範圍要包住整個圖形。sides[i] 是頂點 i 到頂點 i+1 的邊。mark：none/1/2/3/right。expr 只可用 x、數字、+ - * / ^、括號、sqrt abs sin cos tan ln log exp pi。',
    '2) "solid" 立體圖形：{"type":"solid","shape":"cuboid|cube|pyramid|tetrahedron|prism|rightprism|cylinder|cone|frustum|sphere|hemisphere","a":6,"b":4,"c":3,"labels":"A,B,C,D,E,F,G,H","points":[{"label":"M","of":"BC","t":0.5}],"segments":[{"from":"A","to":"G","style":"dashed","label":""}],"angles":[{"at":"A","from":"C","to":"G","mark":"1","label":"$\\\\theta$"}]}。長方體 A,B,C,D 為底面、E,F,G,H 在其上；角錐 A,B,C,D 為底、V 為頂點；圓錐 labels 次序：頂點,底圓心,底右,底左；a,b,c = 長,闊,高（圓柱、圓錐 a = 半徑, c = 高）。',
    '3) "stats" 統計圖：{"type":"stats","chart":"bar|line|histogram|freqpoly|cumfreq|pie|box|scatter|stemleaf|dot","xLabel":"分數","yLabel":"頻數","data":"10-19, 4\\n20-29, 9"}（每行一項；box 每行：名稱, 最小值, Q1, 中位數, Q3, 最大值；cumfreq 每行：上組界, 累積頻數；stemleaf 給原始數據）。',
    '4) "numberline"：{"type":"numberline","min":-5,"max":5,"step":1,"intervals":[{"from":-2,"to":"","fromIncl":true,"toIncl":false}]}（"" 表示無限）；5) "venn"：{"type":"venn","sets":2,"labels":["A","B"],"regions":{"a":"5","b":"8","ab":"3","none":"4"},"shaded":["ab"]}；6) "tree"：{"type":"tree","text":"R | $\\\\frac{3}{5}$\\n  R | $\\\\frac{2}{4}$\\n  B | $\\\\frac{2}{4}$\\nB | $\\\\frac{2}{5}$\\n  R | $\\\\frac{3}{4}$\\n  B | $\\\\frac{1}{4}$","showOutcomes":true}（下一層前加兩個空格）。',
    '選擇題的選項亦可各自有圖（例如「下列哪一個是 y = … 的圖像？」）：{"id":"A","text":"","is_correct":true,"figures":[…]}。表格可在 question_text 內用「| 分數 | 10–19 |」每行一列。',
    '標籤只寫題目需要的資料：點的名稱寫在點或頂點的 label；邊、線段、直線的 label 只可寫長度、數值或未知數（例如 "8 cm"、"$x$"），不要寫該線的名稱（不要寫 "AB"、"CA"、"AT"）；不需要的標籤留空。',
    '圖中的數據必須與題目和答案一致。圖中要學生求的未知量用字母標示（例如 $x$、$y$、$\\theta$），不要用「?」。',
  ];
}

/** Example questions with figures, to put in the prompt's output example. */
export const FIGURE_EXAMPLES = [
  '{"type":"SHORT_ANSWER","question_text":"如圖所示，$\\\\triangle ABC$ 中 $\\\\angle A = 90^\\\\circ$，$AB = 4$ cm，$AC = 3$ cm。求 $BC$。","ideal_answer":"$BC = 5$ cm","points":2,"media":{"figures":[{"type":"plot","axes":false,"xMin":-1,"xMax":5,"yMin":-1,"yMax":4,"polygons":[{"vertices":[{"x":0,"y":0,"label":"A","mark":"right"},{"x":4,"y":0,"label":"B"},{"x":0,"y":3,"label":"C"}],"sides":[{"label":"4 cm"},{"label":"$x$ cm"},{"label":"3 cm"}]}]}]}},',
  '{"type":"MULTIPLE_CHOICE","question_text":"下圖是 $y=x^2-2x-3$ 的圖像。它與 $x$ 軸的交點是？","points":1,"media":{"figures":[{"type":"plot","xMin":-3,"xMax":5,"yMin":-5,"yMax":6,"functions":[{"expr":"x^2-2x-3"}]}]},"options":[{"id":"A","text":"$(-1,0)$ 和 $(3,0)$","is_correct":true},{"id":"B","text":"$(1,0)$ 和 $(-3,0)$","is_correct":false}]},',
  '{"type":"SHORT_ANSWER","question_text":"下面的直方圖顯示某班學生的測驗分數。有多少名學生的分數在 30 分或以上？","ideal_answer":"22","points":2,"media":{"figures":[{"type":"stats","chart":"histogram","xLabel":"分數","yLabel":"頻數","data":"10-19, 4\\n20-29, 9\\n30-39, 13\\n40-49, 7\\n50-59, 2"}]}},',
];

// ── tidy the AI's answer ──────────────────────────────────────────────────────
const TYPES = new Set(['plot', 'solid', 'stats', 'numberline', 'venn', 'tree']);
const asList = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : []);

function guessType(f) {
  if (f.type) {
    const t = String(f.type).toLowerCase();
    if (TYPES.has(t)) return t;
    if (/graph|coord|geometry|function|plot|triangle|circle|polygon/.test(t)) return 'plot';
    if (/solid|3d|cuboid|cone|cylinder|pyramid|prism|sphere/.test(t)) return 'solid';
    if (/stat|chart|hist|bar|pie|box/.test(t)) return 'stats';
    if (/number/.test(t)) return 'numberline';
    return null;
  }
  if (f.shape) return 'solid';
  if (f.chart) return 'stats';
  if (f.sets) return 'venn';
  if (f.intervals) return 'numberline';
  if (['functions', 'polygons', 'points', 'segments', 'lines', 'circles', 'arcs', 'angles'].some((k) => f[k])) return 'plot';
  return null;
}

// A "?" the AI used for the unknown → a letter, the way exam diagrams label unknowns.
const UNKNOWN = /(^|[\s(,，=])[?？](?=$|[\s),，cm°])/g;
function unknownsToLetters(fig) {
  const letters = ['x', 'y', 'z', 'a', 'b', 'c'];
  const coordLetters = ['k', 'h', 'm', 'n']; // unknown coordinates: (0, k) reads better than (0, x)
  let n = 0; let m = 0;
  const walk = (v, key) => {
    if (typeof v === 'string') {
      if (key === 'data' || key === 'text' && fig.type === 'tree' || key === 'expr') return v;
      const coord = /^\s*\(.*,.*\)\s*$/.test(v) || /^[A-Z]\s*\(.*,.*\)/.test(v.trim());
      return v.replace(UNKNOWN, (_, pre) => `${pre}$${coord ? coordLetters[Math.min(m++, coordLetters.length - 1)] : letters[Math.min(n++, letters.length - 1)]}$`);
    }
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    return v;
  };
  return walk(fig);
}

// A label that only repeats a line's own name ("AB" on segment AB) adds nothing and crowds the
// figure — exam diagrams name the points, not the lines.
const LINE_NAME = /^\$?\s*(\\overline\{)?\s*([A-Z][′']?)\s*([A-Z][′']?)\s*\}?\s*\$?$/;
function dropLineNames(f) {
  if (f.type !== 'plot') return f;
  const names = new Set();
  const pts = [...asList(f.points), ...asList(f.polygons).flatMap((p) => asList(p?.vertices))];
  pts.forEach((p) => { if (p?.label) names.add(String(p.label).replace(/[$\s]|\(.*$/g, '')); });
  asList(f.circles).forEach((c) => { if (c?.centreLabel) names.add(String(c.centreLabel).replace(/[$\s]/g, '')); });
  const isName = (label) => {
    const m = LINE_NAME.exec(String(label ?? '').trim());
    return !!m && (names.has(m[2]) || names.has(m[3]) || names.size === 0);
  };
  const clean = (o) => (o && isName(o.label) ? { ...o, label: '' } : o);
  const out = { ...f };
  if (out.segments) out.segments = asList(out.segments).map(clean);
  if (out.lines) out.lines = asList(out.lines).map(clean);
  if (out.polygons) out.polygons = asList(out.polygons).map((p) => (p ? { ...p, sides: asList(p.sides).map(clean) } : p));
  return out;
}

/** One figure from the AI → a valid figure, or null. */
export function cleanAiFigure(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const type = guessType(raw);
  if (!type) return null;
  const f = { ...raw, type };
  if (type === 'plot') {
    for (const k of ['functions', 'points', 'segments', 'lines', 'polygons', 'circles', 'arcs', 'angles', 'texts']) {
      if (f[k] != null) f[k] = asList(f[k]);
    }
    // Drop formulas we can't draw rather than showing an error to students.
    if (f.functions) f.functions = f.functions.filter((fn) => fn && compileExpr(fn.expr, f.xUnit === 'deg').fn);
    if (f.polygons) f.polygons = f.polygons.filter((p) => p && asList(p.vertices).length >= 2).map((p) => ({ ...p, vertices: asList(p.vertices), sides: asList(p.sides) }));
  }
  if (type === 'stats' && Array.isArray(f.data)) {
    f.data = f.data.map((row) => (Array.isArray(row) ? row.join(', ') : typeof row === 'object' && row ? Object.values(row).join(', ') : String(row))).join('\n');
  }
  if (type === 'tree' && Array.isArray(f.text)) f.text = f.text.join('\n');
  return figureIsEmpty(f) ? null : unknownsToLetters(dropLineNames(f));
}

/** Collect figures wherever the AI put them on a question (or an option). */
function collect(obj) {
  const m = obj?.media && typeof obj.media === 'object' ? obj.media : {};
  return [
    ...asList(m.figures), ...asList(m.figure), ...asList(m.graph),
    ...asList(obj?.figures), ...asList(obj?.figure), ...asList(obj?.graph), ...asList(obj?.diagram),
  ].map(cleanAiFigure).filter(Boolean).slice(0, 4);
}

/** A generated question with its figures moved to media.figures (and its options' to option.figures). */
export function normalizeAiQuestion(q) {
  if (!q || typeof q !== 'object') return q;
  const { figures, figure, graph, diagram, ...rest } = q; // eslint-disable-line no-unused-vars
  const figs = collect(q);
  const media = { ...(rest.media && typeof rest.media === 'object' ? rest.media : {}) };
  delete media.graph; delete media.figure;
  if (figs.length) media.figures = figs; else delete media.figures;
  const out = { ...rest };
  if (Object.keys(media).length) out.media = media; else delete out.media;
  if (Array.isArray(out.options)) {
    out.options = out.options.map((o) => {
      if (!o || typeof o !== 'object') return o;
      const of = collect(o);
      const { figures: _a, figure: _b, graph: _c, diagram: _d, media: _e, ...ro } = o;
      return of.length ? { ...ro, figures: of } : ro;
    });
  }
  return out;
}
