import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { chat } from '../services/api.js';
import {
  listClassrooms,
  createHomeworkAssignment,
  listHomeworkAssignments,
  updateHomeworkAssignmentStatus,
} from '../services/firebase.js';

export default function TeacherHomeworkEditor({ mode = 'new' }) {
  const navigate = useNavigate();
  const { id } = useParams();

  const isEdit = mode === 'edit';

  const [classrooms, setClassrooms] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    dueAt: '',
    classroomId: '',
    status: 'draft',
  });

  const [questions, setQuestions] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);

  const canGenerate = useMemo(() => Boolean(String(form.title || '').trim()), [form.title]);
  const totalPoints = useMemo(() => (questions || []).reduce((sum, q) => sum + Number(q?.points || 0), 0), [questions]);

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

  useEffect(() => {
    if (!isEdit || !id) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const res = await listHomeworkAssignments(null, 200);
        if (!mounted) return;
        if (!res?.ok) {
          alert(res?.error || '載入失敗');
          return;
        }
        const a = (res.items || []).find((x) => x.id === id);
        if (!a) return;
        setForm({
          title: a.title || '',
          description: a.description || '',
          dueAt: a.dueAt || '',
          classroomId: a.classroomId || '',
          status: a.status || 'draft',
        });
        setQuestions(Array.isArray(a.questions) ? a.questions : []);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [isEdit, id]);

  const onAiGenerate = async () => {
    if (!canGenerate) return;
    setAiLoading(true);
    try {
      const system = `你是一個老師助教。請產出「作業題目」JSON，輸出必須是純 JSON，不要 markdown。\n\n規格：{\n  \"questions\": [\n    {\n      \"id\": \"q1\",\n      \"type\": \"short_text|multiple_choice|true_false|numeric\",\n      \"prompt\": \"題目文字\",\n      \"points\": 1,\n      \"answerKey\": { 依 type 決定 },\n      \"meta\": { \"tags\": [..], \"difficulty\": 1 }\n    }\n  ]\n}\n\nanswerKey 規則：\n- short_text: { \"reference\": \"...\", \"keywords\": [..] }\n- multiple_choice: { \"choices\": [{\"id\":\"A\",\"text\":\"...\"},...], \"correctChoiceId\":\"A\" }\n- true_false: { \"correct\": true }\n- numeric: { \"correct\": 0.75, \"tolerance\": 0.01 }\n\n請產出 8 題：四種 type 每種至少 2 題。points 1~5。difficulty 1~5。`;

      const user = `標題：${form.title}\n說明：${form.description || ''}`;
      const idToken = await window.QuestClassFirebase?.getIdToken?.();
      if (!idToken) {
        alert('請先登入（無法取得 idToken）');
        return;
      }

      const res = await chat({
        idToken,
        topic: 'teacher-homework',
        mode: 'generate',
        studentName: 'teacher',
        message: user,
        system,
        format: 'json'
      });

      if (res?.error) {
        alert(`${res.error}${res.detail ? `: ${res.detail}` : ''}`);
        return;
      }

      const qs = res?.questions || [];
      if (!Array.isArray(qs) || !qs.length) {
        alert('AI 沒有回傳 questions（請看 Network Response）');
        return;
      }
      setQuestions(qs);
    } catch (e) {
      alert(e?.message || 'AI 產生失敗');
    } finally {
      setAiLoading(false);
    }
  };

  const onSaveDraft = async () => {
    setSaving(true);
    try {
      const res = await createHomeworkAssignment({
        id: isEdit ? id : undefined,
        classroomId: form.classroomId,
        title: form.title,
        description: form.description,
        dueAt: form.dueAt,
        status: 'draft',
        totalPoints,
        questions,
      });
      if (!res?.ok) return alert(res?.error || '儲存失敗');
      alert('已儲存草稿：' + res.assignmentId);
      navigate(`/teacher-homework/${res.assignmentId}`);
    } finally {
      setSaving(false);
    }
  };

  const onAssign = async () => {
    // Teams style: Assign = published, immediate
    setSaving(true);
    try {
      if (isEdit) {
        // Save changes first
        const saveRes = await createHomeworkAssignment({
          id,
          classroomId: form.classroomId,
          title: form.title,
          description: form.description,
          dueAt: form.dueAt,
          status: form.status,
          totalPoints,
          questions,
        });
        if (!saveRes?.ok) return alert(saveRes?.error || '更新失敗');
        const pubRes = await updateHomeworkAssignmentStatus({ assignmentId: id, status: 'published' });
        if (!pubRes?.ok) return alert(pubRes?.error || '指派失敗');
        alert('已指派（published）：' + id);
        navigate(`/teacher-homework/${id}`);
        return;
      }

      // New: create as published
      const res = await createHomeworkAssignment({
        classroomId: form.classroomId,
        title: form.title,
        description: form.description,
        dueAt: form.dueAt,
        status: 'published',
        totalPoints,
        questions,
      });
      if (!res?.ok) return alert(res?.error || '指派失敗');
      alert('已指派（published）：' + res.assignmentId);
      navigate(`/teacher-homework/${res.assignmentId}`);
    } finally {
      setSaving(false);
    }
  };

  const onMoveQuestion = (idx, dir) => {
    const next = [...questions];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    const tmp = next[idx];
    next[idx] = next[j];
    next[j] = tmp;
    setQuestions(next);
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 900 }}>{isEdit ? '編輯作業' : '新增作業'}</div>
            <div style={{ marginTop: 4, color: '#6B7280', fontWeight: 800, fontSize: 12 }}>
              Teams 風格：Details → Questions → Preview。按「指派」會直接發布。
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={btnGhost} onClick={() => navigate(-1)}>返回</button>
            <button type="button" style={btnGhost} onClick={onSaveDraft} disabled={saving}>儲存草稿</button>
            <button type="button" style={btnPrimary} onClick={onAssign} disabled={saving}>
              {saving ? '處理中…' : '指派'}
            </button>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="card">
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Details</div>
        <div style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <div style={labelStyle}>標題</div>
            <input value={form.title} onChange={(e) => setForm(s => ({ ...s, title: e.target.value }))} style={inputStyle} placeholder="例如：分數加減練習" />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={labelStyle}>說明</div>
            <textarea value={form.description} onChange={(e) => setForm(s => ({ ...s, description: e.target.value }))} style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} placeholder="作業內容/規則..." />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <div style={labelStyle}>班級（Assign to）</div>
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
              <div style={labelStyle}>截止時間（dueAt）</div>
              <input value={form.dueAt} onChange={(e) => setForm(s => ({ ...s, dueAt: e.target.value }))} style={inputStyle} placeholder="2026-03-20T12:00:00Z" />
            </label>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 900, fontSize: 12, color: '#6B7280' }}>總分：</div>
            <div style={{ fontWeight: 900 }}>{totalPoints}</div>
            <div style={{ fontWeight: 900, fontSize: 12, color: '#6B7280' }}>狀態：</div>
            <div style={{ fontWeight: 900 }}>{form.status}</div>
          </div>
        </div>
      </div>

      {/* Questions */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ fontWeight: 900 }}>Questions（{questions.length}）</div>
          <button type="button" style={btnGhost} onClick={onAiGenerate} disabled={!canGenerate || aiLoading}>
            {aiLoading ? '產生中…' : 'AI 產生題目'}
          </button>
        </div>

        {questions.length ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {questions.map((q, idx) => (
              <div key={q.id || idx} style={qCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 900 }}>{idx + 1}. ({q.type}) {q.prompt}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" style={btnGhostSm} onClick={() => onMoveQuestion(idx, -1)}>上移</button>
                    <button type="button" style={btnGhostSm} onClick={() => onMoveQuestion(idx, 1)}>下移</button>
                  </div>
                </div>
                <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <div style={labelStyle}>題目文字</div>
                    <textarea
                      value={q.prompt || ''}
                      onChange={(e) => {
                        const next = [...questions];
                        next[idx] = { ...q, prompt: e.target.value };
                        setQuestions(next);
                      }}
                      style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
                    />
                  </label>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 10 }}>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <div style={labelStyle}>Type</div>
                      <input value={q.type || ''} readOnly style={{ ...inputStyle, opacity: 0.8 }} />
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <div style={labelStyle}>Points</div>
                      <input
                        type="number"
                        value={q.points ?? 1}
                        onChange={(e) => {
                          const next = [...questions];
                          next[idx] = { ...q, points: e.target.value === '' ? 0 : Number(e.target.value) };
                          setQuestions(next);
                        }}
                        style={inputStyle}
                      />
                    </label>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="button" style={btnDanger} onClick={() => {
                      const next = [...questions];
                      next.splice(idx, 1);
                      setQuestions(next);
                    }}>
                      刪除題目
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: '#6B7280', fontWeight: 700 }}>{aiLoading ? '產生中…' : '尚未有題目，先按「AI 產生題目」或自行新增。'}</div>
        )}

        <div style={{ marginTop: 12 }}>
          <button type="button" style={btnGhost} onClick={() => {
            setQuestions((qs) => [...qs, { id: `q${qs.length + 1}`, type: 'short_text', prompt: '', points: 1, answerKey: { reference: '', keywords: [] }, meta: { tags: [], difficulty: 1 } }]);
          }}>
            ＋新增題目
          </button>
        </div>
      </div>

      {/* Preview */}
      <div className="card">
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Preview（學生視角）</div>
        <div style={{ color: '#6B7280', fontWeight: 800, fontSize: 12, marginBottom: 10 }}>
          這裡先做最小預覽：標題/說明/題目列表。之後可做成與 StudentHomework 完全一致的 render。
        </div>

        <div style={{ fontWeight: 900 }}>{form.title || '（未命名作業）'}</div>
        {form.description ? (
          <div style={{ marginTop: 6, color: '#374151', fontWeight: 800, lineHeight: 1.7 }}>{form.description}</div>
        ) : null}

        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          {questions.map((q, idx) => (
            <div key={q.id || idx} style={{ padding: 10, borderRadius: 14, border: '1px solid rgba(17,24,39,0.10)', background: '#F9FAFB' }}>
              <div style={{ fontWeight: 900 }}>{idx + 1}. {q.prompt || '（未填題目）'}</div>
              <div style={{ marginTop: 4, color: '#6B7280', fontWeight: 800, fontSize: 12 }}>({q.type}) points: {q.points ?? '—'}</div>
            </div>
          ))}
        </div>

        {loading ? <div style={{ marginTop: 10, color: '#6B7280', fontWeight: 700 }}>載入中…</div> : null}
      </div>
    </div>
  );
}

const labelStyle = { fontWeight: 900, fontSize: 12, color: '#6B7280' };

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

const qCard = {
  padding: 12,
  borderRadius: 18,
  border: '1px solid rgba(17,24,39,0.10)',
  background: '#F9FAFB',
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

const btnGhostSm = {
  border: '1px solid rgba(17,24,39,0.10)',
  background: '#F2F2F7',
  color: '#111827',
  padding: '6px 10px',
  borderRadius: 999,
  fontWeight: 900,
  fontSize: 11,
  cursor: 'pointer',
};

const btnDanger = {
  border: 0,
  background: 'rgba(255,59,48,0.12)',
  color: '#B91C1C',
  padding: '8px 12px',
  borderRadius: 999,
  fontWeight: 900,
  cursor: 'pointer',
};
