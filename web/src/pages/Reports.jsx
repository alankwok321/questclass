import React, { useMemo, useState } from 'react';
import { ArrowLeft, Printer, Sparkles } from 'lucide-react';
import Avatar from '../components/Avatar.jsx';
import { Ring, ScoreBars, TopicBars, TrendMark } from '../components/Charts.jsx';
import { ClassPicker, Segmented, StatCard, formatWhen, pctText, scoreColor, useClassAnalysis } from '../components/ClassStats.jsx';
import { suggestStudentComment } from '../services/api.js';
import { useToast } from '../components/Toast.jsx';

const DAY = 86400000;
const RANGES = [['7', '最近 7 天'], ['30', '最近 30 天'], ['90', '最近 90 天'], ['all', '全部']];
const COLS = 'minmax(140px,1.4fr) 0.8fr 0.6fr 0.7fr 0.8fr minmax(90px,1.1fr)';

function sinceFor(range) {
  return range === 'all' ? null : Date.now() - Number(range) * DAY;
}

// 學習報告: class report for a period (marks per homework, topic mastery, every student),
// and a one-student report with an optional AI-written comment. Printable.
export default function ReportsPage() {
  const [range, setRange] = useState('30');
  const [since, setSince] = useState(() => sinceFor('30'));
  const { classes, cls, setCls, analysis: a, loading, err } = useClassAnalysis({ since });
  const [studentUid, setStudentUid] = useState('');

  const pickRange = (r) => { setRange(r); setSince(sinceFor(r)); };
  const student = a?.students?.find((s) => s.uid === studentUid) || null;
  const rangeLabel = RANGES.find(([k]) => k === range)?.[1] || '';

  if (!loading && !err && !classes.length) {
    return <div className="qcCard qcEmpty">還沒有班別。把學生加入班別並派發作業後，就可以在這裡看學習報告。</div>;
  }

  return (
    <div style={{ display: 'grid', gap: 20 }} className="qcReport">
      <div className="qcNoPrint" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: -4 }}>
        <ClassPicker classes={classes} value={cls} onChange={(c) => { setCls(c); setStudentUid(''); }} />
        <Segmented label="期間" value={range} options={RANGES} onChange={pickRange} />
        <span style={{ flexGrow: 1 }} />
        <button type="button" className="qcBtn qcBtnSecondary qcBtnSmall" onClick={() => window.print()}>
          <Printer size={15} aria-hidden="true" /> 列印 / 存成 PDF
        </button>
      </div>

      <div className="qcPrintOnly" style={{ fontSize: 20, fontWeight: 700 }}>
        {student ? `${student.name} 的學習報告` : `${cls} 班學習報告`} · {rangeLabel}
      </div>

      {err ? <div className="qcCard" style={{ color: '#D70015', fontWeight: 500 }}>{err}</div> : null}
      {loading && !a ? <div className="qcCard qcEmpty">載入中…</div> : null}

      {a && !student ? <ClassReport a={a} onOpen={setStudentUid} /> : null}
      {a && student ? <StudentReport s={student} cls={cls} rangeLabel={rangeLabel} onBack={() => setStudentUid('')} /> : null}
    </div>
  );
}

function ClassReport({ a, onOpen }) {
  const missingTotal = a.students.reduce((t, s) => t + s.missing, 0);
  return (
    <>
      <div className="qcGrid4">
        <StatCard title="交功課率" value={pctText(a.completion)}
          subtitle={a.totals.assigned ? `已交 ${a.totals.handedIn} / 應交 ${a.totals.assigned} 份` : '這段期間沒有派發作業'}
          ring={<Ring value={a.completion} />} />
        <StatCard title="平均分" value={pctText(a.avg)} subtitle={a.avg == null ? '還沒有已批改的作業' : `${a.totals.homework} 份作業`}
          ring={<Ring value={a.avg} color="#34C759" />} />
        <StatCard title="欠交" value={`${missingTotal} 份`} subtitle={missingTotal ? `${a.students.filter((s) => s.missing).length} 位學生過了截止仍未交` : '沒有過期未交的作業'} />
        <StatCard title="需跟進學生" value={`${a.attention.length} 人`} subtitle={a.attention.length ? a.attention.slice(0, 3).map((s) => s.name).join('、') + (a.attention.length > 3 ? ' 等' : '') : '全班表現穩定'} />
      </div>

      <div className="qcGrid2">
        <section className="qcCard" aria-labelledby="rep-trend" style={{ minWidth: 0 }}>
          <h2 id="rep-trend" className="qcSectionTitle" style={{ marginBottom: 14 }}>作業成績走勢</h2>
          <ScoreBars items={a.homework} />
        </section>
        <section className="qcCard" aria-labelledby="rep-topics" style={{ minWidth: 0 }}>
          <h2 id="rep-topics" className="qcSectionTitle" style={{ marginBottom: 4 }}>課題掌握</h2>
          <div style={{ fontSize: 12, color: '#6E6E73', marginBottom: 14 }}>全班在每個課題的答對率，最弱的排最前。</div>
          <TopicBars items={a.topics} />
        </section>
      </div>

      <section className="qcCard" aria-labelledby="rep-students" style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, paddingBottom: 8, flexWrap: 'wrap' }}>
          <h2 id="rep-students" className="qcSectionTitle">學生表現</h2>
          <span className="qcNoPrint" style={{ fontSize: 12, color: '#6E6E73' }}>按學生看個人報告</span>
        </div>
        {a.students.length ? (
          <div style={{ overflowX: 'auto' }}>
            <div role="table" aria-label="學生表現" style={{ display: 'flex', flexDirection: 'column', minWidth: 620 }}>
              <div role="row" style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, padding: '0 4px 8px', borderBottom: '1px solid #E8E8ED', fontSize: 12, fontWeight: 500, color: '#6E6E73' }}>
                <div role="columnheader">學生</div><div role="columnheader">已交</div><div role="columnheader">欠交</div>
                <div role="columnheader">平均分</div><div role="columnheader">走勢</div><div role="columnheader">弱項</div>
              </div>
              {a.students.map((s) => (
                <button key={s.uid} type="button" role="row" onClick={() => onOpen(s.uid)} style={{
                  display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center', padding: '11px 4px', border: 0, borderBottom: '1px solid #F0F0F3',
                  background: 'transparent', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit',
                }}>
                  <span role="cell" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <Avatar photoURL={s.photoURL} name={s.name} size={32} />
                    <span style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                  </span>
                  <span role="cell" style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{s.done} / {s.assigned}</span>
                  <span role="cell" style={{ fontSize: 14, fontVariantNumeric: 'tabular-nums', color: s.missing ? '#B8000F' : '#86868B', fontWeight: s.missing ? 600 : 400 }}>{s.missing || '—'}</span>
                  <span role="cell" style={{ fontSize: 17, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: scoreColor(s.avg) }}>{pctText(s.avg)}</span>
                  <span role="cell" style={{ fontSize: 13 }}><TrendMark trend={s.trend} /></span>
                  <span role="cell">{s.weakest ? <span className="qcChip">{s.weakest.topic}</span> : <span style={{ color: '#86868B' }}>—</span>}</span>
                </button>
              ))}
            </div>
          </div>
        ) : <div className="qcEmpty">這個班別還沒有學生。</div>}
      </section>

      <section className="qcCard" aria-labelledby="rep-hw" style={{ minWidth: 0 }}>
        <h2 id="rep-hw" className="qcSectionTitle" style={{ marginBottom: 8 }}>作業一覽</h2>
        {a.homework.length ? [...a.homework].reverse().map((h, i) => (
          <div key={h.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', gap: 16, alignItems: 'center', padding: '10px 0', borderTop: i ? '1px solid #F0F0F3' : 0 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.title}</div>
              <div style={{ fontSize: 12, color: '#6E6E73' }}>{h.dueAt ? `截止 ${formatWhen(h.dueAt)}` : '沒有截止日期'}{h.overdue ? ' · 已截止' : ''}</div>
            </div>
            <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: h.handedIn < h.assigned && h.overdue ? '#B8000F' : '#1D1D1F' }}>已交 {h.handedIn}/{h.assigned}</div>
            <div style={{ fontSize: 17, fontWeight: 700, minWidth: 52, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: scoreColor(h.avg) }}>{pctText(h.avg)}</div>
          </div>
        )) : <div className="qcEmpty">這段期間沒有派發作業。</div>}
      </section>
    </>
  );
}

function summaryFor(s, cls, rangeLabel) {
  const hw = s.perHomework.map((h) => `- ${h.title}：${h.handedIn ? (h.pct == null ? '已交，未批改' : `${Math.round(h.pct)}%`) : h.overdue ? '欠交' : '未交（未截止）'}`);
  const topics = s.topics.map((t) => `${t.topic} ${t.pct}%（${t.questions} 題）`);
  return [
    `學生：${s.name}（${cls} 班）`, `期間：${rangeLabel}`,
    `已交 ${s.done}/${s.assigned} 份，欠交 ${s.missing} 份，平均分 ${s.avg == null ? '未有' : `${s.avg}%`}`,
    `走勢：${s.trend == null ? '資料不足' : s.trend > 0 ? '進步' : s.trend < 0 ? '退步' : '穩定'}`,
    `各課題答對率：${topics.join('、') || '未有'}`, '各份作業：', ...hw,
  ].join('\n');
}

function StudentReport({ s, cls, rangeLabel, onBack }) {
  const toast = useToast();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const bars = useMemo(() => s.perHomework.map((h) => ({ ...h, avg: h.pct == null ? null : Math.round(h.pct), assigned: 1, handedIn: h.handedIn ? 1 : 0 })), [s]);

  const writeComment = async () => {
    setBusy(true);
    try {
      setComment(await suggestStudentComment(summaryFor(s, cls, rangeLabel)));
    } catch (e) {
      toast?.show?.(e?.message || 'AI 評語失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button type="button" className="qcBtn qcBtnSecondary qcBtnSmall qcNoPrint" onClick={onBack}><ArrowLeft size={15} aria-hidden="true" /> 全班</button>
        <Avatar photoURL={s.photoURL} name={s.name} size={44} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{s.name}</div>
          <div style={{ fontSize: 13, color: '#6E6E73' }}>{cls} · {rangeLabel}{s.lastSubmittedAt ? ` · 最近提交 ${formatWhen(s.lastSubmittedAt)}` : ''}</div>
        </div>
      </div>

      <div className="qcGrid4">
        <StatCard title="已交作業" value={`${s.done} / ${s.assigned}`} ring={<Ring value={s.assigned ? Math.round((s.done / s.assigned) * 100) : null} />} />
        <StatCard title="平均分" value={pctText(s.avg)} subtitle={s.marked ? `${s.marked} 份已批改` : '還沒有已批改的作業'} ring={<Ring value={s.avg} color="#34C759" />} />
        <StatCard title="欠交" value={`${s.missing} 份`} subtitle={s.missing ? '已過截止仍未交' : '沒有欠交'} />
        <StatCard title="走勢" value={<span style={{ fontSize: 24 }}><TrendMark trend={s.trend} /></span>} subtitle={s.trend == null ? '批改 4 份或以上作業後顯示' : '最近 3 份對比之前'} />
      </div>

      <div className="qcGrid2">
        <section className="qcCard" style={{ minWidth: 0 }} aria-labelledby="st-trend">
          <h2 id="st-trend" className="qcSectionTitle" style={{ marginBottom: 14 }}>每份作業分數</h2>
          <ScoreBars items={bars} />
        </section>
        <section className="qcCard" style={{ minWidth: 0 }} aria-labelledby="st-topics">
          <h2 id="st-topics" className="qcSectionTitle" style={{ marginBottom: 14 }}>課題掌握</h2>
          <TopicBars items={s.topics} />
        </section>
      </div>

      <section className="qcCard" aria-labelledby="st-hw">
        <h2 id="st-hw" className="qcSectionTitle" style={{ marginBottom: 8 }}>作業紀錄</h2>
        {s.perHomework.length ? [...s.perHomework].reverse().map((h, i) => (
          <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i ? '1px solid #F0F0F3' : 0 }}>
            <div style={{ flexGrow: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{h.title}</div>
              <div style={{ fontSize: 12, color: '#6E6E73' }}>{h.dueAt ? `截止 ${formatWhen(h.dueAt)}` : '沒有截止日期'}</div>
            </div>
            {h.handedIn ? (
              <span style={{ fontSize: 17, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: scoreColor(h.pct) }}>{h.pct == null ? '未批改' : `${Math.round(h.pct)}%`}</span>
            ) : (
              <span style={{ fontSize: 13, fontWeight: 600, color: h.overdue ? '#B8000F' : '#6E6E73' }}>{h.overdue ? '欠交' : '未交'}</span>
            )}
          </div>
        )) : <div className="qcEmpty">這段期間沒有派給這位學生的作業。</div>}
      </section>

      <section className="qcCard" aria-labelledby="st-comment" style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <h2 id="st-comment" className="qcSectionTitle">老師評語</h2>
          <button type="button" className="qcBtn qcBtnTinted qcBtnSmall qcNoPrint" onClick={writeComment} disabled={busy || !s.assigned}>
            <Sparkles size={15} aria-hidden="true" /> {busy ? '撰寫中…' : comment ? '重新撰寫' : 'AI 撰寫評語'}
          </button>
        </div>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} placeholder="自己寫評語，或按「AI 撰寫評語」根據以上數據起草，再自行修改。"
          style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #D2D2D7', borderRadius: 10, padding: 12, fontSize: 15, lineHeight: 1.6, fontFamily: 'inherit', resize: 'vertical' }} />
      </section>
    </>
  );
}
