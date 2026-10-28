import React, { useRef, useState } from 'react';
import Figure from './Figure.jsx';
import { COLORS, FIGURE_TYPES, newFigure, typeLabel } from './model.js';
import { TEMPLATES } from './templates.js';
import { plotBounds } from './PlotFigure.jsx';
import { SOLIDS, solidInfo } from './SolidFigure.jsx';
import { CHARTS } from './StatsFigure.jsx';
import { VENN_REGIONS } from './OtherFigures.jsx';
import { ARROWS, Check, ColorPick, ListEdit, MARKS, NumIn, S, Section, Select, TICKS, TextIn } from './editorKit.jsx';
import { figureFromImage } from '../services/api.js';

// ── Plot (coordinates + plane geometry) ──────────────────────────────────────
function PlotEditor({ fig, set }) {
  const L = (k) => fig[k] || [];
  const autoFit = () => {
    const b = plotBounds(fig);
    if (!b) return;
    const mx = Math.max(1, (b.xMax - b.xMin) * 0.15); const my = Math.max(1, (b.yMax - b.yMin) * 0.15);
    const r = (v) => Math.round(v * 10) / 10;
    set({ xMin: r(b.xMin - mx), xMax: r(b.xMax + mx), yMin: r(b.yMin - my), yMax: r(b.yMax + my) });
  };
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <Section title="範圍及座標軸" open>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', ...S.muted }}>
          <NumIn value={fig.xMin} onChange={(v) => set({ xMin: v })} /> ≤ x ≤ <NumIn value={fig.xMax} onChange={(v) => set({ xMax: v })} />
          <span style={{ width: 8 }} />
          <NumIn value={fig.yMin} onChange={(v) => set({ yMin: v })} /> ≤ y ≤ <NumIn value={fig.yMax} onChange={(v) => set({ yMax: v })} />
          <button type="button" style={S.ghost} onClick={autoFit} title="按圖形中的點、線、多邊形、圓調整範圍">自動調整範圍</button>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Check checked={fig.axes !== false} onChange={(v) => set({ axes: v })} label="顯示座標軸" />
          {fig.axes !== false && <>
            <Check checked={fig.grid !== false} onChange={(v) => set({ grid: v })} label="格線" />
            <span style={S.muted}>軸名</span>
            <TextIn width={50} value={fig.xLabel ?? 'x'} onChange={(v) => set({ xLabel: v })} />
            <TextIn width={50} value={fig.yLabel ?? 'y'} onChange={(v) => set({ yLabel: v })} />
            <span style={S.muted}>x 軸單位</span>
            <Select value={fig.xUnit || ''} onChange={(v) => set({ xUnit: v })} options={[['', '數字'], ['deg', '度 (°)'], ['pi', 'π 弧度']]} />
            <span style={S.muted}>刻度</span>
            <NumIn value={fig.xStep} placeholder="x 自動" width={70} onChange={(v) => set({ xStep: v })} />
            <NumIn value={fig.yStep} placeholder="y 自動" width={70} onChange={(v) => set({ yStep: v })} />
          </>}
        </div>
      </Section>

      <Section title="函數 y = f(x)" count={L('functions').filter((f) => f.expr).length} open={L('functions').length > 0}>
        <div style={S.muted}>例如 <code>x^2-2x-3</code>、<code>2x+1</code>、<code>sqrt(x)</code>、<code>1/x</code>、<code>2^x</code>、<code>log(x)</code>、<code>sin(x)</code>（x 軸設為「度」時用度）</div>
        <ListEdit items={L('functions')} onChange={(v) => set({ functions: v })} addLabel="函數"
          make={(n) => ({ expr: '', color: COLORS[n % COLORS.length], label: '' })}
          render={(f, s) => <>
            <span style={{ ...S.muted, fontStyle: 'italic' }}>y =</span>
            <TextIn value={f.expr} placeholder="x^2-1" flex="2 1 110px" onChange={(v) => s({ expr: v })} />
            <TextIn value={f.label} placeholder="標籤 $y=…$" onChange={(v) => s({ label: v })} />
            <ColorPick value={f.color} onChange={(c) => s({ color: c })} />
            <Check checked={f.dashed} onChange={(v) => s({ dashed: v })} label="虛線" />
            <Select value={f.shade || ''} onChange={(v) => s({ shade: v })} options={[['', '不塗色'], ['above', '塗上方'], ['below', '塗下方']]} />
            <span style={S.muted}>x 由</span><NumIn value={f.from} placeholder="—" width={52} onChange={(v) => s({ from: v })} />
            <span style={S.muted}>至</span><NumIn value={f.to} placeholder="—" width={52} onChange={(v) => s({ to: v })} />
          </>} />
      </Section>

      <Section title="點" count={L('points').length} open={L('points').length > 0}>
        <ListEdit items={L('points')} onChange={(v) => set({ points: v })} addLabel="點"
          make={(n) => ({ x: 0, y: 0, label: String.fromCharCode(65 + n) })}
          render={(p, s) => <>
            <span style={S.muted}>(</span><NumIn value={p.x} onChange={(v) => s({ x: v })} width={56} /><span style={S.muted}>,</span>
            <NumIn value={p.y} onChange={(v) => s({ y: v })} width={56} /><span style={S.muted}>)</span>
            <TextIn value={p.label} placeholder="標籤，如 A(1, 2)" onChange={(v) => s({ label: v })} />
            <Check checked={p.open} onChange={(v) => s({ open: v })} label="空心" />
          </>} />
      </Section>

      <Section title="多邊形 / 三角形" count={L('polygons').length} open={L('polygons').length > 0}>
        {L('polygons').map((pg, i) => (
          <PolygonEdit key={i} pg={pg} index={i}
            onChange={(next) => set({ polygons: L('polygons').map((x, j) => (j === i ? next : x)) })}
            onRemove={() => set({ polygons: L('polygons').filter((_, j) => j !== i) })} />
        ))}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" style={S.ghost} onClick={() => set({ polygons: [...L('polygons'), { vertices: [{ x: 0, y: 0, label: 'A' }, { x: 4, y: 0, label: 'B' }, { x: 1, y: 3, label: 'C' }], sides: [] }] })}>＋ 三角形</button>
          <button type="button" style={S.ghost} onClick={() => set({ polygons: [...L('polygons'), { vertices: [{ x: 0, y: 0, label: 'A' }, { x: 4, y: 0, label: 'B' }, { x: 4, y: 3, label: 'C' }, { x: 0, y: 3, label: 'D' }], sides: [] }] })}>＋ 四邊形</button>
        </div>
      </Section>

      <Section title="線段 / 直線" count={L('segments').length + L('lines').length} open={L('segments').length + L('lines').length > 0}>
        <div style={S.sub}>線段（可加長度、等長號、平行號）</div>
        <ListEdit items={L('segments')} onChange={(v) => set({ segments: v })} addLabel="線段"
          make={() => ({ x1: 0, y1: 0, x2: 2, y2: 2 })}
          render={(s0, s) => <>
            <XY a={s0.x1} b={s0.y1} onA={(v) => s({ x1: v })} onB={(v) => s({ y1: v })} /><span style={S.muted}>→</span>
            <XY a={s0.x2} b={s0.y2} onA={(v) => s({ x2: v })} onB={(v) => s({ y2: v })} />
            <TextIn value={s0.label} placeholder="標籤 / 長度" width={90} onChange={(v) => s({ label: v })} />
            <Select value={String(s0.ticks || 0)} onChange={(v) => s({ ticks: +v })} options={TICKS} />
            <Select value={String(s0.arrows || 0)} onChange={(v) => s({ arrows: +v })} options={ARROWS} />
            <Check checked={s0.dashed} onChange={(v) => s({ dashed: v })} label="虛線" />
            <ColorPick value={s0.color} onChange={(c) => s({ color: c })} />
          </>} />
        <div style={S.sub}>直線 / 射線（經過兩點，延伸至圖邊）</div>
        <ListEdit items={L('lines')} onChange={(v) => set({ lines: v })} addLabel="直線"
          make={() => ({ x1: 0, y1: 0, x2: 1, y2: 1, kind: 'line' })}
          render={(l, s) => <>
            <XY a={l.x1} b={l.y1} onA={(v) => s({ x1: v })} onB={(v) => s({ y1: v })} /><span style={S.muted}>,</span>
            <XY a={l.x2} b={l.y2} onA={(v) => s({ x2: v })} onB={(v) => s({ y2: v })} />
            <Select value={l.kind || 'line'} onChange={(v) => s({ kind: v })} options={[['line', '直線'], ['ray', '射線']]} />
            <TextIn value={l.label} placeholder="標籤 $L_1$" width={90} onChange={(v) => s({ label: v })} />
            <Check checked={l.dashed} onChange={(v) => s({ dashed: v })} label="虛線" />
            <ColorPick value={l.color} onChange={(c) => s({ color: c })} />
          </>} />
      </Section>

      <Section title="圓" count={L('circles').length} open={L('circles').length > 0}>
        <ListEdit items={L('circles')} onChange={(v) => set({ circles: v })} addLabel="圓"
          make={() => ({ cx: 0, cy: 0, r: 3, centreLabel: 'O' })}
          render={(c, s) => <>
            <span style={S.muted}>圓心</span><XY a={c.cx} b={c.cy} onA={(v) => s({ cx: v })} onB={(v) => s({ cy: v })} />
            <span style={S.muted}>半徑</span><NumIn value={c.r} onChange={(v) => s({ r: v })} width={56} />
            <TextIn value={c.centreLabel} placeholder="圓心名" width={64} onChange={(v) => s({ centreLabel: v })} />
            <Check checked={c.showRadius} onChange={(v) => s({ showRadius: v })} label="畫半徑" />
            {c.showRadius && <>
              <NumIn value={c.radiusAngle} placeholder="30°" width={56} title="半徑方向（度）" onChange={(v) => s({ radiusAngle: v })} />
              <TextIn value={c.radiusLabel} placeholder="$r$" width={60} onChange={(v) => s({ radiusLabel: v })} />
            </>}
            <Check checked={c.fill} onChange={(v) => s({ fill: v })} label="塗色" />
            <Check checked={c.dashed} onChange={(v) => s({ dashed: v })} label="虛線" />
          </>} />
      </Section>

      <Section title="弧 / 扇形" count={L('arcs').length} open={L('arcs').length > 0}>
        <div style={S.muted}>角度由正 x 方向逆時針量度，例如 0° 至 60°。</div>
        <ListEdit items={L('arcs')} onChange={(v) => set({ arcs: v })} addLabel="弧"
          make={() => ({ cx: 0, cy: 0, r: 3, start: 0, end: 90, sector: true })}
          render={(a, s) => <>
            <span style={S.muted}>圓心</span><XY a={a.cx} b={a.cy} onA={(v) => s({ cx: v })} onB={(v) => s({ cy: v })} />
            <span style={S.muted}>半徑</span><NumIn value={a.r} onChange={(v) => s({ r: v })} width={52} />
            <span style={S.muted}>由</span><NumIn value={a.start} onChange={(v) => s({ start: v })} width={52} />
            <span style={S.muted}>至</span><NumIn value={a.end} onChange={(v) => s({ end: v })} width={52} /><span style={S.muted}>°</span>
            <Check checked={a.sector} onChange={(v) => s({ sector: v })} label="扇形" />
            <Check checked={a.fill} onChange={(v) => s({ fill: v })} label="塗色" />
            <TextIn value={a.label} placeholder="標籤" width={70} onChange={(v) => s({ label: v })} />
          </>} />
      </Section>

      <Section title="角號（∠ABC）" count={L('angles').length} open={L('angles').length > 0}>
        <div style={S.muted}>三點 A、B、C：在 B 點畫 ∠ABC。三角形的角可直接在多邊形頂點設定。</div>
        <ListEdit items={L('angles')} onChange={(v) => set({ angles: v })} addLabel="角"
          make={() => ({ ax: 1, ay: 0, bx: 0, by: 0, cx: 0, cy: 1, mark: '1', label: '' })}
          render={(a, s) => <>
            <span style={S.muted}>A</span><XY a={a.ax} b={a.ay} onA={(v) => s({ ax: v })} onB={(v) => s({ ay: v })} />
            <span style={S.muted}>B</span><XY a={a.bx} b={a.by} onA={(v) => s({ bx: v })} onB={(v) => s({ by: v })} />
            <span style={S.muted}>C</span><XY a={a.cx} b={a.cy} onA={(v) => s({ cx: v })} onB={(v) => s({ cy: v })} />
            <Select value={a.mark || '1'} onChange={(v) => s({ mark: v })} options={MARKS} />
            <TextIn value={a.label} placeholder="$\theta$ 或 40°" width={84} onChange={(v) => s({ label: v })} />
          </>} />
      </Section>

      <Section title="文字" count={L('texts').length} open={L('texts').length > 0}>
        <ListEdit items={L('texts')} onChange={(v) => set({ texts: v })} addLabel="文字"
          make={() => ({ x: 0, y: 0, text: '' })}
          render={(t, s) => <>
            <XY a={t.x} b={t.y} onA={(v) => s({ x: v })} onB={(v) => s({ y: v })} />
            <TextIn value={t.text} placeholder="文字，可用 $…$" onChange={(v) => s({ text: v })} />
          </>} />
      </Section>
    </div>
  );
}

function XY({ a, b, onA, onB }) {
  return <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
    <NumIn value={a} onChange={onA} width={52} placeholder="x" /><NumIn value={b} onChange={onB} width={52} placeholder="y" />
  </span>;
}

function PolygonEdit({ pg, index, onChange, onRemove }) {
  const vs = pg.vertices || [];
  const sides = pg.sides || [];
  const setV = (i, patch) => onChange({ ...pg, vertices: vs.map((v, j) => (j === i ? { ...v, ...patch } : v)) });
  const setSide = (i, patch) => { const next = [...sides]; while (next.length <= i) next.push({}); next[i] = { ...next[i], ...patch }; onChange({ ...pg, sides: next }); };
  const name = (i) => vs[i]?.label || String.fromCharCode(65 + i);
  const closed = pg.closed !== false;
  const nSides = closed ? vs.length : vs.length - 1;
  return (
    <div style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: 10, display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 13 }}>{vs.length === 3 ? '三角形' : `${vs.length} 邊形`} {vs.map((_, i) => name(i)).join('')}</b>
        <Check checked={closed} onChange={(v) => onChange({ ...pg, closed: v })} label="封閉" />
        <Check checked={pg.fill} onChange={(v) => onChange({ ...pg, fill: v })} label="塗色" />
        <Check checked={pg.dashed} onChange={(v) => onChange({ ...pg, dashed: v })} label="虛線" />
        <ColorPick value={pg.color || (pg.fill ? COLORS[index % COLORS.length] : undefined)} onChange={(c) => onChange({ ...pg, color: c })} />
        <button type="button" style={{ ...S.ghost, color: '#D70015', marginLeft: 'auto' }} onClick={onRemove}>刪除</button>
      </div>
      <div style={S.sub}>頂點（座標、名稱、角號）</div>
      {vs.map((v, i) => (
        <div key={i} style={S.row}>
          <XY a={v.x} b={v.y} onA={(x) => setV(i, { x })} onB={(y) => setV(i, { y })} />
          <TextIn value={v.label} placeholder="名稱" width={56} onChange={(label) => setV(i, { label })} />
          <Select value={v.mark || 'none'} onChange={(mark) => setV(i, { mark })} options={MARKS} />
          <TextIn value={v.angleLabel} placeholder="角的標籤" width={90} onChange={(angleLabel) => setV(i, { angleLabel })} />
          <button type="button" style={{ ...S.ghost, padding: '4px 9px', color: '#D70015', marginLeft: 'auto' }}
            onClick={() => onChange({ ...pg, vertices: vs.filter((_, j) => j !== i), sides: sides.filter((_, j) => j !== i) })}>×</button>
        </div>
      ))}
      <button type="button" style={{ ...S.ghost, justifySelf: 'start' }} onClick={() => onChange({ ...pg, vertices: [...vs, { x: 0, y: 0, label: String.fromCharCode(65 + vs.length) }] })}>＋ 頂點</button>
      {nSides > 0 && <div style={S.sub}>邊（長度標籤、等長號、平行號）</div>}
      {Array.from({ length: Math.max(0, nSides) }, (_, i) => (
        <div key={i} style={S.row}>
          <span style={{ fontSize: 13, fontWeight: 600, minWidth: 34 }}>{name(i)}{name((i + 1) % vs.length)}</span>
          <TextIn value={sides[i]?.label} placeholder="例如 8 cm、$x$" onChange={(label) => setSide(i, { label })} />
          <Select value={String(sides[i]?.ticks || 0)} onChange={(t) => setSide(i, { ticks: +t })} options={TICKS} />
          <Select value={String(sides[i]?.arrows || 0)} onChange={(t) => setSide(i, { arrows: +t })} options={ARROWS} />
        </div>
      ))}
    </div>
  );
}

// ── Solid ────────────────────────────────────────────────────────────────────
function SolidEditor({ fig, set }) {
  const info = solidInfo(fig.shape);
  const roleText = info.roles.map((r, i) => (info.roleNames ? `${info.roleNames[i]}` : r)).join('、');
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Select value={fig.shape} onChange={(v) => set({ shape: v, labels: '' })} options={SOLIDS.map((s) => [s.shape, s.label])} />
        {info.dims.map((d, i) => d && (
          <span key={i} style={{ ...S.muted, display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            {d}<NumIn value={fig[['a', 'b', 'c'][i]]} width={56} onChange={(v) => set({ [['a', 'b', 'c'][i]]: v })} />
          </span>
        ))}
        {!['cylinder', 'cone', 'frustum', 'sphere', 'hemisphere'].includes(fig.shape) && <Check checked={fig.flip} onChange={(v) => set({ flip: v })} label="左右反轉" />}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={S.muted}>頂點名稱</span>
        <TextIn value={fig.labels} placeholder={(info.defaultLabels || info.roles).join(',') || '用逗號分隔'} onChange={(v) => set({ labels: v })} />
      </div>
      <div style={S.muted}>次序：{roleText}。用逗號分隔，「-」表示不標示。</div>
      <Section title="其他點（中點、分點、面的中心）" count={(fig.points || []).length} open={(fig.points || []).length > 0}>
        <ListEdit items={fig.points} onChange={(v) => set({ points: v })} addLabel="點"
          make={() => ({ label: 'M', of: 'AB', t: 0.5 })}
          render={(p, s) => <>
            <TextIn value={p.label} placeholder="名稱" width={50} onChange={(v) => s({ label: v })} />
            <span style={S.muted}>在</span>
            <TextIn value={p.of} placeholder="AB 或 ABCD" width={90} onChange={(v) => s({ of: v })} />
            {String(p.of || '').replace(/[,\s]/g, '').length <= 2 && <><span style={S.muted}>位置 t</span><NumIn value={p.t} placeholder="0.5" width={56} onChange={(v) => s({ t: v })} /></>}
          </>} />
        <div style={S.muted}>兩點（如 AB）：t = 0.5 為中點；三點或以上（如 ABCD）：該面的中心。</div>
      </Section>
      <Section title="線段 / 長度標籤" count={(fig.segments || []).length} open>
        <ListEdit items={fig.segments} onChange={(v) => set({ segments: v })} addLabel="線段"
          make={() => ({ from: '', to: '', style: 'dashed', label: '' })}
          render={(s0, s) => <>
            <TextIn value={s0.from} placeholder="由" width={46} onChange={(v) => s({ from: v })} />
            <span style={S.muted}>至</span>
            <TextIn value={s0.to} placeholder="至" width={46} onChange={(v) => s({ to: v })} />
            <Select value={s0.style || 'dashed'} onChange={(v) => s({ style: v })} options={[['solid', '實線'], ['dashed', '虛線'], ['none', '只標籤（現有的邊）']]} />
            <TextIn value={s0.label} placeholder="長度，如 8 cm" onChange={(v) => s({ label: v })} />
          </>} />
      </Section>
      <Section title="角號" count={(fig.angles || []).length} open={(fig.angles || []).length > 0}>
        <ListEdit items={fig.angles} onChange={(v) => set({ angles: v })} addLabel="角"
          make={() => ({ at: '', from: '', to: '', mark: '1', label: '$\\theta$' })}
          render={(a, s) => <>
            <span style={S.muted}>∠</span>
            <TextIn value={a.from} placeholder="A" width={40} onChange={(v) => s({ from: v })} />
            <TextIn value={a.at} placeholder="頂點" width={48} onChange={(v) => s({ at: v })} />
            <TextIn value={a.to} placeholder="C" width={40} onChange={(v) => s({ to: v })} />
            <Select value={a.mark || '1'} onChange={(v) => s({ mark: v })} options={MARKS} />
            <TextIn value={a.label} placeholder="標籤" width={70} onChange={(v) => s({ label: v })} />
          </>} />
      </Section>
    </div>
  );
}

// ── Stats ────────────────────────────────────────────────────────────────────
const DATA_HINT = {
  bar: '每行：類別, 數值。多組：第一行寫「類別, 男, 女」。', line: '每行：類別, 數值',
  histogram: '每行：組別（如 10-19）, 頻數', freqpoly: '每行：組別（如 10-19）, 頻數',
  cumfreq: '每行：上組界, 累積頻數（第一行可寫最低組界, 0）', pie: '每行：項目, 數值',
  box: '每行：名稱, 最小值, 下四分位數, 中位數, 上四分位數, 最大值', scatter: '每行：x, y',
  stemleaf: '輸入原始數據（逗號分隔），或每行「莖 | 葉」', dot: '輸入原始數據（逗號分隔）',
};

function StatsEditor({ fig, set }) {
  const chart = fig.chart || 'bar';
  const samples = CHARTS.map((c) => c.sample);
  const axisCharts = ['bar', 'line', 'histogram', 'freqpoly', 'cumfreq', 'scatter'];
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Select value={chart} onChange={(v) => {
          const patch = { chart: v };
          if (!String(fig.data || '').trim() || samples.includes(fig.data)) patch.data = CHARTS.find((c) => c.chart === v)?.sample || '';
          set(patch);
        }} options={CHARTS.map((c) => [c.chart, c.label])} />
        {chart !== 'pie' && chart !== 'stemleaf' && <>
          <span style={S.muted}>橫軸</span><TextIn value={fig.xLabel} width={110} onChange={(v) => set({ xLabel: v })} />
        </>}
        {axisCharts.includes(chart) && <>
          <span style={S.muted}>縱軸</span><TextIn value={fig.yLabel} width={110} onChange={(v) => set({ yLabel: v })} />
        </>}
      </div>
      <div style={S.muted}>{DATA_HINT[chart]}（可直接從 Excel 貼上）</div>
      <textarea value={fig.data || ''} onChange={(e) => set({ data: e.target.value })}
        style={{ ...S.input, minHeight: 110, fontFamily: 'ui-monospace, Menlo, monospace', resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {['bar', 'line', 'histogram', 'freqpoly', 'cumfreq'].includes(chart) && <>
          <span style={S.muted}>縱軸最大值</span><NumIn value={fig.yMax} placeholder="自動" width={64} onChange={(v) => set({ yMax: v })} />
          <span style={S.muted}>刻度</span><NumIn value={fig.yStep} placeholder="自動" width={64} onChange={(v) => set({ yStep: v })} />
        </>}
        {chart === 'histogram' && <Select value={fig.xMarks || 'boundary'} onChange={(v) => set({ xMarks: v })} options={[['boundary', '橫軸標組界'], ['mark', '橫軸標組中點']]} />}
        {chart === 'cumfreq' && <Check checked={fig.smooth !== false} onChange={(v) => set({ smooth: v })} label="平滑曲線（取消 = 累積頻數多邊形）" />}
        {chart === 'pie' && <Select value={fig.pieShow || 'percent'} onChange={(v) => set({ pieShow: v })} options={[['percent', '顯示百分比'], ['angle', '顯示圓心角'], ['value', '顯示數值'], ['none', '只顯示名稱']]} />}
        {chart === 'stemleaf' && <>
          <span style={S.muted}>莖的單位</span>
          <Select value={String(fig.stemUnit || 10)} onChange={(v) => set({ stemUnit: +v })} options={[['100', '百位'], ['10', '十位'], ['1', '個位'], ['0.1', '十分位']]} />
        </>}
        {['box', 'scatter', 'dot'].includes(chart) && <>
          <span style={S.muted}>橫軸範圍</span>
          <NumIn value={fig.xMin} placeholder="自動" width={60} onChange={(v) => set({ xMin: v })} />
          <NumIn value={fig.xMax} placeholder="自動" width={60} onChange={(v) => set({ xMax: v })} />
          <span style={S.muted}>刻度</span><NumIn value={fig.xStep} placeholder="自動" width={60} onChange={(v) => set({ xStep: v })} />
        </>}
      </div>
    </div>
  );
}

// ── Number line ──────────────────────────────────────────────────────────────
function NumberLineEditor({ fig, set }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', ...S.muted }}>
        由 <NumIn value={fig.min} onChange={(v) => set({ min: v })} /> 至 <NumIn value={fig.max} onChange={(v) => set({ max: v })} />
        刻度 <NumIn value={fig.step} onChange={(v) => set({ step: v })} />
      </div>
      <div style={S.sub}>解集（留空 = 無限）</div>
      <ListEdit items={fig.intervals} onChange={(v) => set({ intervals: v })} addLabel="區間"
        make={() => ({ from: 0, to: '', fromIncl: false, toIncl: false })}
        render={(iv, s) => <>
          <NumIn value={iv.from} placeholder="−∞" onChange={(v) => s({ from: v })} />
          <Check checked={iv.fromIncl} onChange={(v) => s({ fromIncl: v })} label="包括 (●)" />
          <span style={S.muted}>至</span>
          <NumIn value={iv.to} placeholder="∞" onChange={(v) => s({ to: v })} />
          <Check checked={iv.toIncl} onChange={(v) => s({ toIncl: v })} label="包括 (●)" />
        </>} />
      <div style={S.sub}>點</div>
      <ListEdit items={fig.points} onChange={(v) => set({ points: v })} addLabel="點"
        make={() => ({ at: 0, open: false, label: '' })}
        render={(p, s) => <>
          <NumIn value={p.at} onChange={(v) => s({ at: v })} />
          <Check checked={p.open} onChange={(v) => s({ open: v })} label="空心" />
          <TextIn value={p.label} placeholder="標籤" width={80} onChange={(v) => s({ label: v })} />
        </>} />
    </div>
  );
}

// ── Venn ─────────────────────────────────────────────────────────────────────
function VennEditor({ fig, set }) {
  const n = Number(fig.sets) === 3 ? 3 : 2;
  const labels = Array.isArray(fig.labels) ? fig.labels : ['A', 'B', 'C'];
  const regions = fig.regions || {};
  const shaded = Array.isArray(fig.shaded) ? fig.shaded : [];
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Select value={String(n)} onChange={(v) => set({ sets: +v })} options={[['2', '兩個集合'], ['3', '三個集合']]} />
        <span style={S.muted}>全集</span><TextIn value={fig.universal ?? 'U'} width={50} onChange={(v) => set({ universal: v })} />
        <span style={S.muted}>集合名稱</span>
        {Array.from({ length: n }, (_, i) => (
          <TextIn key={i} value={labels[i]} width={50} onChange={(v) => { const next = [...labels]; next[i] = v; set({ labels: next }); }} />
        ))}
      </div>
      <div style={S.sub}>各區的內容及陰影</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6 }}>
        {VENN_REGIONS[n].map(([k, name]) => (
          <div key={k} style={S.row}>
            <span style={{ ...S.muted, minWidth: 74 }}>{name.replace(/A/g, labels[0] || 'A').replace(/B/g, labels[1] || 'B').replace(/C/g, labels[2] || 'C')}</span>
            <TextIn value={regions[k]} width={60} onChange={(v) => set({ regions: { ...regions, [k]: v } })} />
            <Check checked={shaded.includes(k)} onChange={(v) => set({ shaded: v ? [...shaded, k] : shaded.filter((x) => x !== k) })} label="陰影" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tree ─────────────────────────────────────────────────────────────────────
function TreeEditor({ fig, set }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={S.muted}>每行一條分支：「結果 | 概率」。下一層前面加兩個空格。</div>
      <textarea value={fig.text || ''} onChange={(e) => set({ text: e.target.value })}
        style={{ ...S.input, minHeight: 140, fontFamily: 'ui-monospace, Menlo, monospace', resize: 'vertical' }} />
      <Check checked={fig.showOutcomes} onChange={(v) => set({ showOutcomes: v })} label="右邊顯示結果（如 RB）" />
    </div>
  );
}

// ── Image ────────────────────────────────────────────────────────────────────
const MAX_IMAGE_BYTES = 150 * 1024;
async function shrinkImage(file, { maxDim = 1000, maxBytes = MAX_IMAGE_BYTES, type = 'image/webp' } = {}) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    let w = img.naturalWidth; let h = img.naturalHeight;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    w = Math.round(w * scale); h = Math.round(h * scale);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
      const data = c.toDataURL(type, 0.86 - attempt * 0.08);
      if (data.length * 0.75 <= maxBytes) return data;
      w = Math.round(w * 0.8); h = Math.round(h * 0.8);
    }
    throw new Error('圖片太大');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function ImageEditor({ fig, set }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => {
        const f = e.target.files?.[0]; if (!f) return;
        setBusy(true); setErr('');
        try { set({ src: await shrinkImage(f) }); } catch (x) { setErr(x.message || '無法讀取圖片'); } finally { setBusy(false); e.target.value = ''; }
      }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" style={S.ghost} onClick={() => ref.current?.click()} disabled={busy}>{busy ? '處理中…' : fig.src ? '更換圖片' : '選擇圖片'}</button>
        {fig.src && <span style={S.muted}>約 {Math.round((fig.src.length * 0.75) / 1024)} KB</span>}
        <TextIn value={fig.alt} placeholder="圖片描述（給讀屏器及 AI 批改用）" onChange={(v) => set({ alt: v })} />
      </div>
      <div style={S.muted}>圖片會自動壓縮（最大約 150 KB）。按上方「🪄 轉成可編輯圖形」可讓 AI 把它轉成可修改的圖形，題庫便只需儲存文字描述。</div>
      {err && <div style={{ color: '#D70015', fontSize: 12, fontWeight: 600 }}>{err}</div>}
    </div>
  );
}

const EDITORS = { plot: PlotEditor, solid: SolidEditor, stats: StatsEditor, numberline: NumberLineEditor, venn: VennEditor, tree: TreeEditor, image: ImageEditor };

// ── Picture → editable figure (AI) ───────────────────────────────────────────
// For the AI the picture is sent once at good resolution; only the figure description is saved.
const forAi = (file) => shrinkImage(file, { maxDim: 1600, maxBytes: 900 * 1024, type: 'image/jpeg' });

function AiConvertPanel({ image, onCancel, onDone }) {
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function run() {
    setBusy(true); setErr('');
    try {
      const r = await figureFromImage({ image, hint });
      onDone(r.figures.map((f) => ({ ...f, _source: image, _note: r.note || '' })));
    } catch (e) {
      setErr(e.message || '轉換失敗');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div style={{ border: '1px dashed #5E5CE6', borderRadius: 14, padding: 12, background: 'rgba(94,92,230,0.04)', display: 'grid', gap: 10 }}>
      <b style={{ fontSize: 14 }}>🪄 圖片轉成可編輯圖形（AI）</b>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <img src={image} alt="上載的圖" style={{ maxWidth: 260, maxHeight: 220, borderRadius: 10, border: '1px solid rgba(0,0,0,0.1)', background: '#fff' }} />
        <div style={{ flex: '1 1 240px', display: 'grid', gap: 8 }}>
          <textarea value={hint} onChange={(e) => setHint(e.target.value)} placeholder="補充說明（可選），例如：ABCD 是長方體；只要右邊的圖；曲線是 y = 2^x"
            style={{ ...S.input, minHeight: 70, resize: 'vertical' }} />
          <div style={S.muted}>AI 會讀取圖中的形狀、標籤和數字，產生可編輯的圖形（SVG）。題庫只會儲存圖形描述，不會儲存這張圖片。轉換後請對照原圖檢查。</div>
          {err && <div style={{ color: '#D70015', fontSize: 12, fontWeight: 600 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={run} disabled={busy} style={{ ...S.ghost, background: '#5E5CE6', color: '#fff', fontWeight: 600 }}>{busy ? 'AI 轉換中…（約 10–30 秒）' : '開始轉換'}</button>
            <button type="button" onClick={onCancel} disabled={busy} style={S.ghost}>取消</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── All figures of a question ────────────────────────────────────────────────
export default function FiguresEditor({ figures, onChange }) {
  const list = Array.isArray(figures) ? figures : [];
  const fileRef = useRef(null);
  const [convert, setConvert] = useState(null); // { image, replaceIndex }
  const [prepErr, setPrepErr] = useState('');
  async function pickForAi(e) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setPrepErr('');
    try { setConvert({ image: await forAi(f), replaceIndex: null }); } catch (x) { setPrepErr(x.message || '無法讀取圖片'); }
  }
  const setAt = (i, patch) => onChange(list.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; const next = [...list]; [next[i], next[j]] = [next[j], next[i]]; onChange(next); };
  const groups = [...new Set(TEMPLATES.map((t) => t.group))];

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {list.map((f, i) => {
        const Ed = EDITORS[f.type || 'plot'];
        return (
          <div key={i} style={{ border: '1px solid rgba(0,0,0,0.10)', borderRadius: 14, padding: 12, background: '#fff', display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <b style={{ fontSize: 14, color: '#1D1D1F' }}>圖 {i + 1}：{typeLabel(f.type || 'plot')}</b>
              <TextIn value={f.caption} placeholder="圖下說明（可選）" width={140} onChange={(v) => setAt(i, { caption: v })} />
              {f.type === 'image' && f.src && (
                <button type="button" style={{ ...S.ghost, background: '#5E5CE6', color: '#fff' }} onClick={() => setConvert({ image: f.src, replaceIndex: i })}>🪄 轉成可編輯圖形</button>
              )}
              <Select value={f.size || 'M'} onChange={(v) => setAt(i, { size: v })} options={[['S', '小'], ['M', '中'], ['L', '大']]} />
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                {list.length > 1 && <>
                  <button type="button" style={S.ghost} onClick={() => move(i, -1)} disabled={i === 0} aria-label="上移">↑</button>
                  <button type="button" style={S.ghost} onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label="下移">↓</button>
                </>}
                <button type="button" style={{ ...S.ghost, color: '#D70015' }} onClick={() => onChange(list.filter((_, j) => j !== i))}>移除</button>
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, alignItems: 'start' }}>
              <div style={{ minWidth: 0 }}>{Ed ? <Ed fig={f} set={(patch) => setAt(i, patch)} /> : null}</div>
              <div style={{ minWidth: 0, position: 'sticky', top: 8 }}>
                <div style={{ ...S.sub, marginBottom: 6 }}>預覽</div>
                <Figure fig={f} maxWidth={420} />
                {f._source && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={S.sub}>原圖（只作對照，不會儲存）</span>
                      <button type="button" style={{ ...S.ghost, padding: '3px 9px' }} onClick={() => setAt(i, { _source: undefined, _note: undefined })}>隱藏</button>
                    </div>
                    {f._note && <div style={{ ...S.muted, color: '#B25000', marginBottom: 4 }}>AI：{f._note}</div>}
                    <img src={f._source} alt="原圖" style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 10, border: '1px dashed rgba(0,0,0,0.2)' }} />
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {convert && (
        <AiConvertPanel image={convert.image} onCancel={() => setConvert(null)} onDone={(figs) => {
          const at = convert.replaceIndex;
          onChange(at == null ? [...list, ...figs] : [...list.slice(0, at), ...figs, ...list.slice(at + 1)]);
          setConvert(null);
        }} />
      )}
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickForAi} />
      {prepErr && <div style={{ color: '#D70015', fontSize: 12, fontWeight: 600 }}>{prepErr}</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={!!convert}
          style={{ ...S.ghost, padding: '8px 14px', fontWeight: 600, background: '#5E5CE6', color: '#fff' }}>🪄 上載圖片轉成圖形（AI）</button>
        <select value="" onChange={(e) => {
          const v = e.target.value; if (!v) return;
          const [kind, key] = v.split(':');
          const fig = kind === 't' ? TEMPLATES[+key].fig() : newFigure(key);
          onChange([...list, fig]);
        }} style={{ ...S.input, padding: '8px 12px', fontWeight: 600, background: '#E3E3E8', border: 0, borderRadius: 999, cursor: 'pointer' }}>
          <option value="">{list.length ? '＋ 再加入圖形…' : '📐 加入圖形 / 圖表…'}</option>
          <optgroup label="空白">
            {FIGURE_TYPES.map((t) => <option key={t.type} value={`n:${t.type}`}>{t.type === 'image' ? '上載圖片（保留為圖片）' : `${t.label}（${t.hint}）`}</option>)}
          </optgroup>
          {groups.map((g) => (
            <optgroup key={g} label={`範本：${g}`}>
              {TEMPLATES.map((t, k) => t.group === g && <option key={k} value={`t:${k}`}>{t.label}</option>)}
            </optgroup>
          ))}
        </select>
      </div>
    </div>
  );
}
