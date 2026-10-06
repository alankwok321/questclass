import React, { useState } from 'react';
import { Copy, Printer, Sparkles } from 'lucide-react';
import { useToast } from '../../components/Toast.jsx';

// Small building blocks shared by the 教師工具.
export const inputStyle = {
  width: '100%', boxSizing: 'border-box', height: 38, borderRadius: 10, border: '1px solid #D2D2D7',
  padding: '0 12px', fontSize: 15, fontFamily: 'inherit', background: '#fff', color: '#1D1D1F',
};
export const areaStyle = { ...inputStyle, height: 'auto', padding: 12, lineHeight: 1.6, resize: 'vertical' };

export function Field({ label, hint, children, style }) {
  return (
    <label style={{ display: 'grid', gap: 6, minWidth: 0, ...style }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#3A3A3C' }}>{label}</span>
      {children}
      {hint ? <span style={{ fontSize: 12, color: '#86868B' }}>{hint}</span> : null}
    </label>
  );
}

export function Row({ children, min = 180 }) {
  return <div style={{ display: 'grid', gap: 12, gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` }}>{children}</div>;
}

export function Select({ value, onChange, options, ...rest }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} {...rest}>
      {options.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>))}
    </select>
  );
}

export function AiButton({ busy, onClick, children = '用 AI 產生', disabled }) {
  return (
    <button type="button" className="qcBtn qcBtnPrimary" onClick={onClick} disabled={busy || disabled}>
      <Sparkles size={15} aria-hidden="true" /> {busy ? 'AI 撰寫中…' : children}
    </button>
  );
}

export function useCopy() {
  const toast = useToast();
  return async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast?.show?.('已複製');
    } catch {
      toast?.show?.('未能複製，請手動選取');
    }
  };
}

export function ResultActions({ text, print = false }) {
  const copy = useCopy();
  return (
    <div className="qcNoPrint" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button type="button" className="qcBtn qcBtnSecondary qcBtnSmall" onClick={() => copy(text)}><Copy size={14} aria-hidden="true" /> 複製</button>
      {print ? <button type="button" className="qcBtn qcBtnSecondary qcBtnSmall" onClick={() => window.print()}><Printer size={14} aria-hidden="true" /> 列印</button> : null}
    </div>
  );
}

export function ErrorNote({ text }) {
  return text ? <div style={{ color: '#B8000F', fontSize: 14, fontWeight: 500 }}>{text}</div> : null;
}

export function SubTitle({ children }) {
  return <div style={{ fontSize: 13, fontWeight: 700, color: '#6E6E73', marginTop: 4 }}>{children}</div>;
}

export function List({ items, ordered }) {
  const Tag = ordered ? 'ol' : 'ul';
  if (!items?.length) return null;
  return <Tag style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7, fontSize: 15 }}>{items.map((x, i) => <li key={i}>{x}</li>)}</Tag>;
}

export const asList = (v) => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).filter(Boolean) : (v ? [String(v)] : []));

export function useBusy() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async (fn) => {
    setBusy(true);
    setErr('');
    try { await fn(); } catch (e) { setErr(e?.message || '失敗，請再試一次'); } finally { setBusy(false); }
  };
  return { busy, err, run, setErr };
}

export const LEVELS = ['小一', '小二', '小三', '小四', '小五', '小六', '中一', '中二', '中三', '中四', '中五', '中六'];
export const SUBJECTS = ['數學', '中文', '英文', '常識', '科學', '人文', '中國歷史', '歷史', '地理', '物理', '化學', '生物', '經濟', '公民與社會發展', '視藝', '音樂', '體育', '其他'];
