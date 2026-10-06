import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import Avatar from '../components/Avatar.jsx';
import { DayBars, Ring } from '../components/Charts.jsx';
import { Segmented, StatCard } from '../components/ClassStats.jsx';
import { getLoginStats } from '../services/api.js';

// 分析: who signs in to QuestClass, and how often (one record per person per Hong Kong day).
const ROLE = { student: '學生', teacher: '老師', parent: '家長', admin: '管理員' };
const DAY = 86400000;
const INACTIVE_DAYS = 7;

function ago(iso) {
  const t = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(t)) return null;
  const d = Math.floor((Date.now() - t) / DAY);
  if (d <= 0) {
    const h = Math.floor((Date.now() - t) / 3600000);
    return h <= 0 ? '剛剛' : `${h} 小時前`;
  }
  return d === 1 ? '昨天' : `${d} 日前`;
}
const daysSince = (iso) => { const t = iso ? new Date(iso).getTime() : NaN; return Number.isFinite(t) ? (Date.now() - t) / DAY : Infinity; };

export default function AnalyticsPage() {
  const [range, setRange] = useState('30');
  const [role, setRole] = useState('all');
  const [cls, setCls] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('quiet');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      setData(await getLoginStats(Number(range)));
    } catch (e) {
      setErr(e?.message || '載入失敗');
    } finally {
      setLoading(false);
    }
  }, [range]);
  useEffect(() => { load(); }, [load]);

  const people = useMemo(() => (data?.people || []).filter((p) => p.accountStatus !== 'suspended'), [data]);
  const classes = useMemo(() => [...new Set(people.filter((p) => p.role === 'student' && p.class).map((p) => p.class))]
    .sort((a, b) => a.localeCompare(b, 'zh-Hant', { numeric: true })), [people]);
  const inScope = people.filter((p) => (role === 'all' || p.role === role) && (!cls || (p.role === 'student' && p.class === cls)));

  const days = data?.days || [];
  const series = days.map((d) => {
    // Per-day counts by role come from the server; a class filter needs the per-person view, so
    // with a class picked the chart counts the people of that class from their totals.
    const value = role === 'all' ? d.total : (d[role] || 0);
    return { day: d.day, value };
  });
  const hkDay = (iso) => new Date(new Date(iso).getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const todayCount = inScope.filter((p) => p.lastLoginAt && hkDay(p.lastLoginAt) === data?.today).length;
  const active7 = inScope.filter((p) => daysSince(p.lastLoginAt) < 7).length;
  // Daily records started on 6 Oct 2026; before that only the last sign-in time is known.
  const activePeriod = inScope.filter((p) => p.daysActive > 0 || daysSince(p.lastLoginAt) < Number(range)).length;
  const never = inScope.filter((p) => !p.lastLoginAt).length;
  const quietStudents = inScope.filter((p) => p.role === 'student' && daysSince(p.lastLoginAt) >= INACTIVE_DAYS);
  const avgDaily = days.length && !cls ? Math.round((series.reduce((t, d) => t + d.value, 0) / days.length) * 10) / 10 : null;
  const pct = (n) => (inScope.length ? Math.round((n / inScope.length) * 100) : null);

  const classRows = classes.map((c) => {
    const kids = people.filter((p) => p.role === 'student' && p.class === c);
    const a7 = kids.filter((p) => daysSince(p.lastLoginAt) < 7).length;
    const days = kids.reduce((t, p) => t + p.daysActive, 0);
    return { c, n: kids.length, a7, rate: kids.length ? Math.round((a7 / kids.length) * 100) : 0, avgDays: kids.length ? Math.round((days / kids.length) * 10) / 10 : 0 };
  });

  const list = inScope
    .filter((p) => !q || `${p.name} ${p.email} ${p.class}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (sort === 'quiet'
      ? daysSince(b.lastLoginAt) - daysSince(a.lastLoginAt) || a.daysActive - b.daysActive
      : sort === 'active' ? b.daysActive - a.daysActive || b.visits - a.visits
        : String(a.name).localeCompare(String(b.name), 'zh-Hant')));

  const select = { height: 34, borderRadius: 9, border: '1px solid #D2D2D7', padding: '0 10px', fontSize: 14, background: '#fff' };
  const rangeLabel = { 7: '最近 7 日', 30: '最近 30 日', 90: '最近 90 日' }[range];

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: -4 }}>
        <Segmented label="期間" value={range} onChange={setRange} options={[['7', '7 日'], ['30', '30 日'], ['90', '90 日']]} />
        <Segmented label="身分" value={role} onChange={(r) => { setRole(r); if (r !== 'student' && r !== 'all') setCls(''); }}
          options={[['all', '全部'], ['student', '學生'], ['teacher', '老師'], ['parent', '家長']]} />
        {classes.length && (role === 'all' || role === 'student') ? (
          <select aria-label="班別" value={cls} onChange={(e) => { setCls(e.target.value); if (e.target.value) setRole('student'); }} style={select}>
            <option value="">全部班別</option>
            {classes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        ) : null}
        <span style={{ flexGrow: 1 }} />
        <button type="button" className="qcBtn qcBtnSecondary qcBtnSmall" onClick={load} disabled={loading}><RefreshCw size={14} aria-hidden="true" /> 重新整理</button>
      </div>

      {err ? <div className="qcCard" style={{ color: '#D70015', fontWeight: 500 }}>{err}</div> : null}

      <div className="qcGrid4">
        <StatCard title="今日登入" value={loading && !data ? '—' : `${todayCount} 人`}
          subtitle={`共 ${inScope.length} 個帳戶`} />
        <StatCard title="最近 7 日活躍" value={`${active7} 人`} subtitle={pct(active7) != null ? `佔 ${pct(active7)}%` : ''} ring={<Ring value={pct(active7)} />} />
        <StatCard title={`${rangeLabel}曾登入`} value={`${activePeriod} 人`} subtitle={avgDaily != null ? `平均每日 ${avgDaily} 人` : ''} ring={<Ring value={pct(activePeriod)} color="#34C759" />} />
        <StatCard title={`${INACTIVE_DAYS} 日或以上未登入的學生`} value={`${quietStudents.length} 人`}
          subtitle={never ? `其中 ${never} 人從未登入` : quietStudents.slice(0, 3).map((p) => p.name).join('、')} />
      </div>

      {!cls ? (
        <section className="qcCard" aria-labelledby="an-daily">
          <h2 id="an-daily" className="qcSectionTitle" style={{ marginBottom: 4 }}>每日登入人數</h2>
          <div style={{ fontSize: 12, color: '#6E6E73', marginBottom: 14 }}>{role === 'all' ? '所有身分' : ROLE[role]} · {rangeLabel} · 每人每日最多計一次</div>
          {days.length ? <DayBars items={series} /> : <div className="qcEmpty">{loading ? '載入中…' : '未有紀錄'}</div>}
        </section>
      ) : null}

      {classRows.length && (role === 'all' || role === 'student') && !cls ? (
        <section className="qcCard" aria-labelledby="an-class">
          <h2 id="an-class" className="qcSectionTitle" style={{ marginBottom: 10 }}>各班學生登入</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {classRows.map((r) => (
              <button key={r.c} type="button" onClick={() => { setCls(r.c); setRole('student'); }} style={{
                display: 'grid', gridTemplateColumns: '60px minmax(0,1fr) 150px', gap: 12, alignItems: 'center', border: 0, background: 'transparent', padding: 0, cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit',
              }}>
                <span style={{ fontWeight: 700 }}>{r.c}</span>
                <span style={{ position: 'relative', height: 10, borderRadius: 999, background: '#F0F0F3' }}>
                  <span style={{ position: 'absolute', inset: 0, width: `${Math.max(2, r.rate)}%`, borderRadius: 999, background: '#0071E3' }} />
                </span>
                <span style={{ fontSize: 13, color: '#3A3A3C', fontVariantNumeric: 'tabular-nums' }}>7 日內 {r.a7}/{r.n} 人 · {r.rate}%</span>
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: '#6E6E73', marginTop: 10 }}>按班別看該班每位學生。</div>
        </section>
      ) : null}

      <section className="qcCard" aria-labelledby="an-people" style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <h2 id="an-people" className="qcSectionTitle">{cls ? `${cls} 班學生` : '每個帳戶'}</h2>
          {cls ? <button type="button" className="qcBtn qcBtnSecondary qcBtnSmall" onClick={() => setCls('')}>顯示全部</button> : null}
          <span style={{ flexGrow: 1 }} />
          <div style={{ position: 'relative' }}>
            <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: 9, top: 10, color: '#86868B' }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋姓名／電郵" aria-label="搜尋" style={{ ...select, paddingLeft: 28, width: 180 }} />
          </div>
          <select aria-label="排序" value={sort} onChange={(e) => setSort(e.target.value)} style={select}>
            <option value="quiet">最久未登入排前</option>
            <option value="active">最活躍排前</option>
            <option value="name">按姓名</option>
          </select>
        </div>
        {list.length ? (
          <div style={{ overflowX: 'auto' }}>
            <div role="table" aria-label="登入紀錄" style={{ minWidth: 620 }}>
              <div role="row" style={{ display: 'grid', gridTemplateColumns: 'minmax(160px,1.6fr) 70px 70px minmax(110px,1fr) 90px 80px', gap: 10, padding: '0 4px 8px', borderBottom: '1px solid #E8E8ED', fontSize: 12, fontWeight: 500, color: '#6E6E73' }}>
                <div role="columnheader">帳戶</div><div role="columnheader">身分</div><div role="columnheader">班別</div>
                <div role="columnheader">最後登入</div><div role="columnheader">登入日數</div><div role="columnheader">次數</div>
              </div>
              {list.map((p) => {
                const quiet = p.role === 'student' && daysSince(p.lastLoginAt) >= INACTIVE_DAYS;
                return (
                  <div role="row" key={p.uid} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px,1.6fr) 70px 70px minmax(110px,1fr) 90px 80px', gap: 10, alignItems: 'center', padding: '10px 4px', borderBottom: '1px solid #F0F0F3' }}>
                    <div role="cell" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <Avatar photoURL={p.photoURL} name={p.name} size={30} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                        <div style={{ fontSize: 12, color: '#86868B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</div>
                      </div>
                    </div>
                    <div role="cell" style={{ fontSize: 13 }}>{ROLE[p.role] || p.role}</div>
                    <div role="cell" style={{ fontSize: 13 }}>{p.class || '—'}</div>
                    <div role="cell" style={{ fontSize: 13, color: quiet ? '#B8000F' : '#1D1D1F', fontWeight: quiet ? 600 : 400 }}
                      title={p.lastLoginAt ? new Date(p.lastLoginAt).toLocaleString('zh-HK') : ''}>
                      {p.lastLoginAt ? ago(p.lastLoginAt) : '從未登入'}
                    </div>
                    <div role="cell" style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{p.daysActive} / {range}</div>
                    <div role="cell" style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{p.visits}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : <div className="qcEmpty">{loading ? '載入中…' : '沒有符合的帳戶。'}</div>}
        <div style={{ fontSize: 12, color: '#86868B', marginTop: 10, lineHeight: 1.5 }}>
          「登入日數」是期內有登入的日數；「次數」把 30 分鐘內重複開啟計作一次。每日登入紀錄由 2026 年 10 月 6 日開始收集，之前只有「最後登入」時間。
        </div>
      </section>
    </div>
  );
}
