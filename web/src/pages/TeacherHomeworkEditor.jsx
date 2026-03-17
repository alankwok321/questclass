import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { chat } from '../services/api.js';
import QuestionTypeBadge from '../components/QuestionTypeBadge.jsx';
import QuestionPreview from '../components/QuestionPreview.jsx';
import {
  listClassrooms,
  createHomeworkAssignment,
  listHomeworkAssignments,
  updateHomeworkAssignmentStatus,
  upsertQuestionBankItem,
  listQuestionBank,
  getQuestionBankItemsByIds,
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

  // For now we keep both to allow a gradual migration:
  // - questions: legacy embedded questions
  // - questionRefs: Kahoot-style references into questionBank
  const [questions, setQuestions] = useState([]);
  const [questionRefs, setQuestionRefs] = useState([]);
  const [bankItems, setBankItems] = useState([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  const canGenerate = useMemo(() => Boolean(String(form.title || '').trim()), [form.title]);
  const totalPoints = useMemo(() => {
    const legacy = (questions || []).reduce((sum, q) => sum + Number(q?.points || 0), 0);
    const refs = (questionRefs || []).reduce((sum, r) => sum + Number(r?.pointsOverride ?? r?.points ?? 0), 0);
    return legacy + refs;
  }, [questions, questionRefs]);

  const selectedQuestion = useMemo(() => {
    if (!selectedQuestionId) return null;
    return (bankItems || []).find((x) => x.id === selectedQuestionId) || null;
  }, [bankItems, selectedQuestionId]);

  const selectedPoints = useMemo(() => {
    if (!selectedQuestionId) return null;
    const r = (questionRefs || []).find((x) => x.questionId === selectedQuestionId);
    return r?.pointsOverride ?? selectedQuestion?.points ?? null;
  }, [questionRefs, selectedQuestionId, selectedQuestion]);

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

        const refs = Array.isArray(a.questionRefs) ? a.questionRefs : [];
        setQuestionRefs(refs);

        // Hydrate question bank items for refs
        const ids = refs.map((r) => r?.questionId).filter(Boolean);
        if (ids.length) {
          const bankRes = await getQuestionBankItemsByIds(ids);
          if (bankRes?.ok) setBankItems(bankRes.items || []);
        }
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

      // Kahoot-style: store into questionBank, then reference from homework.
      if (!String(form.classroomId || '').trim()) {
        alert('請先選擇班級（Assign to），才能把題目存到題庫');
        return;
      }

      const created = [];
      for (let i = 0; i < qs.length; i += 1) {
        const q = qs[i] || {};
        const type = String(q.type || 'MULTIPLE_CHOICE');
        const itemRes = await upsertQuestionBankItem({
          classroomId: form.classroomId,
          type,
          topic: String(q.topic || ''),
          points: Number(q.points || 1),
          timeLimitSec: Number(q.timeLimitSec || 30),

          // UI-aligned
          question_text: String(q.prompt || q.question_text || ''),
          options: q.answerKey?.choices || q.options || [],
          correct_answer: (type === 'TRUE_FALSE') ? Boolean(q.answerKey?.correct ?? q.correct_answer) : undefined,
          blanks: q.blanks || [],
          pairs: q.pairs || [],
          ideal_answer: q.ideal_answer || '',
          grading_rubric: q.grading_rubric || '',
          max_word_count: q.max_word_count || 0,

          tags: q.meta?.tags || q.tags || [],
          difficulty: Number(q.meta?.difficulty || q.difficulty || 1),

          // keep also Kahoot-style alias fields for now
          correctChoiceIds: q.answerKey?.correctChoiceId ? [q.answerKey.correctChoiceId] : (q.correctChoiceIds || []),
        });
        if (itemRes?.ok) {
          created.push({ questionId: itemRes.questionId, order: created.length, pointsOverride: Number(q.points || 1) });
        }
      }

      if (!created.length) {
        alert('題目寫入題庫失敗');
        return;
      }

      setQuestionRefs(created);
      setQuestions([]);
      if (created[0]?.questionId) setSelectedQuestionId(created[0].questionId);

      const bankRes = await getQuestionBankItemsByIds(created.map((r) => r.questionId));
      if (bankRes?.ok) setBankItems(bankRes.items || []);
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
        questionRefs,
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
          questionRefs,
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
        questionRefs,
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
          <div style={{ fontWeight: 900 }}>Questions（題庫引用 {questionRefs.length}）</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={btnGhost} onClick={async () => {
              if (!form.classroomId) return alert('請先選擇班級');
              const res = await listQuestionBank(form.classroomId, 200);
              if (!res?.ok) return alert(res?.error || '載入題庫失敗');
              setBankItems(res.items || []);
              alert('已更新題庫（最新 200 題）');
            }}>
              重新載入題庫
            </button>
            <button type="button" style={btnGhost} onClick={onAiGenerate} disabled={!canGenerate || aiLoading}>
              {aiLoading ? '產生中…' : 'AI 產生題目（存入題庫）'}
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 12, alignItems: 'start' }}>
          {/* Left: question list (Kahoot-like) */}
          <div style={{ border: '1px solid rgba(17,24,39,0.10)', borderRadius: 18, overflow: 'hidden', background: '#F9FAFB' }}>
            <div style={{ padding: 12, borderBottom: '1px solid rgba(17,24,39,0.10)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 900 }}>題目清單</div>
              <button type="button" style={btnGhostSm} onClick={async () => {
                if (!form.classroomId) return alert('請先選擇班級');
                const res = await listQuestionBank(form.classroomId, 200);
                if (!res?.ok) return alert(res?.error || '載入題庫失敗');
                setBankItems(res.items || []);
                alert('已更新題庫');
              }}>
                更新題庫
              </button>
            </div>

            {questionRefs.length ? (
              <div style={{ maxHeight: 520, overflow: 'auto' }}>
                {questionRefs
                  .slice()
                  .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
                  .map((r, idx) => {
                    const q = (bankItems || []).find((x) => x.id === r.questionId);
                    const active = selectedQuestionId === r.questionId;
                    return (
                      <button
                        key={r.questionId || idx}
                        type="button"
                        onClick={() => setSelectedQuestionId(r.questionId)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          border: 0,
                          borderLeft: active ? '4px solid #0B5FFF' : '4px solid transparent',
                          background: active ? 'rgba(0,122,255,0.08)' : 'transparent',
                          padding: 12,
                          display: 'grid',
                          gap: 6,
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {idx + 1}. {q?.question_text || q?.prompt || '（未載入）'}
                          </div>
                          <div style={{ fontWeight: 900, fontSize: 12, color: '#6B7280' }}>{r.pointsOverride ?? q?.points ?? '—'}分</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                          <QuestionTypeBadge type={q?.type} />
                          <div style={{ fontWeight: 900, fontSize: 12, color: '#6B7280' }}>{q?.topic || '—'}</div>
                        </div>
                      </button>
                    );
                  })}
              </div>
            ) : (
              <div style={{ padding: 12, color: '#6B7280', fontWeight: 700 }}>
                尚未加入題目。
              </div>
            )}

            <div style={{ padding: 12, borderTop: '1px solid rgba(17,24,39,0.10)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" style={btnGhostSm} onClick={async () => {
                if (!form.classroomId) return alert('請先選擇班級');
                const res = await listQuestionBank(form.classroomId, 200);
                if (!res?.ok) return alert(res?.error || '載入題庫失敗');
                setBankItems(res.items || []);

                const existing = new Set(questionRefs.map((x) => x.questionId));
                const pick = (res.items || []).find((x) => !existing.has(x.id));
                if (!pick) return alert('題庫沒有可新增的題（或已全部加入）');

                setQuestionRefs((arr) => [...arr, { questionId: pick.id, order: arr.length, pointsOverride: pick.points }]);
                setSelectedQuestionId(pick.id);
              }}>
                ＋從題庫加入
              </button>

              {selectedQuestionId ? (
                <button type="button" style={btnGhostSm} onClick={() => {
                  const sorted = questionRefs.slice().sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
                  const idx = sorted.findIndex((x) => x.questionId === selectedQuestionId);
                  if (idx <= 0) return;
                  const a = sorted[idx - 1];
                  const b = sorted[idx];
                  setQuestionRefs((arr) => arr.map((x) => {
                    if (x.questionId === a.questionId) return { ...x, order: b.order };
                    if (x.questionId === b.questionId) return { ...x, order: a.order };
                    return x;
                  }));
                }}>
                  上移
                </button>
              ) : null}

              {selectedQuestionId ? (
                <button type="button" style={btnGhostSm} onClick={() => {
                  const sorted = questionRefs.slice().sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
                  const idx = sorted.findIndex((x) => x.questionId === selectedQuestionId);
                  if (idx < 0 || idx >= sorted.length - 1) return;
                  const a = sorted[idx];
                  const b = sorted[idx + 1];
                  setQuestionRefs((arr) => arr.map((x) => {
                    if (x.questionId === a.questionId) return { ...x, order: b.order };
                    if (x.questionId === b.questionId) return { ...x, order: a.order };
                    return x;
                  }));
                }}>
                  下移
                </button>
              ) : null}

              {selectedQuestionId ? (
                <button type="button" style={btnGhostSm} onClick={() => {
                  const r = questionRefs.find((x) => x.questionId === selectedQuestionId);
                  if (!r) return;
                  const v = prompt('這題分數（留空代表用題庫預設）', String(r.pointsOverride ?? ''));
                  if (v === null) return;
                  setQuestionRefs((arr) => arr.map((x) => x.questionId === selectedQuestionId ? { ...x, pointsOverride: v === '' ? null : Number(v) } : x));
                }}>
                  分數…
                </button>
              ) : null}

              {selectedQuestionId ? (
                <button type="button" style={btnDanger} onClick={() => {
                  setQuestionRefs((arr) => arr.filter((x) => x.questionId !== selectedQuestionId));
                  setSelectedQuestionId(null);
                }}>
                  移除
                </button>
              ) : null}
            </div>
          </div>

          {/* Right: teacher preview */}
          <div style={{ border: '1px solid rgba(17,24,39,0.10)', borderRadius: 18, background: 'white', padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 900 }}>教師預覽 / 正確答案</div>
                <div style={{ marginTop: 6, color: '#6B7280', fontWeight: 800, fontSize: 12 }}>
                  題型預覽（不做四彩卡），讓你快速檢查資料是否正確。
                </div>
              </div>
              {selectedQuestionId ? (
                <div style={{ color: '#6B7280', fontWeight: 900, fontSize: 12 }}>id: {selectedQuestionId}</div>
              ) : null}
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 900, fontSize: 18 }}>
                {selectedQuestion?.question_text || selectedQuestion?.prompt || '（從左側選擇題目）'}
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <QuestionTypeBadge type={selectedQuestion?.type} />
                <span style={{ color: '#6B7280', fontWeight: 900, fontSize: 12 }}>topic: {selectedQuestion?.topic || '—'}</span>
                <span style={{ color: '#6B7280', fontWeight: 900, fontSize: 12 }}>points: {selectedPoints ?? '—'}</span>
                <span style={{ color: '#6B7280', fontWeight: 900, fontSize: 12 }}>time: {selectedQuestion?.timeLimitSec ?? '—'}s</span>
              </div>

              <QuestionPreview q={selectedQuestion} />
            </div>
          </div>
        </div>

        {questions.length ? (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(17,24,39,0.10)' }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Legacy embedded questions（相容舊資料）: {questions.length}</div>
            <div style={{ color: '#6B7280', fontWeight: 800, fontSize: 12 }}>
              你目前已選擇「Kahoot 題庫模式」，新題會存到 questionBank 並以 questionRefs 引用。
            </div>
          </div>
        ) : null}
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
