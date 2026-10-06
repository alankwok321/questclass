import React, { useState } from 'react';
import { ClassPicker, Segmented, useClassAnalysis } from '../../components/ClassStats.jsx';
import { aiJson } from '../../services/api.js';
import { AiButton, ErrorNote, Field, ResultActions, Row, Select, areaStyle, inputStyle, useBusy } from './ui.jsx';

const PURPOSES = [
  ['missing', '欠交功課提醒'], ['praise', '表揚學生表現'], ['concern', '學習上需要關注'],
  ['notice', '活動／通告'], ['meeting', '約見家長'], ['other', '其他'],
];

// 家長訊息: a WhatsApp / e-class message or letter to parents, optionally using a student's real data.
export default function ParentMessage() {
  const { classes, cls, setCls, analysis: a } = useClassAnalysis();
  const [purpose, setPurpose] = useState('missing');
  const [uid, setUid] = useState('');
  const [lang, setLang] = useState('zh');
  const [format, setFormat] = useState('short');
  const [points, setPoints] = useState('');
  const [out, setOut] = useState(null);
  const { busy, err, run } = useBusy();

  const students = a?.students || [];
  const s = students.find((x) => x.uid === uid);
  const facts = s ? [
    `學生：${s.name}（${cls}）`,
    `已交 ${s.done}/${s.assigned} 份作業，欠交 ${s.missing} 份`,
    s.missing ? `欠交的作業：${s.perHomework.filter((h) => h.overdue).map((h) => h.title).join('、')}` : '',
    s.avg != null ? `作業平均 ${s.avg}%` : '',
    s.weakest ? `較弱課題：${s.weakest.topic}` : '',
  ].filter(Boolean).join('\n') : (cls ? `對象：${cls} 班全體家長` : '');

  const go = () => run(async () => {
    const data = await aiJson({ tool: 'parent-message',
      system: '你是香港學校老師，要寫一則給家長的訊息。語氣禮貌、清楚、正面，不批評學生，具體說明情況和希望家長配合的事。'
        + `語言：${lang === 'zh' ? '繁體中文書面語' : lang === 'en' ? 'English' : '先中文（繁體書面語）後英文'}。`
        + `格式：${format === 'short' ? '簡短訊息（適合 WhatsApp／電子平台，80–150 字，不用信頭）' : '正式信件（有稱呼、正文、署名「班主任」）'}。`
        + '只輸出 JSON：{"subject":"標題","body":"內容"}',
      message: `目的：${PURPOSES.find((p) => p[0] === purpose)?.[1]}\n${facts}\n老師要點：${points || '無'}` });
    setOut({ subject: String(data.subject || ''), body: String(data.body || '') });
  });

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="qcCard" style={{ display: 'grid', gap: 12 }}>
        <Row min={200}>
          <Field label="目的"><Select value={purpose} onChange={setPurpose} options={PURPOSES} /></Field>
          <Field label="班別">{classes.length ? <div><ClassPicker classes={classes} value={cls} onChange={(c) => { setCls(c); setUid(''); }} /></div> : <span style={{ color: '#86868B' }}>—</span>}</Field>
          <Field label="學生（選填）" hint={s ? '會用這位學生的作業紀錄' : '不選 = 寫給全班家長'}>
            <Select value={uid} onChange={setUid} options={[['', '全班家長'], ...students.map((x) => [x.uid, x.name])]} />
          </Field>
        </Row>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Segmented label="語言" value={lang} onChange={setLang} options={[['zh', '中文'], ['en', 'English'], ['both', '中英對照']]} />
          <Segmented label="格式" value={format} onChange={setFormat} options={[['short', '簡短訊息'], ['letter', '正式信件']]} />
        </div>
        <Field label="要點（選填）"><textarea style={areaStyle} rows={3} value={points} onChange={(e) => setPoints(e.target.value)} placeholder="例如：請家長每晚檢查手冊；下星期五前補交；感謝家長支持" /></Field>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <AiButton busy={busy} onClick={go}>{out ? '重新撰寫' : '撰寫訊息'}</AiButton>
          <ErrorNote text={err} />
        </div>
      </div>

      {out ? (
        <div className="qcCard" style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>訊息草稿</div>
            <ResultActions text={out.subject && format === 'letter' ? `${out.subject}\n\n${out.body}` : out.body} />
          </div>
          {format === 'letter' ? <input style={inputStyle} value={out.subject} onChange={(e) => setOut({ ...out, subject: e.target.value })} aria-label="標題" /> : null}
          <textarea style={areaStyle} rows={format === 'letter' ? 12 : 6} value={out.body} onChange={(e) => setOut({ ...out, body: e.target.value })} aria-label="內容" />
        </div>
      ) : null}
    </div>
  );
}
