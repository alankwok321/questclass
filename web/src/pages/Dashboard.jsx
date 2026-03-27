import React, { useEffect, useState } from 'react';
import { loadDashboardData } from '../services/dashboard.js';

function StatCard({ title, value, subtitle, tone }) {
  const tones = {
    green: { bg: 'rgba(52,199,89,0.10)', fg: '#34C759' },
    orange: { bg: 'rgba(255,149,0,0.10)', fg: '#FF9500' },
    red: { bg: 'rgba(255,59,48,0.10)', fg: '#FF3B30' },
    blue: { bg: 'rgba(0,122,255,0.10)', fg: '#007AFF' },
  };
  const t = tones[tone] || tones.blue;

  return (
    <div className="qcCard qcCardSoft" style={{ height: 160, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ width: 42, height: 42, borderRadius: 999, display: 'grid', placeItems: 'center', background: t.bg, color: t.fg, fontWeight: 900 }}>
          ↗
        </div>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#6B7280', marginBottom: 6 }}>{title}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontSize: 30, fontWeight: 900, color: '#111827', letterSpacing: '-0.02em' }}>{value}</div>
          {subtitle ? <div style={{ fontSize: 13, fontWeight: 700, color: '#9CA3AF' }}>{subtitle}</div> : null}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [state, setState] = useState({ loading: true, err: '', data: null });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await loadDashboardData();
        if (!mounted) return;
        if (!res?.ok) {
          setState({ loading: false, err: res?.error || '載入失敗', data: null });
          return;
        }
        setState({ loading: false, err: '', data: res });
      } catch (e) {
        if (!mounted) return;
        setState({ loading: false, err: e?.message || '載入失敗', data: null });
      }
    })();
    return () => { mounted = false; };
  }, []);

  const metrics = state.data?.metrics || [];
  const detail = state.data?.detail || {};

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div className="qcGrid4">
        {(metrics.length ? metrics : [
          { title: '班級完成率', value: '—', subtitle: state.loading ? '載入中…' : '無資料', tone: 'blue' },
          { title: '最近提交', value: '—', subtitle: state.loading ? '載入中…' : '無資料', tone: 'orange' },
          { title: '需關注學生', value: '—', subtitle: state.loading ? '載入中…' : '無資料', tone: 'red' },
          { title: '平均掌握度', value: '—', subtitle: state.loading ? '載入中…' : '無資料', tone: 'blue' },
        ]).map((m) => (
          <StatCard key={m.key || m.title} title={m.title} value={m.value} subtitle={m.subtitle} tone={m.tone} />
        ))}
      </div>

      <div className="qcCard" style={{ padding: 24, borderRadius: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Dashboard 狀態</div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ border: 0, background: 'transparent', color: '#007AFF', fontWeight: 900, fontSize: 13, cursor: 'pointer' }}
          >
            重新整理
          </button>
        </div>

        {state.err ? (
          <div style={{ color: '#B91C1C', fontWeight: 900 }}>{state.err}</div>
        ) : (
          <div style={{ color: '#6B7280', fontWeight: 700, lineHeight: 1.7 }}>
            mode: <strong style={{ color: '#111827' }}>{state.data?.mode || '—'}</strong> · students: <strong style={{ color: '#111827' }}>{(detail.students || []).length}</strong> · submissions: <strong style={{ color: '#111827' }}>{(detail.submissions || []).length}</strong>
          </div>
        )}
      </div>
    </div>
  );
}
