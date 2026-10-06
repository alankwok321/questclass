import React, { useState } from 'react';
import { aiJson } from '../../services/api.js';
import { AiButton, ErrorNote, Field, LEVELS, List, ResultActions, Row, SUBJECTS, Select, SubTitle, areaStyle, asList, inputStyle, useBusy } from './ui.jsx';

const SYSTEM = '你是香港資深教師及課程設計顧問。按香港課程及學生程度，用繁體中文（香港用語）設計一節課的教案。'
  + '時間分配要加起來等於課堂時間；活動要具體可行（寫出老師做甚麼、學生做甚麼），並照顧學習差異。'
  + '只輸出 JSON：{"title":"","objectives":[""],"materials":[""],"prior":"","stages":[{"name":"","minutes":0,"teacher":"","students":""}],'
  + '"differentiation":{"support":[""],"challenge":[""]},"assessment":[""],"homework":"","misconceptions":[""]}';

function toText(p) {
  if (!p) return '';
  const lines = [p.title, '', '學習目標：', ...asList(p.objectives).map((x, i) => `${i + 1}. ${x}`)];
  if (p.prior) lines.push('', `已有知識：${p.prior}`);
  if (asList(p.materials).length) lines.push('', `教材：${asList(p.materials).join('、')}`);
  lines.push('', '課堂流程：');
  (p.stages || []).forEach((s) => lines.push(`【${s.name}・${s.minutes} 分鐘】`, `老師：${s.teacher}`, `學生：${s.students}`));
  lines.push('', '照顧學習差異：', ...asList(p.differentiation?.support).map((x) => `支援：${x}`), ...asList(p.differentiation?.challenge).map((x) => `延伸：${x}`));
  if (asList(p.misconceptions).length) lines.push('', '常見錯誤：', ...asList(p.misconceptions).map((x) => `- ${x}`));
  lines.push('', '評估：', ...asList(p.assessment).map((x) => `- ${x}`));
  if (p.homework) lines.push('', `家課：${p.homework}`);
  return lines.join('\n');
}

export default function LessonPlan() {
  const [f, setF] = useState({ subject: '數學', level: '小五', topic: '', minutes: '35', notes: '' });
  const [plan, setPlan] = useState(null);
  const { busy, err, run } = useBusy();
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  const go = () => run(async () => {
    if (!f.topic.trim()) throw new Error('請先填寫課題');
    const data = await aiJson({ tool: 'lesson-plan', system: SYSTEM,
      message: `科目：${f.subject}\n年級：${f.level}\n課題：${f.topic}\n課堂時間：${f.minutes} 分鐘\n其他要求：${f.notes || '無'}` });
    setPlan(data);
  });

  const total = (plan?.stages || []).reduce((t, s) => t + (Number(s.minutes) || 0), 0);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="qcCard qcNoPrint" style={{ display: 'grid', gap: 12 }}>
        <Row min={150}>
          <Field label="科目"><Select value={f.subject} onChange={set('subject')} options={SUBJECTS} /></Field>
          <Field label="年級"><Select value={f.level} onChange={set('level')} options={LEVELS} /></Field>
          <Field label="課堂時間（分鐘）"><Select value={f.minutes} onChange={set('minutes')} options={['30', '35', '40', '45', '60', '70', '80']} /></Field>
        </Row>
        <Field label="課題"><input style={inputStyle} value={f.topic} onChange={(e) => set('topic')(e.target.value)} placeholder="例如：異分母分數加法" /></Field>
        <Field label="其他要求（選填）"><textarea style={areaStyle} rows={2} value={f.notes} onChange={(e) => set('notes')(e.target.value)} placeholder="例如：有 3 位 SEN 學生；想加入小組活動；用 iPad" /></Field>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <AiButton busy={busy} onClick={go}>{plan ? '重新產生教案' : '產生教案'}</AiButton>
          <ErrorNote text={err} />
        </div>
      </div>

      {plan ? (
        <div className="qcCard" style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{plan.title || f.topic}</div>
              <div style={{ fontSize: 13, color: '#6E6E73' }}>{f.subject} · {f.level} · {total || f.minutes} 分鐘</div>
            </div>
            <ResultActions text={toText(plan)} print />
          </div>
          <SubTitle>學習目標</SubTitle><List items={asList(plan.objectives)} ordered />
          {plan.prior ? (<><SubTitle>已有知識</SubTitle><div style={{ fontSize: 15 }}>{plan.prior}</div></>) : null}
          {asList(plan.materials).length ? (<><SubTitle>教材</SubTitle><div style={{ fontSize: 15 }}>{asList(plan.materials).join('、')}</div></>) : null}
          <SubTitle>課堂流程</SubTitle>
          <div style={{ display: 'grid', gap: 8 }}>
            {(plan.stages || []).map((s, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '64px minmax(0,1fr)', gap: 12, padding: 12, background: '#FAFAFC', borderRadius: 12 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#0071E3', fontVariantNumeric: 'tabular-nums' }}>{s.minutes}<span style={{ fontSize: 12, fontWeight: 600 }}> 分</span></div>
                <div style={{ display: 'grid', gap: 4, fontSize: 14, lineHeight: 1.6 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</div>
                  <div><b>老師：</b>{s.teacher}</div>
                  <div><b>學生：</b>{s.students}</div>
                </div>
              </div>
            ))}
          </div>
          <Row min={240}>
            <div><SubTitle>支援能力較弱的學生</SubTitle><List items={asList(plan.differentiation?.support)} /></div>
            <div><SubTitle>延伸能力較強的學生</SubTitle><List items={asList(plan.differentiation?.challenge)} /></div>
          </Row>
          {asList(plan.misconceptions).length ? (<><SubTitle>常見錯誤</SubTitle><List items={asList(plan.misconceptions)} /></>) : null}
          <SubTitle>評估</SubTitle><List items={asList(plan.assessment)} />
          {plan.homework ? (<><SubTitle>家課</SubTitle><div style={{ fontSize: 15 }}>{plan.homework}</div></>) : null}
        </div>
      ) : null}
    </div>
  );
}
