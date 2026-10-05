import React from 'react';
import { Link } from 'react-router-dom';
import Avatar from '../components/Avatar.jsx';
import { Ring, ScoreBars, TrendMark } from '../components/Charts.jsx';
import { ClassPicker, StatCard, formatWhen, pctText, scoreColor, useClassAnalysis } from '../components/ClassStats.jsx';
import { ATTENTION_PCT } from '../services/analytics.js';

const TINTS = ['#5E5CE6', '#0071E3', '#FF9500', '#34C759', '#AF52DE', '#FF2D55'];
const COLS = 'minmax(140px,1.4fr) minmax(120px,1.3fr) 0.7fr 0.8fr minmax(90px,1.1fr)';

// 儀表板: real numbers for one class — hand-in rate, average mark, who needs follow-up,
// recent hand-ins — all computed from published homework and marked submissions.
export default function Dashboard() {
  const { classes, cls, setCls, analysis: a, loading, err } = useClassAnalysis();
  const empty = loading ? '載入中…' : null;

  if (!loading && !err && !classes.length) {
    return (
      <div className="qcCard qcEmpty" style={{ lineHeight: 1.6 }}>
        還沒有班別。先到 <Link className="qcLink" to="/classroom">班級管理</Link> 把學生加入班別，派發作業後這裡就會顯示真實數據。
      </div>
    );
  }

  const latest = a?.recent?.[0];
  const best = a?.students?.find((s) => s.avg != null);
  const marked = (a?.students || []).filter((s) => s.avg != null);
  const worst = marked[marked.length - 1];

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: -4 }}>
        <ClassPicker classes={classes} value={cls} onChange={setCls} />
        {a ? <span style={{ fontSize: 14, color: '#6E6E73' }}>{a.totals.students} 位學生 · {a.totals.homework} 份已派發作業</span> : null}
      </div>

      {err ? <div className="qcCard" style={{ color: '#D70015', fontWeight: 500 }}>{err}</div> : null}

      <div className="qcGrid4">
        <StatCard title="交功課率" value={a ? pctText(a.completion) : '—'}
          subtitle={empty || (a.totals.assigned ? `已交 ${a.totals.handedIn} / 應交 ${a.totals.assigned} 份` : '還沒有派發作業')}
          ring={<Ring value={a?.completion} />} />
        <StatCard title="平均分" value={a ? pctText(a.avg) : '—'}
          subtitle={empty || (best && worst && best !== worst ? `最高 ${best.name} ${best.avg}% · 最低 ${worst.name} ${worst.avg}%` : a.avg == null ? '還沒有已批改的作業' : '')}
          ring={<Ring value={a?.avg} color="#34C759" />} />
        <StatCard title="需跟進學生" value={a ? `${a.attention.length} 人` : '—'}
          subtitle={empty || (a.attention.length ? a.attention.slice(0, 3).map((s) => s.name).join('、') + (a.attention.length > 3 ? ' 等' : '') : `沒有欠交，平均都不低於 ${ATTENTION_PCT}%`)} />
        <StatCard title="近 7 天提交" value={a ? `${a.recent.length} 份` : '—'}
          subtitle={empty || (latest ? `最新：${latest.student?.name || ''} · ${latest.assignmentTitle || '作業'}` : '這星期還沒有人交作業')} />
      </div>

      <div className="qcGrid2">
        <section className="qcCard" aria-labelledby="dash-progress" style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 8 }}>
            <h2 id="dash-progress" className="qcSectionTitle">學生進度</h2>
            <Link className="qcLink" to="/reports" style={{ fontSize: 13 }}>完整學習報告 →</Link>
          </div>
          {a?.students?.length ? (
            <div style={{ overflowX: 'auto' }}>
              <div role="table" aria-label="學生進度" style={{ display: 'flex', flexDirection: 'column', minWidth: 560 }}>
                <div role="row" style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, padding: '0 4px 8px', borderBottom: '1px solid #E8E8ED', fontSize: 12, fontWeight: 500, color: '#6E6E73' }}>
                  <div role="columnheader">學生</div>
                  <div role="columnheader">已交作業</div>
                  <div role="columnheader">平均分</div>
                  <div role="columnheader">走勢</div>
                  <div role="columnheader">弱項</div>
                </div>
                {a.students.map((s, i) => (
                  <div role="row" key={s.uid} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center', padding: '12px 4px', borderBottom: '1px solid #F0F0F3' }}>
                    <div role="cell" style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      <Avatar photoURL={s.photoURL} name={s.name} size={36} tint={TINTS[i % TINTS.length]} />
                      <span style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                    </div>
                    <div role="cell" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                        {s.done} / {s.assigned}
                        {s.missing ? <span style={{ color: '#B8000F', fontWeight: 600 }}> · 欠交 {s.missing}</span> : null}
                      </div>
                      <div className="qcProgress"><span style={{ width: `${s.assigned ? Math.round((s.done / s.assigned) * 100) : 0}%` }} /></div>
                    </div>
                    <div role="cell" style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: scoreColor(s.avg) }}>{pctText(s.avg)}</div>
                    <div role="cell" style={{ fontSize: 13 }}><TrendMark trend={s.trend} /></div>
                    <div role="cell">{s.weakest ? <span className="qcChip" title={`答對率 ${s.weakest.pct}%`}>{s.weakest.topic}</span> : <span style={{ color: '#86868B' }}>—</span>}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="qcEmpty">{empty || '這個班別還沒有學生。'}</div>
          )}
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <section className="qcCard" aria-labelledby="dash-focus" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h2 id="dash-focus" className="qcSectionTitle" style={{ marginBottom: 6 }}>今天值得跟進</h2>
            {a?.attention?.length ? a.attention.slice(0, 6).map((s, i) => (
              <div key={s.uid} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i ? '1px solid #F0F0F3' : 0 }}>
                <Avatar photoURL={s.photoURL} name={s.name} size={36} tint="#FFE5E3" color="#D70015" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{s.name}</div>
                  <div style={{ fontSize: 13, color: '#6E6E73' }}>{[...s.reasons, s.weakest ? `弱項：${s.weakest.topic}` : ''].filter(Boolean).join(' · ')}</div>
                </div>
              </div>
            )) : (
              <div className="qcEmpty">{empty || '目前沒有需要特別跟進的學生。'}</div>
            )}
          </section>

          <section className="qcCard" aria-labelledby="dash-subs" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <h2 id="dash-subs" className="qcSectionTitle" style={{ marginBottom: 6 }}>最近提交</h2>
            {a?.recent?.length ? a.recent.slice(0, 6).map((sub, i) => (
              <div key={`${sub.assignmentId}|${sub.studentUid}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i ? '1px solid #F0F0F3' : 0 }}>
                <Avatar photoURL={sub.student?.photoURL || sub.studentPhotoURL} name={sub.student?.name || sub.studentName} size={32} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexGrow: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub.assignmentTitle || '作業'}</div>
                  <div style={{ fontSize: 13, color: '#6E6E73' }}>{[sub.student?.name || sub.studentName, formatWhen(sub.submittedAt)].filter(Boolean).join(' · ')}</div>
                </div>
                {sub.score != null ? (
                  <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: scoreColor(sub.pct) }}>{sub.score}<span style={{ fontSize: 13, color: '#6E6E73', fontWeight: 500 }}> / {sub.maxScore}</span></div>
                    {sub.pendingReview ? <div style={{ fontSize: 11, color: '#6E6E73' }}>待老師覆核</div> : null}
                  </div>
                ) : <span style={{ fontSize: 13, color: '#6E6E73' }}>未批改</span>}
              </div>
            )) : (
              <div className="qcEmpty">{empty || '最近 7 天沒有新提交。'}</div>
            )}
          </section>
        </div>
      </div>

      <section className="qcCard" aria-labelledby="dash-trend">
        <h2 id="dash-trend" className="qcSectionTitle" style={{ marginBottom: 14 }}>作業平均分</h2>
        {a ? <ScoreBars items={a.homework.slice(-12)} /> : <div className="qcEmpty">{empty || '—'}</div>}
      </section>
    </div>
  );
}
