import React, { useMemo, useState } from 'react';
import Avatar from '../../components/Avatar.jsx';
import { ClassPicker, useClassAnalysis } from '../../components/ClassStats.jsx';
import { aiJson } from '../../services/api.js';
import { AiButton, ErrorNote, List, ResultActions, SubTitle, asList, useBusy } from './ui.jsx';

const WEAK = 60;
const SYSTEM = '你是香港小學／中學的資深老師。根據全班作業數據，為一個學生答錯較多的課題設計 15 分鐘的「重教」環節，用繁體中文（香港用語）。'
  + '要針對常見錯誤，用新的講解方法（例如具體例子、圖像、操作），並附幾條檢查理解的題目及答案。'
  + '只輸出 JSON：{"focus":"","likelyMistakes":[""],"explain":[""],"activity":"","checkQuestions":[{"q":"","a":""}],"followUp":""}';

function toText(topic, r) {
  return [
    `重教：${topic}`, r.focus || '', '', '可能的錯誤：', ...asList(r.likelyMistakes).map((x) => `- ${x}`),
    '', '講解步驟：', ...asList(r.explain).map((x, i) => `${i + 1}. ${x}`),
    '', `活動：${r.activity || ''}`, '', '檢查理解：', ...(r.checkQuestions || []).map((c, i) => `${i + 1}. ${c.q}（答案：${c.a}）`),
    '', `跟進：${r.followUp || ''}`,
  ].join('\n');
}

// 針對弱項重教: which topics the class gets wrong, who needs help on each, and an AI re-teach plan.
export default function Reteach() {
  const { classes, cls, setCls, analysis: a, loading, err: loadErr } = useClassAnalysis();
  const [topic, setTopic] = useState('');
  const [plan, setPlan] = useState(null);
  const { busy, err, run } = useBusy();

  const topics = useMemo(() => (a?.topics || []).filter((t) => t.topic !== '其他' || (a?.topics || []).length === 1), [a]);
  const studentsFor = (tp) => (a?.students || [])
    .map((s) => ({ s, t: s.topics.find((x) => x.topic === tp) }))
    .filter((x) => x.t && x.t.pct < WEAK)
    .sort((x, y) => x.t.pct - y.t.pct);
  const chosen = topic || topics[0]?.topic || '';
  const weakStudents = chosen ? studentsFor(chosen) : [];

  const go = () => run(async () => {
    const t = topics.find((x) => x.topic === chosen);
    const data = await aiJson({ tool: 'reteach', system: SYSTEM,
      message: `班別：${cls}\n課題：${chosen}\n全班答對率：${t?.pct ?? '?'}%（${t?.questions ?? 0} 題次）\n答對率低於 ${WEAK}% 的學生：${weakStudents.length} 人（全班 ${a?.students?.length || 0} 人）` });
    setPlan({ topic: chosen, ...data });
  });

  if (!loading && !classes.length) return <div className="qcCard qcEmpty">還沒有班別。把學生加入班別並派發作業後就可以使用。</div>;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="qcCard qcNoPrint" style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <ClassPicker classes={classes} value={cls} onChange={(c) => { setCls(c); setTopic(''); setPlan(null); }} />
          <span style={{ fontSize: 13, color: '#6E6E73' }}>根據已批改作業，答對率最低的課題排最前</span>
        </div>
        <ErrorNote text={loadErr} />
        {loading ? <div className="qcEmpty">載入中…</div> : !topics.length ? (
          <div className="qcEmpty">還沒有足夠資料。派發題目有「課題」的作業並批改後，這裡會列出全班的弱項。</div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {topics.slice(0, 12).map((t) => {
              const on = t.topic === chosen;
              return (
                <button key={t.topic} type="button" aria-pressed={on} onClick={() => { setTopic(t.topic); setPlan(null); }} style={{
                  border: `1px solid ${on ? '#0071E3' : '#D2D2D7'}`, background: on ? '#EEF5FF' : '#fff', borderRadius: 12, padding: '8px 12px',
                  cursor: 'pointer', textAlign: 'left', font: 'inherit', color: '#1D1D1F',
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{t.topic}</div>
                  <div style={{ fontSize: 12, color: t.pct < WEAK ? '#B8000F' : '#6E6E73', fontWeight: 600 }}>答對率 {t.pct}%</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {chosen && topics.length ? (
        <div className="qcCard" style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>「{chosen}」需要幫助的學生（答對率低於 {WEAK}%）</div>
          {weakStudents.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {weakStudents.map(({ s, t }) => (
                <div key={s.uid} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px 6px 6px', background: '#FAFAFC', borderRadius: 999 }}>
                  <Avatar photoURL={s.photoURL} name={s.name} size={28} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</span>
                  <span style={{ fontSize: 13, color: '#B8000F', fontVariantNumeric: 'tabular-nums' }}>{t.pct}%</span>
                </div>
              ))}
            </div>
          ) : <div className="qcEmpty">沒有學生低於 {WEAK}%。</div>}
          <div className="qcNoPrint" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
            <AiButton busy={busy} onClick={go}>{plan?.topic === chosen ? '重新設計重教環節' : '設計重教環節'}</AiButton>
            <ErrorNote text={err} />
          </div>
        </div>
      ) : null}

      {plan && plan.topic === chosen ? (
        <div className="qcCard" style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>重教：{plan.topic}</div>
            <ResultActions text={toText(plan.topic, plan)} print />
          </div>
          {plan.focus ? <div style={{ fontSize: 15 }}>{plan.focus}</div> : null}
          <SubTitle>學生可能的錯誤</SubTitle><List items={asList(plan.likelyMistakes)} />
          <SubTitle>講解步驟</SubTitle><List items={asList(plan.explain)} ordered />
          {plan.activity ? (<><SubTitle>活動</SubTitle><div style={{ fontSize: 15, lineHeight: 1.6 }}>{plan.activity}</div></>) : null}
          <SubTitle>檢查理解</SubTitle>
          <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7, fontSize: 15 }}>
            {(plan.checkQuestions || []).map((c, i) => <li key={i}>{c.q} <span style={{ color: '#1E7B34' }}>（答案：{c.a}）</span></li>)}
          </ol>
          {plan.followUp ? (<><SubTitle>跟進</SubTitle><div style={{ fontSize: 15 }}>{plan.followUp}</div></>) : null}
        </div>
      ) : null}
    </div>
  );
}
