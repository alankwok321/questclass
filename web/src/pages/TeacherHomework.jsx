import React, { useEffect, useMemo, useState } from 'react';
import { listClassrooms, createHomeworkAssignment, listHomeworkAssignments } from '../services/firebase.js';
import { chat, getAiConfig } from '../services/api.js';

export default function TeacherHomework() {
  const [form, setForm] = useState({
    title: '',
    description: '',
    dueAt: '',
    classroomId: '',
    status: 'published',
  });

  const [classrooms, setClassrooms] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [items, setItems] = useState([]);

  const [debugOpen, setDebugOpen] = useState(true);
  const [debug, setDebug] = useState({ running: false, result: null, error: null });

  const canGenerate = useMemo(() => Boolean(String(form.title || '').trim()), [form.title]);

  async function refreshList(classroomId = null) {
    setListLoading(true);
    try {
      const res = await listHomeworkAssignments(classroomId || null, 50);
      if (res?.ok) setItems(res.items || []);
    } finally {
      setListLoading(false);
    }
  }

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

      if (!mounted) return;
      await refreshList(null);
    })();
    return () => { mounted = false; };
  }, []);

  const onRunDebug = async () => {
    setDebug({ running: true, result: null, error: null });
    try {
      const idToken = await window.QuestClassFirebase?.getIdToken?.();
      const out = {
        actorUid: window.__qc_user?.uid || null,
        hasIdToken: Boolean(idToken),
      };

      if (idToken) {
        const cfg = await getAiConfig({ idToken, uid: window.__qc_user?.uid });
        out.aiConfig = cfg;

        const chatRes = await chat({ debug: true, idToken, message: 'debug ping' });
        out.chatDebug = chatRes;
      }

      setDebug({ running: false, result: out, error: null });
    } catch (e) {
      setDebug({ running: false, result: null, error: e?.message || String(e) });
    }
  };

  const onGenerateQuestions = async () => {
    if (!canGenerate) return;
    setGenLoading(true);
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
      setGenLoading(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
          <div style={{ fontWeight: 900 }}>指派作業</div>
          <button type="button" style={btnGhost} onClick={() => setDebugOpen(v => !v)}>
            {debugOpen ? '隱藏 Debug' : '顯示 Debug'}
          </button>
        </div>

        {debugOpen ? (
          <div style={{ marginBottom: 12, padding: 12, borderRadius: 18, border: '1px solid rgba(17,24,39,0.10)', background: '#F9FAFB' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
              <div style={{ fontWeight: 900 }}>Debug</div>
              <button type="button" style={btnPrimary} onClick={onRunDebug} disabled={debug.running}>
                {debug.running ? '檢查中…' : 'Run debug'}
              </button>
            </div>
            {debug.error ? <div style={{ color: '#B91C1C', fontWeight: 900 }}>{debug.error}</div> : null}
            {debug.result ? (
              <pre style={{ margin: 0, padding: 10, borderRadius: 14, border: '1px solid rgba(17,24,39,0.10)', background: 'white', overflow: 'auto', fontSize: 12 }}>
                {JSON.stringify(debug.result, null, 2)}
              </pre>
            ) : (
              <div style={{ color: '#6B7280', fontWeight: 700, fontSize: 12 }}>按 Run debug 會檢查：idToken、有無 aiProviderConfigs、以及 /api/chat debug 回應（不顯示 key）。</div>
            )}
          </div>
        ) : null}

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
              <div style={label}>截止時間（dueAt）</div>
              <input value={form.dueAt} onChange={(e) => setForm(s => ({ ...s, dueAt: e.target.value }))} style={inputStyle} placeholder="2026-03-20T12:00:00Z" />
            </label>
          </div>

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={label}>狀態</div>
            <select value={form.status} onChange={(e) => setForm(s => ({ ...s, status: e.target.value }))} style={selectStyle}>
              <option value="draft">draft</option>
              <option value="published">published</option>
              <option value="archived">archived</option>
            </select>
          </label>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" style={btnGhost} onClick={onGenerateQuestions} disabled={!canGenerate || genLoading}>
              {genLoading ? '產生中…' : 'AI 產生題目'}
            </button>
            <button type="button" style={btnPrimary} onClick={async () => {
              const totalPoints = (questions || []).reduce((sum, q) => sum + Number(q?.points || 0), 0);
              const res = await createHomeworkAssignment({
                classroomId: form.classroomId,
                title: form.title,
                description: form.description,
                dueAt: form.dueAt,
                status: form.status,
                totalPoints,
                questions,
              });
              if (res?.ok) {
                alert('已儲存作業：' + res.assignmentId);
                await refreshList(form.classroomId || null);
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

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
          <div style={{ fontWeight: 900 }}>作業清單</div>
          <button type="button" style={btnGhost} onClick={() => refreshList(form.classroomId || null)} disabled={listLoading}>
            {listLoading ? '更新中…' : '重新整理'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 900, fontSize: 12, color: '#6B7280' }}>篩選班級：</div>
          <select
            value={form.classroomId}
            onChange={async (e) => {
              const v = e.target.value;
              setForm(s => ({ ...s, classroomId: v }));
              await refreshList(v || null);
            }}
            style={selectStyle}
            disabled={loadingClasses}
          >
            <option value="">全部</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>{c.name || c.id}</option>
            ))}
          </select>
        </div>

        {items.length ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {items.map((a) => (
              <div key={a.id} style={{ padding: 12, borderRadius: 18, border: '1px solid rgba(17,24,39,0.10)', background: '#F9FAFB' }}>
                <div style={{ fontWeight: 900 }}>{a.title || '（未命名作業）'}</div>
                <div style={{ marginTop: 4, color: '#6B7280', fontWeight: 800, fontSize: 12 }}>
                  classroom: {a.classroomId || '—'} · dueAt: {a.dueAt || '—'} · status: {a.status || '—'} · questions: {(a.questions || []).length} · total: {a.totalPoints ?? '—'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: '#6B7280', fontWeight: 700 }}>{listLoading ? '載入中…' : '目前沒有作業'}</div>
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
