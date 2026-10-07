import React, { useState } from 'react';

// Small, single-series charts for class statistics. One hue (blue), thin bars with rounded
// data ends, recessive grid, and a hover tooltip on every bar. Text stays in text colours.
const BAR = '#0071E3';
const BAR_DIM = '#9CC3F5';
const GRID = '#E8E8ED';
const MUTED = '#6E6E73';

function Tooltip({ x, y, children }) {
  return (
    <div role="tooltip" style={{
      position: 'absolute', left: x, top: y, transform: 'translate(-50%, calc(-100% - 8px))', pointerEvents: 'none',
      background: '#1D1D1F', color: '#fff', borderRadius: 8, padding: '6px 9px', fontSize: 12, lineHeight: 1.4,
      whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: 2,
    }}>{children}</div>
  );
}

const shortDate = (v) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('zh-HK', { month: 'numeric', day: 'numeric' }) : '';
};

/** Average score (%) per homework, oldest → newest. items: [{ id, title, avg, dueAt, handedIn, assigned }] */
export function ScoreBars({ items, height = 180 }) {
  const [hover, setHover] = useState(null);
  const data = items.filter((h) => h.avg != null);
  if (!data.length) return <div className="qcEmpty">學生交作業並批改後，這裡會顯示每份作業的平均分。</div>;
  const n = data.length;
  const slot = 100 / n;
  const barW = Math.min(slot * 0.6, 9); // % of width
  return (
    <figure style={{ margin: 0 }}>
      <div style={{ position: 'relative', height, marginLeft: 34 }} onMouseLeave={() => setHover(null)}>
        {[0, 50, 100].map((v) => (
          <div key={v} aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: `${v}%`, borderTop: `1px solid ${GRID}` }}>
            <span style={{ position: 'absolute', left: -34, top: -8, width: 28, textAlign: 'right', fontSize: 11, color: MUTED }}>{v}%</span>
          </div>
        ))}
        {data.map((h, i) => {
          const on = hover === i;
          return (
            <div key={h.id}
              onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}
              aria-label={`${h.title}：平均 ${h.avg}%，已交 ${h.handedIn}/${h.assigned}`}
              style={{ position: 'absolute', bottom: 0, top: 0, left: `${slot * i}%`, width: `${slot}%`, cursor: 'default', outline: 'none' }}>
              <div style={{
                position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: `${(barW / slot) * 100}%`, minWidth: 6, maxWidth: 28,
                height: `${Math.max(1, h.avg)}%`, background: hover == null || on ? BAR : BAR_DIM, borderRadius: '4px 4px 0 0', transition: 'background .15s',
              }} />
              {on ? <Tooltip x="50%" y={`${100 - h.avg}%`}><b>{h.title}</b><br />平均 {h.avg}% · 已交 {h.handedIn}/{h.assigned}{h.dueAt ? ` · ${shortDate(h.dueAt)}` : ''}</Tooltip> : null}
              {n <= 12 ? <div aria-hidden="true" style={{ position: 'absolute', bottom: -18, left: '50%', transform: 'translateX(-50%)', fontSize: 11, color: MUTED, whiteSpace: 'nowrap' }}>{shortDate(h.dueAt) || i + 1}</div> : null}
            </div>
          );
        })}
      </div>
      <figcaption style={{ marginTop: 26, fontSize: 12, color: MUTED }}>每份作業的班級平均分（由舊到新）。把滑鼠移到棒上看詳情。</figcaption>
    </figure>
  );
}

/** Accuracy per topic, weakest first. items: [{ topic, pct, questions }] */
export function TopicBars({ items, weakBelow = 60, max = 8 }) {
  const [hover, setHover] = useState(null);
  const data = items.slice(0, max);
  if (!data.length) return <div className="qcEmpty">題目有「課題」並已批改後，這裡會顯示各課題的答對率。</div>;
  return (
    <div style={{ display: 'grid', gap: 10 }} onMouseLeave={() => setHover(null)}>
      {data.map((t, i) => (
        <div key={t.topic} style={{ display: 'grid', gridTemplateColumns: 'minmax(70px, 120px) minmax(0, 1fr) 64px', gap: 10, alignItems: 'center', position: 'relative' }}
          onMouseEnter={() => setHover(i)}>
          <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.topic}>{t.topic}</div>
          <div style={{ position: 'relative', height: 10, borderRadius: 999, background: '#F0F0F3' }}>
            <div style={{ position: 'absolute', inset: 0, width: `${Math.max(2, t.pct)}%`, borderRadius: 999, background: hover == null || hover === i ? BAR : BAR_DIM }} />
            {hover === i ? <Tooltip x={`${Math.max(2, t.pct)}%`} y="0"><b>{t.topic}</b> · 答對率 {t.pct}% · {t.questions} 題</Tooltip> : null}
          </div>
          <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
            {t.pct}%{t.pct < weakBelow ? <span style={{ display: 'block', fontSize: 11, color: '#B25000', fontWeight: 600 }}>需加強</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Ring({ value, color = BAR, size = 68, stroke = 9 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = value == null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  return (
    <svg className="qcRing" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={GRID} strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${c * p} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}

export function TrendMark({ trend }) {
  if (trend == null) return <span style={{ color: '#86868B' }}>—</span>;
  if (trend > 0) return <span style={{ color: '#1E7B34', fontWeight: 700 }} title="最近進步">↑ 進步</span>;
  if (trend < 0) return <span style={{ color: '#B8000F', fontWeight: 700 }} title="最近退步">↓ 退步</span>;
  return <span style={{ color: MUTED }} title="大致穩定">→ 穩定</span>;
}

/** Count per day (e.g. people who signed in). items: [{ day: 'YYYY-MM-DD', value, note }] */
export function DayBars({ items, height = 170, unit = '人' }) {
  const [hover, setHover] = useState(null);
  if (!items.length) return null;
  const max = Math.max(1, ...items.map((d) => d.value));
  const top = Math.max(1, Math.ceil(max / 5) * 5);
  const n = items.length;
  const slot = 100 / n;
  const every = n <= 10 ? 1 : n <= 31 ? 5 : 15;
  const label = (d) => { const [, m, dd] = d.split('-'); return `${Number(dd)}/${Number(m)}`; };
  return (
    <figure style={{ margin: 0 }}>
      <div style={{ position: 'relative', height, marginLeft: 30 }} onMouseLeave={() => setHover(null)}>
        {[0, top / 2, top].map((v) => (
          <div key={v} aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: `${(v / top) * 100}%`, borderTop: `1px solid ${GRID}` }}>
            <span style={{ position: 'absolute', left: -30, top: -8, width: 24, textAlign: 'right', fontSize: 11, color: MUTED }}>{Math.round(v)}</span>
          </div>
        ))}
        {items.map((d, i) => {
          const on = hover === i;
          const h = (d.value / top) * 100;
          return (
            <div key={d.day} tabIndex={0} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
              aria-label={`${d.day}：${d.value} ${unit}`}
              style={{ position: 'absolute', top: 0, bottom: 0, left: `${slot * i}%`, width: `${slot}%`, outline: 'none' }}>
              <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '62%', maxWidth: 22, minWidth: 3,
                height: `${d.value ? Math.max(1.5, h) : 0}%`, background: hover == null || on ? BAR : BAR_DIM, borderRadius: '4px 4px 0 0' }} />
              {on ? <Tooltip x="50%" y={`${100 - h}%`}><b>{d.day}</b><br />{d.value} {unit}{d.note ? ` · ${d.note}` : ''}</Tooltip> : null}
              {(n - 1 - i) % every === 0 ? <div aria-hidden="true" style={{ position: 'absolute', bottom: -18, left: '50%', transform: 'translateX(-50%)', fontSize: 11, color: MUTED, whiteSpace: 'nowrap' }}>{label(d.day)}</div> : null}
            </div>
          );
        })}
      </div>
      <div style={{ height: 22 }} />
    </figure>
  );
}
