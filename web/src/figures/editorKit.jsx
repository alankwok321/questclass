import React from 'react';
import { COLORS } from './model.js';

// Small form controls shared by the figure editors.

export const S = {
  input: {
    padding: '6px 9px', border: '1px solid #D2D2D7', borderRadius: 8, fontSize: 13, fontWeight: 500,
    outline: 'none', background: '#fff', fontFamily: 'inherit', color: '#1D1D1F', boxSizing: 'border-box', minWidth: 0,
  },
  ghost: {
    border: 0, background: '#E3E3E8', color: '#1D1D1F', padding: '6px 12px', borderRadius: 999,
    fontWeight: 500, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  row: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', background: '#FAFAFC', borderRadius: 10, padding: '7px 9px' },
  muted: { fontSize: 12, color: '#6E6E73' },
  sub: { fontSize: 12, fontWeight: 700, color: '#6E6E73' },
};

export function NumIn({ value, onChange, placeholder, width = 60, title }) {
  return (
    <input type="number" step="any" value={value ?? ''} placeholder={placeholder} title={title}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      style={{ ...S.input, width }} />
  );
}

export function TextIn({ value, onChange, placeholder, width, flex, title }) {
  return (
    <input value={value ?? ''} placeholder={placeholder} title={title} onChange={(e) => onChange(e.target.value)}
      style={{ ...S.input, width: width ?? 'auto', flex: flex ?? (width ? undefined : '1 1 90px') }} />
  );
}

export function Check({ checked, onChange, label }) {
  return (
    <label style={{ ...S.muted, display: 'flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap' }}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}

export function Select({ value, onChange, options, width }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} style={{ ...S.input, width }}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

export const MARKS = [['none', '無角號'], ['1', '∠ 一弧'], ['2', '∠ 兩弧'], ['3', '∠ 三弧'], ['right', '∟ 直角']];
export const TICKS = [['0', '—'], ['1', '| 等長'], ['2', '|| 等長'], ['3', '||| 等長']];
export const ARROWS = [['0', '—'], ['1', '> 平行'], ['2', '>> 平行'], ['3', '>>> 平行']];

export function ColorPick({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {COLORS.map((c) => (
        <button key={c} type="button" aria-label={c} onClick={() => onChange(c)} style={{
          width: 16, height: 16, borderRadius: 999, background: c, cursor: 'pointer', padding: 0,
          border: value === c ? '2px solid #fff' : '2px solid transparent', boxShadow: value === c ? `0 0 0 2px ${c}` : 'none',
        }} />
      ))}
    </div>
  );
}

export function RemoveBtn({ onClick }) {
  return <button type="button" onClick={onClick} style={{ ...S.ghost, padding: '4px 9px', color: '#D70015', marginLeft: 'auto' }} aria-label="刪除">×</button>;
}

/** Edits an array of objects: one row per item, an add button at the end. */
export function ListEdit({ items, onChange, make, addLabel, render }) {
  const list = Array.isArray(items) ? items : [];
  const set = (i, patch) => onChange(list.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {list.map((it, i) => (
        <div key={i} style={S.row}>
          {render(it, (patch) => set(i, patch), i)}
          <RemoveBtn onClick={() => onChange(list.filter((_, j) => j !== i))} />
        </div>
      ))}
      <button type="button" style={{ ...S.ghost, justifySelf: 'start' }} onClick={() => onChange([...list, make(list.length)])}>＋ {addLabel}</button>
    </div>
  );
}

/** Collapsible section. */
export function Section({ title, count, open, children }) {
  return (
    <details open={open} style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 8 }}>
      <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#1D1D1F' }}>
        {title}{count ? <span style={{ color: '#0071E3', marginLeft: 6 }}>{count}</span> : null}
      </summary>
      <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>{children}</div>
    </details>
  );
}
