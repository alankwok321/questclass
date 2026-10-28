import React, { useMemo } from 'react';
import { COLORS, isNum, num, parseRows } from './model.js';
import { Frame, Label, fmtNum, niceStep } from './svg.jsx';

// Statistics charts. Data is typed as lines ("label, value"), so a column pasted from Excel works.
//   bar / line      label, value[, value2…]   (first line may be a header naming the series)
//   histogram       10-19, 5                  (class limits or boundaries, frequency)
//   freqpoly        10-19, 5                  (same data; plotted at class marks)
//   cumfreq         19.5, 12                  (upper class boundary, cumulative frequency)
//   pie             label, value
//   box             [label,] min, Q1, median, Q3, max
//   scatter         x, y
//   stemleaf        raw data (any separators), or lines "3 | 1 4 7"
//   dot             raw data

export const CHARTS = [
  { chart: 'bar', label: '棒形圖', sample: '星期一, 12\n星期二, 8\n星期三, 15\n星期四, 10' },
  { chart: 'line', label: '折線圖', sample: '1月, 20\n2月, 24\n3月, 18\n4月, 30' },
  { chart: 'histogram', label: '直方圖', sample: '10-19, 4\n20-29, 9\n30-39, 13\n40-49, 7\n50-59, 2' },
  { chart: 'freqpoly', label: '頻數多邊形', sample: '10-19, 4\n20-29, 9\n30-39, 13\n40-49, 7\n50-59, 2' },
  { chart: 'cumfreq', label: '累積頻數多邊形 / 曲線', sample: '9.5, 0\n19.5, 4\n29.5, 13\n39.5, 26\n49.5, 33\n59.5, 35' },
  { chart: 'pie', label: '圓形圖', sample: '巴士, 18\n港鐵, 30\n步行, 8\n其他, 4' },
  { chart: 'box', label: '框線圖', sample: '甲班, 32, 45, 58, 66, 90\n乙班, 40, 52, 61, 70, 85' },
  { chart: 'scatter', label: '散點圖', sample: '2, 50\n3, 58\n5, 70\n6, 74\n8, 88' },
  { chart: 'stemleaf', label: '莖葉圖', sample: '12, 15, 21, 23, 23, 28, 30, 34, 35, 35, 41, 47' },
  { chart: 'dot', label: '點陣圖', sample: '1, 2, 2, 3, 3, 3, 4, 5, 5, 6' },
];

const INK = '#1D1D1F';
const W = 440;
const nums = (text) => String(text || '').split(/[\s,，;；\t]+/).filter(isNum).map(Number);

export default function StatsFigure({ fig, maxWidth = 440, caption }) {
  const chart = fig.chart || 'bar';
  const body = useMemo(() => {
    try {
      switch (chart) {
        case 'bar': case 'line': return categoryChart(fig, chart);
        case 'histogram': case 'freqpoly': return classChart(fig, chart);
        case 'cumfreq': return cumFreq(fig);
        case 'pie': return pie(fig);
        case 'box': return boxPlot(fig);
        case 'scatter': return scatter(fig);
        case 'stemleaf': return stemLeaf(fig);
        case 'dot': return dotPlot(fig);
        default: return null;
      }
    } catch (e) {
      return { error: e.message };
    }
  }, [fig, chart]);
  if (!body) return null;
  if (body.error) return <div style={{ color: '#D70015', fontSize: 12, fontWeight: 600 }}>資料格式錯誤：{body.error}</div>;
  return (
    <Frame width={W} height={body.H} maxWidth={maxWidth} caption={caption || fig.title} label="統計圖表">
      {body.svg}
    </Frame>
  );
}

// ── shared axes ───────────────────────────────────────────────────────────────
function valueAxis(maxVal, fig) {
  const top = isNum(fig.yMax) ? +fig.yMax : maxVal <= 0 ? 1 : maxVal * 1.08;
  const step = isNum(fig.yStep) && +fig.yStep > 0 ? +fig.yStep : niceStep(top, 6);
  const max = Math.ceil(top / step - 1e-9) * step;
  const ticks = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(Math.round(v / step) * step);
  return { max, ticks };
}

function numberAxis(lo, hi, fig, keys = ['xMin', 'xMax', 'xStep']) {
  let a = isNum(fig[keys[0]]) ? +fig[keys[0]] : lo;
  let b = isNum(fig[keys[1]]) ? +fig[keys[1]] : hi;
  if (b <= a) b = a + 1;
  const step = isNum(fig[keys[2]]) && +fig[keys[2]] > 0 ? +fig[keys[2]] : niceStep(b - a, 8);
  if (!isNum(fig[keys[0]])) a = Math.floor(a / step) * step;
  if (!isNum(fig[keys[1]])) b = Math.ceil(b / step) * step;
  const ticks = [];
  for (let i = 0; a + i * step <= b + 1e-9; i += 1) ticks.push(Math.round((a + i * step) * 1e9) / 1e9);
  return { min: a, max: b, ticks };
}

function Axes({ L, T, R, B, H, yTicks, sy, xLabel, yLabel, grid = true }) {
  return (
    <g>
      {grid && yTicks.map((v) => <line key={`g${v}`} x1={L} x2={R} y1={sy(v)} y2={sy(v)} stroke="#E5E5EA" />)}
      <line x1={L} x2={R} y1={B} y2={B} stroke={INK} strokeWidth="1.4" />
      <line x1={L} x2={L} y1={B} y2={T - 6} stroke={INK} strokeWidth="1.4" />
      {yTicks.map((v) => (
        <g key={`t${v}`}>
          <line x1={L - 4} x2={L} y1={sy(v)} y2={sy(v)} stroke={INK} />
          <text x={L - 7} y={sy(v)} fontSize="11" fill="#3A3A3C" textAnchor="end" dominantBaseline="middle">{fmtNum(v)}</text>
        </g>
      ))}
      {yLabel ? (
        <g transform={`translate(13 ${(T + B) / 2}) rotate(-90)`}><Label x={0} y={0} text={yLabel} size={12} weight={600} halo={false} /></g>
      ) : null}
      {xLabel ? <Label x={(L + R) / 2} y={H - 11} text={xLabel} size={12} weight={600} halo={false} /> : null}
    </g>
  );
}

const frame = (fig, H = 300) => {
  const L = 54; const R = W - 18; const T = 22; const B = H - (fig.xLabel ? 44 : 30);
  return { L, R, T, B, H };
};

// ── bar / line ────────────────────────────────────────────────────────────────
function categoryChart(fig, chart) {
  let rows = parseRows(fig.data);
  let series = null;
  if (rows.length && rows[0].slice(1).some((c) => c !== '' && !isNum(c))) { series = rows[0].slice(1); rows = rows.slice(1); }
  rows = rows.filter((r) => r.length >= 2);
  if (!rows.length) throw new Error('每行輸入「類別, 數值」');
  const n = Math.max(...rows.map((r) => r.length - 1));
  const vals = rows.map((r) => Array.from({ length: n }, (_, i) => num(r[i + 1], 0)));
  const { L, R, T, B, H } = frame(fig);
  const { max, ticks } = valueAxis(Math.max(...vals.flat()), fig);
  const sy = (v) => B - (v / max) * (B - T);
  const band = (R - L) / rows.length;
  const els = [];
  if (chart === 'bar') {
    const bw = Math.min(46, (band * 0.7) / n);
    rows.forEach((r, i) => vals[i].forEach((v, k) => {
      const x = L + band * i + band / 2 - (bw * n) / 2 + bw * k;
      els.push(<rect key={`b${i}-${k}`} x={x} y={sy(v)} width={bw - 1} height={B - sy(v)} fill={COLORS[k % COLORS.length]} fillOpacity={n > 1 ? 0.85 : 0.75} stroke={COLORS[k % COLORS.length]} />);
    }));
  } else {
    for (let k = 0; k < n; k += 1) {
      const pts = rows.map((_, i) => [L + band * i + band / 2, sy(vals[i][k])]);
      els.push(<polyline key={`ln${k}`} points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={COLORS[k % COLORS.length]} strokeWidth="2" />);
      pts.forEach((p, i) => els.push(<circle key={`pt${k}-${i}`} cx={p[0]} cy={p[1]} r="3.5" fill={COLORS[k % COLORS.length]} />));
    }
  }
  rows.forEach((r, i) => els.push(<Label key={`x${i}`} x={L + band * i + band / 2} y={B + 13} text={r[0]} size={11} weight={500} halo={false} />));
  if (series) series.forEach((s, k) => els.push(
    <g key={`lg${k}`} transform={`translate(${R - 90} ${T + 4 + k * 16})`}>
      <rect width="10" height="10" fill={COLORS[k % COLORS.length]} y="-5" />
      <Label x={15} y={0} text={s} size={11} anchor="start" weight={500} />
    </g>,
  ));
  return { H, svg: <><Axes L={L} R={R} T={T} B={B} H={H} yTicks={ticks} sy={sy} xLabel={fig.xLabel} yLabel={fig.yLabel} />{els}</> };
}

// ── histogram / frequency polygon ─────────────────────────────────────────────
const CLASS_RE = /^\s*(-?\d*\.?\d+)\s*(?:-|–|—|~|to|至)\s*(-?\d*\.?\d+)\s*$/i;
function parseClasses(fig) {
  const rows = parseRows(fig.data).filter((r) => r.length >= 2);
  const cls = rows.map((r) => { const m = CLASS_RE.exec(r[0]); return m ? { a: +m[1], b: +m[2], f: num(r[1], 0), text: r[0] } : null; });
  if (!cls.length || cls.some((c) => !c)) throw new Error('每行輸入「下限-上限, 頻數」，例如 10-19, 4');
  // Class limits (10-19, 20-29) → boundaries (9.5-19.5, 19.5-29.5).
  const gaps = cls.slice(1).map((c, i) => +(c.a - cls[i].b).toFixed(9));
  const gap = gaps.length && gaps.every((g) => g > 0 && Math.abs(g - gaps[0]) < 1e-9) ? gaps[0] : 0;
  return cls.map((c) => ({ ...c, lo: c.a - gap / 2, hi: c.b + gap / 2 }));
}

function classChart(fig, chart) {
  const cls = parseClasses(fig);
  const width = cls[0].hi - cls[0].lo;
  const lo = chart === 'freqpoly' ? cls[0].lo - width : cls[0].lo;
  const hi = chart === 'freqpoly' ? cls[cls.length - 1].hi + width : cls[cls.length - 1].hi;
  const { L, R, T, B, H } = frame(fig);
  const { max, ticks } = valueAxis(Math.max(...cls.map((c) => c.f)), fig);
  const sy = (v) => B - (v / max) * (B - T);
  const x0 = L + 14;
  const sx = (x) => x0 + ((x - lo) / (hi - lo)) * (R - x0 - 6);
  const els = [];
  if (chart === 'histogram') {
    cls.forEach((c, i) => els.push(<rect key={`h${i}`} x={sx(c.lo)} y={sy(c.f)} width={sx(c.hi) - sx(c.lo)} height={B - sy(c.f)} fill={COLORS[0]} fillOpacity="0.28" stroke={COLORS[0]} strokeWidth="1.3" />));
    const marks = fig.xMarks === 'mark' ? cls.map((c) => (c.lo + c.hi) / 2) : [cls[0].lo, ...cls.map((c) => c.hi)];
    marks.forEach((v, i) => els.push(
      <g key={`xm${i}`}><line x1={sx(v)} x2={sx(v)} y1={B} y2={B + 4} stroke={INK} /><text x={sx(v)} y={B + 15} fontSize="11" fill="#3A3A3C" textAnchor="middle">{fmtNum(v)}</text></g>,
    ));
  } else {
    const pts = [{ x: cls[0].lo - width / 2, f: 0 }, ...cls.map((c) => ({ x: (c.lo + c.hi) / 2, f: c.f })), { x: cls[cls.length - 1].hi + width / 2, f: 0 }];
    els.push(<polyline key="fp" points={pts.map((p) => `${sx(p.x)},${sy(p.f)}`).join(' ')} fill="none" stroke={COLORS[0]} strokeWidth="2" />);
    pts.forEach((p, i) => {
      els.push(<circle key={`fp${i}`} cx={sx(p.x)} cy={sy(p.f)} r="3.5" fill={COLORS[0]} />);
      els.push(<g key={`fx${i}`}><line x1={sx(p.x)} x2={sx(p.x)} y1={B} y2={B + 4} stroke={INK} /><text x={sx(p.x)} y={B + 15} fontSize="11" fill="#3A3A3C" textAnchor="middle">{fmtNum(p.x)}</text></g>);
    });
  }
  return { H, svg: <><Axes L={L} R={R} T={T} B={B} H={H} yTicks={ticks} sy={sy} xLabel={fig.xLabel} yLabel={fig.yLabel} />{els}</> };
}

// ── cumulative frequency ───────────────────────────────────────────────────────
function monotonePath(p) { // Fritsch–Carlson, p = [[x,y]…] sorted by x (SVG coords)
  const n = p.length;
  if (n < 3) return p.map((q, i) => `${i ? 'L' : 'M'}${q[0]},${q[1]}`).join(' ');
  const dx = []; const m = [];
  for (let i = 0; i < n - 1; i += 1) { dx[i] = p[i + 1][0] - p[i][0]; m[i] = (p[i + 1][1] - p[i][1]) / dx[i]; }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i += 1) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  t[n - 1] = m[n - 2];
  for (let i = 0; i < n - 1; i += 1) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i]; const b = t[i + 1] / m[i]; const s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 0; i < n - 1; i += 1) {
    const h = dx[i] / 3;
    d += ` C${p[i][0] + h},${p[i][1] + t[i] * h} ${p[i + 1][0] - h},${p[i + 1][1] - t[i + 1] * h} ${p[i + 1][0]},${p[i + 1][1]}`;
  }
  return d;
}

function cumFreq(fig) {
  const pts = parseRows(fig.data).filter((r) => r.length >= 2 && isNum(r[0]) && isNum(r[1])).map((r) => [+r[0], +r[1]]).sort((a, b) => a[0] - b[0]);
  if (pts.length < 2) throw new Error('每行輸入「上組界, 累積頻數」');
  const { L, R, T, B, H } = frame(fig, 320);
  const { max, ticks } = valueAxis(Math.max(...pts.map((p) => p[1])), fig);
  const sy = (v) => B - (v / max) * (B - T);
  const ax = numberAxis(pts[0][0], pts[pts.length - 1][0], { xMin: fig.xMin ?? pts[0][0], xMax: fig.xMax ?? pts[pts.length - 1][0], xStep: fig.xStep ?? (pts.length > 1 ? pts[1][0] - pts[0][0] : undefined) });
  const x0 = L + 8;
  const sx = (x) => x0 + ((x - ax.min) / (ax.max - ax.min)) * (R - x0 - 6);
  const sp = pts.map((p) => [sx(p[0]), sy(p[1])]);
  const els = [
    fig.smooth === false
      ? <polyline key="c" points={sp.map((p) => p.join(',')).join(' ')} fill="none" stroke={COLORS[0]} strokeWidth="2" />
      : <path key="c" d={monotonePath(sp)} fill="none" stroke={COLORS[0]} strokeWidth="2" />,
    ...sp.map((p, i) => <circle key={`p${i}`} cx={p[0]} cy={p[1]} r="3.2" fill={COLORS[0]} />),
    ...ax.ticks.map((v) => <g key={`x${v}`}><line x1={sx(v)} x2={sx(v)} y1={B} y2={B + 4} stroke={INK} /><text x={sx(v)} y={B + 15} fontSize="11" fill="#3A3A3C" textAnchor="middle">{fmtNum(v)}</text></g>),
    ...ax.ticks.map((v) => <line key={`gx${v}`} x1={sx(v)} x2={sx(v)} y1={T} y2={B} stroke="#E5E5EA" />),
  ];
  return { H, svg: <><Axes L={L} R={R} T={T} B={B} H={H} yTicks={ticks} sy={sy} xLabel={fig.xLabel} yLabel={fig.yLabel || '累積頻數'} />{els}</> };
}

// ── pie ───────────────────────────────────────────────────────────────────────
function pie(fig) {
  const rows = parseRows(fig.data).filter((r) => r.length >= 2 && isNum(r[1]));
  const total = rows.reduce((s, r) => s + +r[1], 0);
  if (!rows.length || total <= 0) throw new Error('每行輸入「項目, 數值」');
  const H = 300; const cx = W / 2; const cy = H / 2; const r = 112;
  let a = -Math.PI / 2;
  const els = [];
  rows.forEach((row, i) => {
    const frac = +row[1] / total;
    const a2 = a + frac * 2 * Math.PI;
    const big = a2 - a > Math.PI ? 1 : 0;
    const p1 = [cx + r * Math.cos(a), cy + r * Math.sin(a)]; const p2 = [cx + r * Math.cos(a2), cy + r * Math.sin(a2)];
    const color = COLORS[i % COLORS.length];
    els.push(frac >= 0.9999
      ? <circle key={`s${i}`} cx={cx} cy={cy} r={r} fill={color} fillOpacity="0.28" stroke={INK} strokeWidth="1.3" />
      : <path key={`s${i}`} d={`M${cx},${cy} L${p1[0]},${p1[1]} A${r},${r} 0 ${big} 1 ${p2[0]},${p2[1]} Z`} fill={color} fillOpacity="0.28" stroke={INK} strokeWidth="1.3" />);
    const mid = (a + a2) / 2;
    const show = fig.pieShow || 'percent';
    const extra = show === 'percent' ? `${fmtNum(Math.round(frac * 1000) / 10)}%` : show === 'angle' ? `${fmtNum(Math.round(frac * 3600) / 10)}°` : show === 'value' ? fmtNum(+row[1]) : '';
    const inside = frac > 0.07;
    const lr = inside ? r * 0.6 : r + 26;
    els.push(<Label key={`l${i}`} x={cx + lr * Math.cos(mid)} y={cy + lr * Math.sin(mid) - (extra ? 7 : 0)} text={row[0]} size={12} />);
    if (extra) els.push(<Label key={`v${i}`} x={cx + lr * Math.cos(mid)} y={cy + lr * Math.sin(mid) + 9} text={extra} size={11} weight={500} />);
    a = a2;
  });
  return { H, svg: <>{els}</> };
}

// ── box-and-whisker ───────────────────────────────────────────────────────────
function boxPlot(fig) {
  const rows = parseRows(fig.data).map((r) => {
    const label = isNum(r[0]) ? '' : r[0];
    const v = (label ? r.slice(1) : r).filter(isNum).map(Number);
    return v.length >= 5 ? { label, v: v.slice(0, 5).sort((x, y) => x - y) } : null;
  }).filter(Boolean);
  if (!rows.length) throw new Error('每行輸入「名稱, 最小值, 下四分位數, 中位數, 上四分位數, 最大值」');
  const lo = Math.min(...rows.map((r) => r.v[0])); const hi = Math.max(...rows.map((r) => r.v[4]));
  const ax = numberAxis(lo, hi, fig);
  const hasLabels = rows.some((r) => r.label);
  const L = hasLabels ? 70 : 24; const R = W - 22;
  const rowH = 56; const T = 18;
  const B = T + rows.length * rowH + 6;
  const H = B + (fig.xLabel ? 44 : 30);
  const sx = (x) => L + ((x - ax.min) / (ax.max - ax.min)) * (R - L);
  const els = [];
  rows.forEach((r, i) => {
    const y = T + rowH * i + rowH / 2; const h = 26;
    const [mn, q1, md, q3, mx] = r.v.map(sx);
    const c = COLORS[i % COLORS.length];
    els.push(
      <g key={`b${i}`} stroke={INK} strokeWidth="1.5">
        <line x1={mn} x2={q1} y1={y} y2={y} /><line x1={q3} x2={mx} y1={y} y2={y} />
        <line x1={mn} x2={mn} y1={y - h / 3} y2={y + h / 3} /><line x1={mx} x2={mx} y1={y - h / 3} y2={y + h / 3} />
        <rect x={q1} y={y - h / 2} width={q3 - q1} height={h} fill={c} fillOpacity="0.15" />
        <line x1={md} x2={md} y1={y - h / 2} y2={y + h / 2} strokeWidth="2.2" />
      </g>,
    );
    if (r.label) els.push(<Label key={`l${i}`} x={L - 10} y={y} text={r.label} anchor="end" size={12} />);
  });
  els.push(<line key="ax" x1={L} x2={R} y1={B} y2={B} stroke={INK} strokeWidth="1.4" />);
  ax.ticks.forEach((v) => els.push(<g key={`t${v}`}><line x1={sx(v)} x2={sx(v)} y1={B} y2={B + 4} stroke={INK} /><text x={sx(v)} y={B + 15} fontSize="11" fill="#3A3A3C" textAnchor="middle">{fmtNum(v)}</text></g>));
  if (fig.xLabel) els.push(<Label key="xl" x={(L + R) / 2} y={H - 11} text={fig.xLabel} size={12} halo={false} />);
  return { H, svg: <>{els}</> };
}

// ── scatter ───────────────────────────────────────────────────────────────────
function scatter(fig) {
  const pts = parseRows(fig.data).filter((r) => r.length >= 2 && isNum(r[0]) && isNum(r[1])).map((r) => [+r[0], +r[1]]);
  if (!pts.length) throw new Error('每行輸入「x, y」');
  const { L, R, T, B, H } = frame(fig, 300);
  const xa = numberAxis(Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0])), fig);
  const ya = numberAxis(Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1])), fig, ['yMin', 'yMax', 'yStep']);
  const sx = (x) => L + 6 + ((x - xa.min) / (xa.max - xa.min)) * (R - L - 12);
  const sy = (y) => B - ((y - ya.min) / (ya.max - ya.min)) * (B - T);
  const els = [
    ...xa.ticks.map((v) => <g key={`x${v}`}><line x1={sx(v)} x2={sx(v)} y1={B} y2={B + 4} stroke={INK} /><text x={sx(v)} y={B + 15} fontSize="11" fill="#3A3A3C" textAnchor="middle">{fmtNum(v)}</text></g>),
    ...pts.map((p, i) => <circle key={`p${i}`} cx={sx(p[0])} cy={sy(p[1])} r="3.8" fill={COLORS[0]} />),
  ];
  return { H, svg: <><Axes L={L} R={R} T={T} B={B} H={H} yTicks={ya.ticks} sy={sy} xLabel={fig.xLabel} yLabel={fig.yLabel} />{els}</> };
}

// ── stem-and-leaf ─────────────────────────────────────────────────────────────
const PLACE = { 1000: ['千位', '百位'], 100: ['百位', '十位'], 10: ['十位', '個位'], 1: ['個位', '十分位'], 0.1: ['十分位', '百分位'] };
function stemLeaf(fig) {
  let rows;
  const unitStem = isNum(fig.stemUnit) && +fig.stemUnit > 0 ? +fig.stemUnit : 10;
  if (String(fig.data || '').includes('|')) {
    rows = String(fig.data).split(/\r?\n/).filter((l) => l.includes('|')).map((l) => {
      const [s, lv] = l.split('|');
      return { stem: s.trim(), leaves: lv.trim().split(/[\s,]+/).filter(Boolean) };
    });
  } else {
    const data = nums(fig.data).sort((a, b) => a - b);
    if (!data.length) throw new Error('輸入數據，例如 12, 15, 21, 23');
    const leafUnit = unitStem / 10;
    const map = new Map();
    for (const v of data) {
      const stem = Math.floor(v / unitStem + 1e-9);
      const leaf = Math.round((v - stem * unitStem) / leafUnit);
      if (!map.has(stem)) map.set(stem, []);
      map.get(stem).push(leaf);
    }
    const lo = Math.min(...map.keys()); const hi = Math.max(...map.keys());
    rows = [];
    for (let s = lo; s <= hi; s += 1) rows.push({ stem: String(s), leaves: (map.get(s) || []).map(String) });
  }
  const [stemPlace, leafPlace] = PLACE[unitStem] || ['', ''];
  const head = [fig.stemTitle || `莖（${stemPlace || '莖'}）`, fig.leafTitle || `葉（${leafPlace || '葉'}）`];
  const rowH = 24; const T = 14; const colX = 120;
  const H = T + rowH * (rows.length + 1) + 14;
  const els = [
    <Label key="h0" x={colX - 16} y={T + rowH / 2} text={head[0]} anchor="end" size={13} />,
    <Label key="h1" x={colX + 16} y={T + rowH / 2} text={head[1]} anchor="start" size={13} />,
    <line key="v" x1={colX} x2={colX} y1={T} y2={H - 12} stroke={INK} strokeWidth="1.4" />,
    <line key="hl" x1={24} x2={W - 24} y1={T + rowH} y2={T + rowH} stroke={INK} strokeWidth="1.2" />,
  ];
  rows.forEach((r, i) => {
    const y = T + rowH * (i + 1) + rowH / 2;
    els.push(<text key={`s${i}`} x={colX - 16} y={y} textAnchor="end" dominantBaseline="central" fontSize="14" fill={INK}>{r.stem}</text>);
    els.push(<text key={`l${i}`} x={colX + 16} y={y} dominantBaseline="central" fontSize="14" fill={INK} letterSpacing="2">{r.leaves.join('  ')}</text>);
  });
  return { H, svg: <>{els}</> };
}

// ── dot plot ──────────────────────────────────────────────────────────────────
function dotPlot(fig) {
  const data = nums(fig.data);
  if (!data.length) throw new Error('輸入數據，例如 1, 2, 2, 3');
  const ax = numberAxis(Math.min(...data), Math.max(...data), { xStep: fig.xStep ?? 1, ...fig });
  const counts = new Map();
  data.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  const maxC = Math.max(...counts.values());
  const L = 30; const R = W - 30; const gapY = 16; const T = 16;
  const B = T + maxC * gapY + 10;
  const H = B + (fig.xLabel ? 44 : 30);
  const sx = (x) => L + ((x - ax.min) / (ax.max - ax.min || 1)) * (R - L);
  const els = [<line key="ax" x1={L - 10} x2={R + 10} y1={B} y2={B} stroke={INK} strokeWidth="1.4" />];
  ax.ticks.forEach((v) => els.push(<g key={`t${v}`}><line x1={sx(v)} x2={sx(v)} y1={B} y2={B + 4} stroke={INK} /><text x={sx(v)} y={B + 15} fontSize="11" fill="#3A3A3C" textAnchor="middle">{fmtNum(v)}</text></g>));
  for (const [v, c] of counts) for (let k = 0; k < c; k += 1) els.push(<circle key={`d${v}-${k}`} cx={sx(v)} cy={B - 10 - k * gapY} r="5" fill={COLORS[0]} />);
  if (fig.xLabel) els.push(<Label key="xl" x={(L + R) / 2} y={H - 11} text={fig.xLabel} size={12} halo={false} />);
  return { H, svg: <>{els}</> };
}
