import React, { useEffect, useMemo, useState } from 'react';
import { analyzeClass, loadClassData, loadClasses } from '../services/analytics.js';

// Shared by 儀表板 and 學習報告: pick a class, load its real data, analyse it.
const KEY = 'qc_stats_class';
const remembered = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
const remember = (v) => { try { localStorage.setItem(KEY, v); } catch { /* ignore */ } };

export function useClassAnalysis({ since = null } = {}) {
  const [classes, setClasses] = useState([]);
  const [cls, setClsState] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let on = true;
    (async () => {
      setLoading(true);
      setErr('');
      try {
        if (!window.QuestClassFirebase) throw new Error('Firebase 未設定');
        const list = await loadClasses();
        if (!on) return;
        setClasses(list);
        const want = remembered();
        setClsState((cur) => (list.includes(cur) ? cur : list.includes(want) ? want : list[0] || ''));
        if (!list.length) setLoading(false);
      } catch (e) {
        if (on) { setErr(e?.message || '載入失敗'); setLoading(false); }
      }
    })();
    return () => { on = false; };
  }, [reload]);

  useEffect(() => {
    if (!cls) return undefined;
    let on = true;
    (async () => {
      setLoading(true);
      setErr('');
      try {
        const d = await loadClassData(cls);
        if (on) setData(d);
      } catch (e) {
        if (on) { setErr(e?.message || '載入失敗'); setData(null); }
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => { on = false; };
  }, [cls, reload]);

  const analysis = useMemo(() => (data && data.cls === cls ? analyzeClass(data, { since }) : null), [data, cls, since]);
  const setCls = (v) => { setClsState(v); remember(v); };
  return { classes, cls, setCls, analysis, loading, err, refresh: () => setReload((n) => n + 1) };
}

export function Segmented({ label, value, options, onChange }) {
  return (
    <div role="tablist" aria-label={label} style={{ display: 'inline-flex', padding: 2, borderRadius: 9, background: '#E3E3E8', flexWrap: 'wrap' }}>
      {options.map(([k, text]) => (
        <button key={k} type="button" role="tab" aria-selected={value === k} onClick={() => onChange(k)} style={{
          height: 32, padding: '0 14px', border: 0, borderRadius: 7, cursor: 'pointer', fontSize: 13, color: '#1D1D1F',
          fontWeight: value === k ? 600 : 500, background: value === k ? '#FFFFFF' : 'transparent', boxShadow: value === k ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
        }}>{text}</button>
      ))}
    </div>
  );
}

export function ClassPicker({ classes, value, onChange }) {
  if (classes.length <= 1) return classes[0] ? <span style={{ fontSize: 15, fontWeight: 600 }}>{classes[0]}</span> : null;
  if (classes.length <= 6) return <Segmented label="班別" value={value} options={classes.map((c) => [c, c])} onChange={onChange} />;
  return (
    <select aria-label="班別" value={value} onChange={(e) => onChange(e.target.value)}
      style={{ height: 34, borderRadius: 9, border: '1px solid #D2D2D7', padding: '0 10px', fontSize: 14, background: '#fff' }}>
      {classes.map((c) => <option key={c} value={c}>{c}</option>)}
    </select>
  );
}

export function StatCard({ title, value, subtitle, ring, children }) {
  return (
    <div className="qcCard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 116 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#6E6E73' }}>{title}</div>
        <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        {subtitle ? <div style={{ fontSize: 13, color: '#6E6E73', lineHeight: 1.4 }}>{subtitle}</div> : null}
      </div>
      {ring ?? children ?? null}
    </div>
  );
}

export const pctText = (v) => (v == null ? '—' : `${v}%`);

export function formatWhen(v) {
  const d = v ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-HK', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function scoreColor(p) {
  return p != null && p < 60 ? '#B8000F' : '#1D1D1F';
}
