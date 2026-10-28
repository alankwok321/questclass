// Ready-made starting points for common HKDSE diagrams. Teachers pick one, then edit numbers/labels.
import { newFigure } from './model.js';

const P = (deg, r = 4) => ({ x: +(r * Math.cos((deg * Math.PI) / 180)).toFixed(3), y: +(r * Math.sin((deg * Math.PI) / 180)).toFixed(3) });

const plot = (o) => ({ ...newFigure('plot'), functions: [], ...o });
const geo = (o) => plot({ axes: false, grid: false, ...o });

export const TEMPLATES = [
  { group: '函數及座標幾何', label: '二次函數圖像', fig: () => plot({ xMin: -3, xMax: 5, yMin: -5, yMax: 6, functions: [{ expr: 'x^2-2x-3', label: '$y=x^2-2x-3$' }], points: [{ x: 1, y: -4, label: 'V(1, −4)' }] }) },
  { group: '函數及座標幾何', label: '直線（兩點式）', fig: () => plot({ xMin: -2, xMax: 8, yMin: -2, yMax: 8, lines: [{ x1: 1, y1: 2, x2: 5, y2: 6, label: '$L$' }], points: [{ x: 1, y: 2, label: 'A(1, 2)' }, { x: 5, y: 6, label: 'B(5, 6)' }] }) },
  { group: '函數及座標幾何', label: '圓的方程', fig: () => plot({ xMin: -2, xMax: 8, yMin: -3, yMax: 7, circles: [{ cx: 3, cy: 2, r: 3, showCentre: true, centreLabel: 'G' }], points: [] }) },
  { group: '函數及座標幾何', label: '三角函數 0°–360°', fig: () => plot({ xMin: 0, xMax: 360, yMin: -1.5, yMax: 1.5, xUnit: 'deg', functions: [{ expr: 'sin(x)', label: '$y=\\sin x$' }] }) },
  { group: '函數及座標幾何', label: '指數及對數函數', fig: () => plot({ xMin: -3, xMax: 6, yMin: -3, yMax: 6, functions: [{ expr: '2^x', label: '$y=2^x$' }, { expr: 'ln(x)/ln(2)', label: '$y=\\log_2 x$', color: '#D70015' }, { expr: 'x', dashed: true, color: '#6E6E73' }] }) },
  { group: '函數及座標幾何', label: '線性規劃（可行域）', fig: () => plot({ xMin: -1, xMax: 9, yMin: -1, yMax: 8, polygons: [{ vertices: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 6 }], fill: true, color: '#248A3D' }], lines: [{ x1: 0, y1: 6, x2: 4, y2: 4, label: '$x+2y=12$' }, { x1: 6, y1: 0, x2: 4, y2: 4, label: '$2x+y=12$', color: '#D70015' }], points: [{ x: 4, y: 4, label: '(4, 4)' }] }) },
  { group: '函數及座標幾何', label: '不等式圖解（陰影）', fig: () => plot({ xMin: -3, xMax: 5, yMin: -4, yMax: 6, functions: [{ expr: 'x^2-2x-3', shade: 'above', label: '$y \\ge x^2-2x-3$' }] }) },

  { group: '平面幾何', label: '直角三角形', fig: () => geo({ xMin: -1, xMax: 7, yMin: -1, yMax: 5, polygons: [{ vertices: [{ x: 0, y: 0, label: 'A', mark: 'right' }, { x: 6, y: 0, label: 'B', mark: '1', angleLabel: '$\\theta$' }, { x: 0, y: 4, label: 'C' }], sides: [{ label: '12 cm' }, { label: '$x$ cm' }, { label: '8 cm' }] }] }) },
  { group: '平面幾何', label: '三角形（邊及角）', fig: () => geo({ xMin: -1, xMax: 8, yMin: -1, yMax: 5, polygons: [{ vertices: [{ x: 0, y: 0, label: 'A', mark: '1', angleLabel: '$50^\\circ$' }, { x: 7, y: 0, label: 'B', mark: '2', angleLabel: '$65^\\circ$' }, { x: 2.5, y: 4, label: 'C' }], sides: [{ label: '10 cm' }, {}, { label: '$a$' }] }] }) },
  { group: '平面幾何', label: '全等 / 相似三角形', fig: () => geo({ xMin: -1, xMax: 13, yMin: -1, yMax: 5, polygons: [
    { vertices: [{ x: 0, y: 0, label: 'A', mark: '1' }, { x: 5, y: 0, label: 'B', mark: '2' }, { x: 1.5, y: 3.5, label: 'C' }], sides: [{ ticks: 1 }, { ticks: 2 }, { ticks: 3 }] },
    { vertices: [{ x: 7, y: 0, label: 'P', mark: '1' }, { x: 12, y: 0, label: 'Q', mark: '2' }, { x: 8.5, y: 3.5, label: 'R' }], sides: [{ ticks: 1 }, { ticks: 2 }, { ticks: 3 }] },
  ] }) },
  { group: '平面幾何', label: '平行線及截線', fig: () => geo({ xMin: -5, xMax: 5, yMin: -3.5, yMax: 3.5, segments: [{ x1: -4.5, y1: 1, x2: 4.5, y2: 1, arrows: 1 }, { x1: -4.5, y1: -1, x2: 4.5, y2: -1, arrows: 1 }, { x1: -2, y1: -3, x2: 2, y2: 3 }], angles: [{ ax: 4, ay: 1, bx: 0.667, by: 1, cx: 2, cy: 3, mark: '1', label: '$a$' }, { ax: 4, ay: -1, bx: -0.667, by: -1, cx: 2, cy: 3, mark: '1', label: '$b$' }], texts: [{ x: -4.6, y: 1.45, text: 'AB' }, { x: -4.6, y: -0.55, text: 'CD' }] }) },
  { group: '平面幾何', label: '圓 + 直徑 + 圓周角', fig: () => geo({ xMin: -5.5, xMax: 5.5, yMin: -5.5, yMax: 5.5, circles: [{ cx: 0, cy: 0, r: 4, centreLabel: 'O' }], polygons: [{ vertices: [{ ...P(180), label: 'A' }, { ...P(0), label: 'B' }, { ...P(60), label: 'C', mark: 'right' }] }] }) },
  { group: '平面幾何', label: '圓內接四邊形', fig: () => geo({ xMin: -5.5, xMax: 5.5, yMin: -5.5, yMax: 5.5, circles: [{ cx: 0, cy: 0, r: 4 }], polygons: [{ vertices: [{ ...P(200), label: 'A', mark: '1', angleLabel: '$x$' }, { ...P(320), label: 'B' }, { ...P(40), label: 'C', mark: '1', angleLabel: '$110^\\circ$' }, { ...P(130), label: 'D' }] }] }) },
  { group: '平面幾何', label: '切線及弦', fig: () => geo({ xMin: -5.5, xMax: 6, yMin: -5.5, yMax: 5, circles: [{ cx: 0, cy: 0, r: 3.5, centreLabel: 'O' }], lines: [{ x1: -2, y1: -3.5, x2: 2, y2: -3.5 }], segments: [{ x1: 0, y1: -3.5, ...{ x2: P(40, 3.5).x, y2: P(40, 3.5).y } }, { x1: 0, y1: 0, x2: 0, y2: -3.5 }], points: [{ x: 0, y: -3.5 }, { ...P(40, 3.5), label: 'A' }], texts: [{ x: 0.1, y: -4.1, text: 'T' }, { x: -4.6, y: -3.1, text: 'P' }, { x: 4.6, y: -3.1, text: 'Q' }], angles: [{ ax: -1, ay: -3.5, bx: 0, by: -3.5, cx: 0, cy: 0, mark: 'right' }] }) },
  { group: '平面幾何', label: '扇形 / 弧長', fig: () => geo({ xMin: -1, xMax: 7, yMin: -1, yMax: 6, arcs: [{ cx: 0, cy: 0, r: 6, start: 0, end: 60, sector: true, fill: true }], angles: [{ ax: 6, ay: 0, bx: 0, by: 0, cx: 3, cy: 5.196, mark: '1', label: '$60^\\circ$' }], segments: [{ x1: 0, y1: 0, x2: 6, y2: 0, label: '6 cm' }], texts: [{ x: -0.35, y: -0.35, text: 'O' }] }) },
  { group: '平面幾何', label: '方位角', fig: () => geo({ xMin: -4, xMax: 5, yMin: -4, yMax: 5, segments: [{ x1: 0, y1: -1, x2: 0, y2: 4, color: '#6E6E73', dashed: true }, { x1: 0, y1: 0, x2: 3.5, y2: 2 }], angles: [{ ax: 0, ay: 3, bx: 0, by: 0, cx: 3.5, cy: 2, mark: '1', label: '$60^\\circ$' }], points: [{ x: 0, y: 0 }, { x: 3.5, y: 2, label: 'B' }], texts: [{ x: 0, y: 4.5, text: 'N' }, { x: -0.4, y: -0.4, text: 'A' }] }) },

  { group: '立體圖形', label: '長方體 + 對角線', fig: () => ({ ...newFigure('solid'), shape: 'cuboid', a: 8, b: 4, c: 3, segments: [{ from: 'A', to: 'G', style: 'dashed' }, { from: 'A', to: 'C', style: 'dashed' }, { from: 'A', to: 'B', style: 'none', label: '8 cm' }], angles: [{ at: 'A', from: 'C', to: 'G', mark: '1', label: '$\\theta$' }] }) },
  { group: '立體圖形', label: '直立角錐體', fig: () => ({ ...newFigure('solid'), shape: 'pyramid', a: 6, b: 6, c: 5, points: [{ label: 'M', of: 'ABCD' }, { label: 'N', of: 'BC' }], segments: [{ from: 'V', to: 'M', style: 'dashed' }, { from: 'M', to: 'N', style: 'dashed' }, { from: 'V', to: 'N', style: 'solid' }], angles: [{ at: 'M', from: 'V', to: 'N', mark: 'right' }] }) },
  { group: '立體圖形', label: '三角柱體', fig: () => ({ ...newFigure('solid'), shape: 'rightprism', a: 4, b: 8, c: 3 }) },
  { group: '立體圖形', label: '圓錐體', fig: () => ({ ...newFigure('solid'), shape: 'cone', a: 3, c: 5, labels: 'V,O,A,B', segments: [{ from: 'V', to: 'O', style: 'dashed', label: '12 cm' }, { from: 'O', to: 'A', style: 'dashed', label: '5 cm' }] }) },
  { group: '立體圖形', label: '圓柱體', fig: () => ({ ...newFigure('solid'), shape: 'cylinder', a: 3, c: 6, labels: 'O,P,A,-,C', segments: [{ from: 'O', to: 'A', style: 'dashed', label: '$r$' }, { from: 'A', to: 'C', style: 'none', label: '$h$' }] }) },
  { group: '立體圖形', label: '球體 / 半球體', fig: () => ({ ...newFigure('solid'), shape: 'hemisphere', a: 3, labels: 'O,A', segments: [{ from: 'O', to: 'A', style: 'solid', label: '6 cm' }] }) },

  { group: '統計及概率', label: '直方圖', fig: () => ({ ...newFigure('stats'), chart: 'histogram', xLabel: '分數', yLabel: '頻數', data: '10-19, 4\n20-29, 9\n30-39, 13\n40-49, 7\n50-59, 2' }) },
  { group: '統計及概率', label: '累積頻數曲線', fig: () => ({ ...newFigure('stats'), chart: 'cumfreq', xLabel: '分數', yLabel: '累積頻數', data: '9.5, 0\n19.5, 4\n29.5, 13\n39.5, 26\n49.5, 33\n59.5, 35' }) },
  { group: '統計及概率', label: '框線圖', fig: () => ({ ...newFigure('stats'), chart: 'box', xLabel: '分數', data: '甲班, 32, 45, 58, 66, 90\n乙班, 40, 52, 61, 70, 85' }) },
  { group: '統計及概率', label: '莖葉圖', fig: () => ({ ...newFigure('stats'), chart: 'stemleaf', data: '12, 15, 21, 23, 23, 28, 30, 34, 35, 35, 41, 47' }) },
  { group: '統計及概率', label: '圓形圖', fig: () => ({ ...newFigure('stats'), chart: 'pie', data: '巴士, 18\n港鐵, 30\n步行, 8\n其他, 4' }) },
  { group: '統計及概率', label: '樹形圖', fig: () => newFigure('tree') },
  { group: '統計及概率', label: '溫氏圖', fig: () => ({ ...newFigure('venn'), regions: { a: '5', b: '8', ab: '3', none: '4' } }) },
];
