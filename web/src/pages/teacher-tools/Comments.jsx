import React, { useState } from 'react';
import Avatar from '../../components/Avatar.jsx';
import { ClassPicker, Segmented, useClassAnalysis } from '../../components/ClassStats.jsx';
import { aiJson } from '../../services/api.js';
import { AiButton, ErrorNote, Field, ResultActions, Select, areaStyle, useBusy } from './ui.jsx';

const BATCH = 15;

function line(s, i) {
  const topics = s.topics.slice(0, 4).map((t) => `${t.topic} ${t.pct}%`).join('、');
  const trend = s.trend == null ? '資料不足' : s.trend > 0 ? '進步' : s.trend < 0 ? '退步' : '穩定';
  return `${i}｜${s.name}｜交 ${s.done}/${s.assigned}，欠交 ${s.missing}｜平均 ${s.avg == null ? '未有' : `${s.avg}%`}｜走勢 ${trend}｜課題：${topics || '未有'}`;
}

// 成績表評語: a short comment for every student in the class, from their real homework data.
export default function Comments() {
  const { classes, cls, setCls, analysis: a, loading } = useClassAnalysis();
  const [tone, setTone] = useState('warm');
  const [len, setLen] = useState('60');
  const [notes, setNotes] = useState('');
  const [comments, setComments] = useState({}); // uid → text
  const [progress, setProgress] = useState('');
  const { busy, err, run } = useBusy();
  const students = a?.students || [];

  const go = () => run(async () => {
    const out = { ...comments };
    for (let start = 0; start < students.length; start += BATCH) {
      const part = students.slice(start, start + BATCH);
      setProgress(`${start + 1}–${start + part.length} / ${students.length}`);
      const data = await aiJson({ tool: 'report-comments',
        system: '你是香港學校的班主任。為每位學生寫一段成績表／手冊評語，用繁體中文書面語。'
          + `語氣：${tone === 'warm' ? '溫暖、鼓勵' : '正式、客觀'}；每段約 ${len} 字。`
          + '先肯定優點，再具體指出一項需要改善的地方（例如某課題或欠交），最後給一個建議。不要編造數據以外的事，不要提及百分比數字。'
          + '只輸出 JSON：{"comments":[{"id":"編號","comment":"評語"}]}',
        message: `班別：${cls}\n${notes ? `老師補充：${notes}\n` : ''}學生資料（編號｜姓名｜交功課｜平均｜走勢｜課題答對率）：\n${part.map((s, j) => line(s, start + j + 1)).join('\n')}` });
      for (const c of Array.isArray(data?.comments) ? data.comments : []) {
        const s = students[Number(c.id) - 1];
        if (s && c.comment) out[s.uid] = String(c.comment).trim();
      }
      setComments({ ...out });
    }
    setProgress('');
  });

  const allText = students.filter((s) => comments[s.uid]).map((s) => `${s.name}：${comments[s.uid]}`).join('\n\n');
  if (!loading && !classes.length) return <div className="qcCard qcEmpty">還沒有班別。</div>;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="qcCard" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <ClassPicker classes={classes} value={cls} onChange={(c) => { setCls(c); setComments({}); }} />
          <Segmented label="語氣" value={tone} onChange={setTone} options={[['warm', '溫暖鼓勵'], ['formal', '正式客觀']]} />
          <div style={{ width: 150 }}><Select aria-label="字數" value={len} onChange={setLen} options={[['40', '約 40 字'], ['60', '約 60 字'], ['100', '約 100 字']]} /></div>
        </div>
        <Field label="補充（選填，會套用到全班）"><input style={{ ...areaStyle, height: 38, padding: '0 12px' }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="例如：本學期主要教分數和小數；提醒學生暑假多閱讀" /></Field>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <AiButton busy={busy} onClick={go} disabled={!students.length}>{Object.keys(comments).length ? '全部重新撰寫' : `為 ${students.length} 位學生撰寫評語`}</AiButton>
          {progress ? <span style={{ fontSize: 13, color: '#6E6E73' }}>正在處理 {progress}</span> : null}
          <ErrorNote text={err} />
          <span style={{ flexGrow: 1 }} />
          {allText ? <ResultActions text={allText} /> : null}
        </div>
        <div style={{ fontSize: 12, color: '#86868B' }}>評語根據學生在 QuestClass 的作業數據撰寫，請檢查並按你對學生的認識修改。</div>
      </div>

      {loading ? <div className="qcCard qcEmpty">載入中…</div> : students.map((s) => (
        <div key={s.uid} className="qcCard" style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar photoURL={s.photoURL} name={s.name} size={32} />
            <div style={{ fontWeight: 600 }}>{s.name}</div>
            <div style={{ fontSize: 12, color: '#6E6E73' }}>交 {s.done}/{s.assigned} · 平均 {s.avg == null ? '—' : `${s.avg}%`}{s.weakest ? ` · 弱項 ${s.weakest.topic}` : ''}</div>
          </div>
          <textarea style={areaStyle} rows={3} value={comments[s.uid] || ''} placeholder="按上面的按鈕由 AI 起草，或自己輸入"
            onChange={(e) => setComments((m) => ({ ...m, [s.uid]: e.target.value }))} />
        </div>
      ))}
    </div>
  );
}
