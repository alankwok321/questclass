import React, { useEffect, useMemo, useState } from 'react';
import { listMyHomework, submitHomework } from '../services/firebase.js';

export default function StudentHomework() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [answers, setAnswers] = useState({});

  const questions = useMemo(() => selected?.questions || [], [selected]);

  async function refresh() {
    setLoading(true);
    try {
      const res = await listMyHomework(50);
      if (res?.ok) setItems(res.items || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const onSubmit = async () => {
    if (!selected?.id) return;
    const payloadAnswers = questions.map((q) => ({
      questionId: q.id,
      value: answers[q.id] ?? null
    }));

    const res = await submitHomework({ assignmentId: selected.id, answers: payloadAnswers });
    if (res?.ok) {
      alert('已送出：' + res.submissionId);
    } else {
      alert(res?.error || '送出失敗');
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontWeight: 900 }}>我的作業</div>
          <button type="button" style={btnGhost} onClick={refresh} disabled={loading}>
            {loading ? '更新中…' : '重新整理'}
          </button>
        </div>
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          {items.length ? items.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => { setSelected(a); setAnswers({}); }}
              style={{
                textAlign: 'left',
                padding: 12,
                borderRadius: 18,
                border: '1px solid rgba(17,24,39,0.10)',
                background: selected?.id === a.id ? 'rgba(0,122,255,0.08)' : '#F9FAFB',
                cursor: 'pointer'
              }}
            >
              <div style={{ fontWeight: 900 }}>{a.title || '（未命名作業）'}</div>
              <div style={{ marginTop: 4, color: '#6B7280', fontWeight: 800, fontSize: 12 }}>
                dueAt: {a.dueAt || '—'} · questions: {(a.questions || []).length}
              </div>
            </button>
          )) : (
            <div style={{ color: '#6B7280', fontWeight: 700 }}>{loading ? '載入中…' : '目前沒有作業'}</div>
          )}
        </div>
      </div>

      {selected ? (
        <div className="card">
          <div style={{ fontWeight: 900, marginBottom: 8 }}>{selected.title || '作業'}</div>
          {selected.description ? (
            <div style={{ color: '#6B7280', fontWeight: 700, lineHeight: 1.7, marginBottom: 12 }}>{selected.description}</div>
          ) : null}

          <div style={{ display: 'grid', gap: 12 }}>
            {questions.map((q, idx) => (
              <div key={q.id || idx} style={{ padding: 12, borderRadius: 18, border: '1px solid rgba(17,24,39,0.10)', background: '#F9FAFB' }}>
                <div style={{ fontWeight: 900 }}>{idx + 1}. ({q.type}) {q.prompt}</div>
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 900, fontSize: 12, color: '#6B7280', marginBottom: 6 }}>回答</div>
                  <AnswerInput q={q} value={answers[q.id]} onChange={(v) => setAnswers(s => ({ ...s, [q.id]: v }))} />
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" style={btnPrimary} onClick={onSubmit}>送出作業</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AnswerInput({ q, value, onChange }) {
  const type = q?.type;
  if (type === 'multiple_choice') {
    const choices = q?.answerKey?.choices || [];
    return (
      <div style={{ display: 'grid', gap: 6 }}>
        {choices.map((c) => (
          <label key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800 }}>
            <input type="radio" name={q.id} checked={value === c.id} onChange={() => onChange(c.id)} />
            <span>{c.id}. {c.text}</span>
          </label>
        ))}
      </div>
    );
  }

  if (type === 'true_false') {
    return (
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" style={btnGhost} onClick={() => onChange(true)}>{value === true ? '✅ True' : 'True'}</button>
        <button type="button" style={btnGhost} onClick={() => onChange(false)}>{value === false ? '✅ False' : 'False'}</button>
      </div>
    );
  }

  if (type === 'numeric') {
    return (
      <input type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} style={inputStyle} />
    );
  }

  // short_text
  return (
    <textarea value={value ?? ''} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} placeholder="輸入你的答案..." />
  );
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 14,
  border: '1px solid rgba(17,24,39,0.10)',
  background: '#F2F2F7',
  outline: 'none',
  fontWeight: 800,
};

const btnPrimary = {
  border: 0,
  background: '#007AFF',
  color: 'white',
  padding: '10px 14px',
  borderRadius: 999,
  fontWeight: 900,
  cursor: 'pointer',
};

const btnGhost = {
  border: '1px solid rgba(17,24,39,0.10)',
  background: '#F2F2F7',
  color: '#111827',
  padding: '10px 14px',
  borderRadius: 999,
  fontWeight: 900,
  cursor: 'pointer',
};
