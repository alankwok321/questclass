import React, { useEffect, useMemo, useState } from 'react';
import { listClassrooms, createHomeworkAssignment } from '../services/firebase.js';
import { chat } from '../services/api.js';

export default function TeacherHomework() {
  const [form, setForm] = useState({
    title: '',
    description: '',
    dueDate: '',
    classroomId: '',
    points: 10,
  });

  const [classrooms, setClassrooms] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [questions, setQuestions] = useState([]);

  const canGenerate = useMemo(() => Boolean(String(form.title || '').trim()), [form.title]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingClasses(true);
      try {
        const res = await listClassrooms();
        if (!mounted) return;
        if (res?.ok) setClassrooms(res.classrooms || []);
      } finally {
        if (mounted) setLoadingClasses(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const onGenerateQuestions = async () => {
    if (!canGenerate) return;
    setGenLoading(true);
    try {
      const prompt = `你是一個老師助教。請根據作業標題與說明產出 5 題題目（適合國小/國中皆可），每題包含：id(短字串)、question(題目)、answer(參考答案)、points(整數)。輸出 JSON 格式：{\"questions\":[...]}`;
      const user = `標題：${form.title}\n說明：${form.description || ''}`;
      const res = await chat({
        topic: 'teacher-homework',
        mode: 'generate',
        studentName: 'teacher',
        message: user,
        system: prompt,
      });
      const qs = res?.questions || res?.assignment || [];
      setQuestions(Array.isArray(qs) ? qs : []);
    } catch {
      // ignore
    } finally {
      setGenLoading(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card">
        <div style={{ fontWeight: 900, marginBottom: 10 }}>指派作業</div>
        <div style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <div style={label}>標題</div>
            <input value={form.title} onChange={(e) => setForm(s => ({ ...s, title: e.target.value }))} style={inputStyle} placeholder="例如：分數加減練習" />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={label}>說明</div>
            <textarea value={form.description} onChange={(e) => setForm(s => ({ ...s, description: e.target.value }))} style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} placeholder="作業內容/規則..." />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <div style={label}>班級</div>
              <select
                value={form.classroomId}
                onChange={(e) => setForm(s => ({ ...s, classroomId: e.target.value }))}
                style={selectStyle}
                disabled={loadingClasses}
              >
                <option value="">{loadingClasses ? '載入中…' : '請選擇班級'}</option>
                {classrooms.map((c) => (
                  <option key={c.id} value={c.id}>{c.name || c.id}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <div style={label}>截止日期</div>
              <input value={form.dueDate} onChange={(e) => setForm(s => ({ ...s, dueDate: e.target.value }))} style={inputStyle} placeholder="YYYY-MM-DD" />
            </label>
          </div>

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={label}>配分</div>
            <input type="number" value={form.points} onChange={(e) => setForm(s => ({ ...s, points: Number(e.target.value) }))} style={inputStyle} />
          </label>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" style={btnGhost} onClick={onGenerateQuestions} disabled={!canGenerate || genLoading}>
              {genLoading ? '產生中…' : 'AI 產生題目'}
            </button>
            <button type="button" style={btnPrimary} onClick={async () => {
              const res = await createHomeworkAssignment({
                classroomId: form.classroomId,
                title: form.title,
                description: form.description,
                dueDate: form.dueDate,
                points: form.points,
                questions,
              });
              if (res?.ok) {
                alert('已儲存作業：' + res.assignmentId);
              } else {
                alert(res?.error || '儲存失敗');
              }
            }}>
              儲存作業
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ fontWeight: 900, marginBottom: 10 }}>題目（{questions.length}）</div>
        {questions.length ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {questions.map((q, idx) => (
              <div key={q.id || idx} style={{ padding: 12, borderRadius: 18, border: '1px solid rgba(17,24,39,0.10)', background: '#F9FAFB' }}>
                <div style={{ fontWeight: 900 }}>{idx + 1}. {q.question || q.prompt || ''}</div>
                <div style={{ marginTop: 6, color: '#6B7280', fontWeight: 700 }}>Answer: {q.answer || q.solution || '—'}</div>
                <div style={{ marginTop: 6, color: '#6B7280', fontWeight: 800, fontSize: 12 }}>points: {q.points ?? '—'}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: '#6B7280', fontWeight: 700 }}>尚未產生題目</div>
        )}
      </div>
    </div>
  );
}

const label = { fontWeight: 900, fontSize: 12, color: '#6B7280' };
const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 14,
  border: '1px solid rgba(17,24,39,0.10)',
  background: '#F2F2F7',
  outline: 'none',
  fontWeight: 800,
};
const selectStyle = {
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
