import React, { useEffect, useMemo, useState } from 'react';
import { Flame } from 'lucide-react';
import { loadDashboardData } from '../services/dashboard.js';

// Students below this mastery are flagged (matches the Firestore bridge's 需關注學生 metric).
const FOCUS_THRESHOLD = 75;

const TINTS = ['#5E5CE6', '#0071E3', '#FF9500', '#34C759', '#AF52DE', '#FF2D55'];

function pct(value) {
  const n = parseInt(String(value ?? '').replace(/[^\d.-]/g, ''), 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
}

function Ring({ value, color = '#0071E3', size = 68, stroke = 9 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = value == null ? 0 : value / 100;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E8E8ED" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c * p} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

function StatCard({ title, value, subtitle, ring, ringColor, dot }) {
  return (
    <div className="qcCard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 116 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, color: '#6E6E73' }}>
          {dot ? <span style={{ width: 8, height: 8, borderRadius: 999, background: dot }} /> : null}
          {title}
        </div>
        <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
        {subtitle ? <div style={{ fontSize: 13, color: '#6E6E73' }}>{subtitle}</div> : null}
      </div>
      {ring !== undefined ? <Ring value={ring} color={ringColor} /> : null}
    </div>
  );
}

function profileOf(s) {
  const p = s?.studentProfile || s || {};
  const xp = Number(p.xp || 0);
  const next = Number(p.nextLevelXp || 0);
  return {
    id: s?.uid || s?.id || s?.name,
    name: s?.name || p.name || '—',
    level: p.currentLevel ?? p.level ?? null,
    xp,
    next,
    xpPct: next > 0 ? Math.round((xp / next) * 100) : null,
    streak: p.streak ?? null,
    mastery: p.mastery != null ? Number(p.mastery) : null,
    weakness: p.weaknessLabel || (Array.isArray(p.focusAreas) ? p.focusAreas.join('、') : '') || '',
  };
}

function formatDate(v) {
  if (!v) return '';
  const d = typeof v === 'string' || typeof v === 'number' ? new Date(v) : (v?.toDate ? v.toDate() : null);
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-HK', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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

  const detail = state.data?.detail || {};
  const metrics = state.data?.metrics || [];
  const byKey = (k) => metrics.find((m) => m.key === k);

  const students = useMemo(
    () => (detail.students || []).map(profileOf).sort((a, b) => (b.mastery ?? -1) - (a.mastery ?? -1)),
    [detail.students]
  );
  const focus = students.filter((s) => s.mastery != null && s.mastery < FOCUS_THRESHOLD).sort((a, b) => a.mastery - b.mastery);
  const nameById = useMemo(() => {
    const m = {};
    (detail.students || []).forEach((s) => { m[s.uid || s.id] = s.name; });
    return m;
  }, [detail.students]);
  const submissions = [...(detail.submissions || [])]
    .sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')))
    .slice(0, 5);

  const placeholder = state.loading ? '載入中…' : '無資料';
  const completion = byKey('completion') || metrics[0];
  const avg = byKey('avg') || metrics[3];
  const focusMetric = byKey('focus') || metrics[2];
  const subsMetric = byKey('submissions') || metrics[1];

  const withMastery = students.filter((s) => s.mastery != null);
  const best = withMastery[0];
  const worst = withMastery[withMastery.length - 1];

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {detail.classroom?.name ? (
        <div style={{ fontSize: 15, fontWeight: 500, color: '#6E6E73', marginTop: -4 }}>
          {detail.classroom.name}
          {students.length ? ` · ${students.length} 位學生` : ''}
        </div>
      ) : null}

      <div className="qcGrid4">
        <StatCard
          title={completion?.title || '班級完成率'}
          value={completion?.value || '—'}
          subtitle={completion && completion.subtitle !== 'Firebase 未設定' ? completion.subtitle : placeholder}
          ring={pct(completion?.value)}
        />
        <StatCard
          title={avg?.title || '平均掌握度'}
          value={avg?.value || '—'}
          subtitle={best && worst && best !== worst ? `最高 ${best.name} · 最低 ${worst.name}` : placeholder}
          ring={pct(avg?.value)}
          ringColor="#34C759"
        />
        <StatCard
          title={focusMetric?.title || '需關注學生'}
          value={focusMetric?.value || '—'}
          subtitle={focus.length ? `掌握度低於 ${FOCUS_THRESHOLD}%：${focus.map((s) => s.name).join('、')}` : placeholder}
          dot="#FF3B30"
        />
        <StatCard
          title={subsMetric?.title || '最近提交'}
          value={subsMetric?.value || '—'}
          subtitle={submissions.length ? `最新：${submissions[0].assignmentTitle || '作業'}` : placeholder}
        />
      </div>

      {state.err ? (
        <div className="qcCard" style={{ color: '#D70015', fontWeight: 500 }}>{state.err}</div>
      ) : null}

      <div className="qcGrid2">
        <section className="qcCard" aria-labelledby="dash-progress" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 }}>
            <h2 id="dash-progress" className="qcSectionTitle">學生任務進度</h2>
          </div>

          {students.length ? (
            <div role="table" aria-label="學生任務進度" style={{ display: 'flex', flexDirection: 'column' }}>
              <div role="row" style={{ display: 'grid', gridTemplateColumns: '1.3fr 1.6fr 0.8fr 0.8fr 1.3fr', gap: 12, padding: '0 4px 8px', borderBottom: '1px solid #E8E8ED', fontSize: 12, fontWeight: 500, color: '#6E6E73' }}>
                <div role="columnheader">學生</div>
                <div role="columnheader">等級與經驗值</div>
                <div role="columnheader">連續天數</div>
                <div role="columnheader">掌握度</div>
                <div role="columnheader">弱項</div>
              </div>
              {students.map((s, i) => {
                const low = s.mastery != null && s.mastery < FOCUS_THRESHOLD;
                return (
                  <div role="row" key={s.id || i} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1.6fr 0.8fr 0.8fr 1.3fr', gap: 12, alignItems: 'center', padding: '12px 4px', borderBottom: '1px solid #F0F0F3' }}>
                    <div role="cell" style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 999, background: TINTS[i % TINTS.length], color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 600, fontSize: 15, flexShrink: 0 }}>
                        {String(s.name).charAt(0)}
                      </span>
                      <span style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                    </div>
                    <div role="cell" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ fontWeight: 600 }}>{s.level != null ? `Lv ${s.level}` : '—'}</span>
                        {s.next ? <span style={{ color: '#6E6E73', fontVariantNumeric: 'tabular-nums' }}>{s.xp} / {s.next} XP</span> : null}
                      </div>
                      <div className="qcProgress"><span style={{ width: `${s.xpPct ?? 0}%` }} /></div>
                    </div>
                    <div role="cell" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 15, fontWeight: 600 }}>
                      {s.streak != null ? (<><Flame size={16} color="#FF9500" fill="#FF9500" aria-hidden="true" />{s.streak} 天</>) : '—'}
                    </div>
                    <div role="cell" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: low ? '#D70015' : '#1D1D1F' }}>
                      {s.mastery != null ? `${s.mastery}%` : '—'}
                    </div>
                    <div role="cell">{s.weakness ? <span className="qcChip">{s.weakness}</span> : null}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="qcEmpty">{state.loading ? '載入中…' : '登入並連接 Firebase 後，班上學生的等級、經驗值和掌握度會顯示在這裡。'}</div>
          )}
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section className="qcCard" aria-labelledby="dash-focus" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h2 id="dash-focus" className="qcSectionTitle" style={{ marginBottom: 6 }}>今天值得跟進</h2>
            {focus.length ? focus.map((s, i) => (
              <div key={s.id || i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i ? '1px solid #F0F0F3' : 0 }}>
                <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 999, background: '#FFE5E3', color: '#D70015', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 15, flexShrink: 0 }}>
                  {String(s.name).charAt(0)}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexGrow: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{s.name} · 掌握度 {s.mastery}%</div>
                  {s.weakness ? <div style={{ fontSize: 13, color: '#6E6E73' }}>弱項：{s.weakness}</div> : null}
                </div>
              </div>
            )) : (
              <div className="qcEmpty">{state.loading ? '載入中…' : '目前沒有需要特別跟進的學生。'}</div>
            )}
          </section>

          <section className="qcCard" aria-labelledby="dash-subs" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <h2 id="dash-subs" className="qcSectionTitle" style={{ marginBottom: 6 }}>最近提交</h2>
            {submissions.length ? submissions.map((sub, i) => {
              const score = sub.score != null ? Number(sub.score) : null;
              const who = nameById[sub.studentUid] || nameById[sub.studentId] || sub.studentName || sub.studentId || '';
              return (
                <div key={sub.id || i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 0', borderTop: i ? '1px solid #F0F0F3' : 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexGrow: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub.assignmentTitle || '作業'}</div>
                    <div style={{ fontSize: 13, color: '#6E6E73' }}>{[who, formatDate(sub.submittedAt)].filter(Boolean).join(' · ')}</div>
                  </div>
                  {score != null && Number.isFinite(score) ? (
                    <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: score < 70 ? '#D70015' : '#1D1D1F' }}>{score}</div>
                  ) : null}
                </div>
              );
            }) : (
              <div className="qcEmpty">{state.loading ? '載入中…' : '學生交作業後會顯示在這裡。'}</div>
            )}
          </section>
        </div>
      </div>

      <div style={{ fontSize: 12, color: '#86868B' }}>
        資料來源：{state.data?.mode === 'live' ? 'Firestore' : '示範模式（Firebase 未設定）'}
      </div>
    </div>
  );
}
