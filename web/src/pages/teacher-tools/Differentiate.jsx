import React, { useState } from 'react';
import { aiJson } from '../../services/api.js';
import { AiButton, ErrorNote, Field, LEVELS, ResultActions, Row, Select, areaStyle, useBusy } from './ui.jsx';

const MODES = [
  ['levels', '分三個程度（基礎／標準／挑戰）'],
  ['simplify', '簡化（適合 SEN／非華語學生）'],
  ['questions', '根據內容出理解問題'],
  ['vocab', '列出重點詞彙及解釋'],
];

const SYSTEM = {
  levels: '把老師提供的文章或題目改寫成三個程度：基礎（字詞簡單、句子短、提供提示）、標準（原意）、挑戰（加深思考或延伸）。內容意思要一致。'
    + '只輸出 JSON：{"versions":[{"label":"基礎","text":"","tip":"給老師的使用建議"},{"label":"標準","text":"","tip":""},{"label":"挑戰","text":"","tip":""}]}',
  simplify: '把老師提供的內容改寫得易明：用常用字、短句、分點，必要時在難字後加括號解釋；保留所有重點。'
    + '只輸出 JSON：{"versions":[{"label":"簡化版","text":"","tip":"給老師的使用建議"}]}',
  questions: '根據老師提供的內容，出 6 條理解問題，由淺入深（資料擷取、推論、評價），每題附參考答案。'
    + '只輸出 JSON：{"versions":[{"label":"理解問題","text":"1. 問題\\n答案：…\\n\\n2. …","tip":""}]}',
  vocab: '從老師提供的內容選出 8–12 個重點詞彙，每個附簡單解釋及一個例句。'
    + '只輸出 JSON：{"versions":[{"label":"重點詞彙","text":"詞彙：解釋。例句：…（每個一行）","tip":""}]}',
};

// 分層改寫: one passage or question set turned into versions for different abilities.
export default function Differentiate() {
  const [mode, setMode] = useState('levels');
  const [level, setLevel] = useState('小五');
  const [text, setText] = useState('');
  const [out, setOut] = useState([]);
  const { busy, err, run } = useBusy();

  const go = () => run(async () => {
    if (text.trim().length < 10) throw new Error('請先貼上文章、題目或筆記');
    const data = await aiJson({ tool: 'differentiate',
      system: `你是香港學校老師，擅長照顧學習差異。用繁體中文（香港用語）；如原文是英文，就用英文。學生年級：${level}。${SYSTEM[mode]}`,
      message: text.slice(0, 8000) });
    setOut(Array.isArray(data.versions) ? data.versions : []);
  });

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="qcCard" style={{ display: 'grid', gap: 12 }}>
        <Row min={200}>
          <Field label="要做甚麼"><Select value={mode} onChange={setMode} options={MODES} /></Field>
          <Field label="年級"><Select value={level} onChange={setLevel} options={LEVELS} /></Field>
        </Row>
        <Field label="文章／題目／筆記" hint={`${text.length} / 8000 字`}>
          <textarea style={areaStyle} rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="把課文段落、工作紙題目或筆記貼在這裡" />
        </Field>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <AiButton busy={busy} onClick={go}>{out.length ? '重新產生' : '產生'}</AiButton>
          <ErrorNote text={err} />
        </div>
      </div>
      {out.map((v, i) => (
        <div key={i} className="qcCard" style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{v.label || `版本 ${i + 1}`}</div>
            <ResultActions text={String(v.text || '')} />
          </div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 1.8 }}>{v.text}</div>
          {v.tip ? <div style={{ fontSize: 13, color: '#3A3A3C', background: '#F2F2F7', borderRadius: 10, padding: '8px 10px' }}>💡 {v.tip}</div> : null}
        </div>
      ))}
    </div>
  );
}
