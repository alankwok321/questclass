import React, { useEffect, useMemo, useState } from 'react';
import { createHomeworkAssignment, listHomeworkAssignments, updateHomeworkAssignmentStatus } from '../services/firebase.js';
import { chat, getAiConfig } from '../services/api.js';

function toEditFormFromAssignment(a) {
  if (!a) return { title: '', description: '', dueAt: '', status: 'published' };
  return {
    title: String(a.title || ''),
    description: String(a.description || ''),
    dueAt: String(a.dueAt || ''),
    status: String(a.status || 'published'),
  };
}

export default function TeacherHomework() {
  const [form, setForm] = useState({
    title: '',
    description: '',
    dueAt: '',
    status: 'published',
  });

  const [genLoading, setGenLoading] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [items, setItems] = useState([]);

  // Editing existing homework
  const [editingId, setEditingId] = useState(null);
  const isEditing = Boolean(editingId);

  const [debugOpen, setDebugOpen] = useState(true);
  const [debug, setDebug] = useState({ running: false, result: null, error: null });

  const canGenerate = useMemo(() => Boolean(String(form.title || '').trim()), [form.title]);

  async function refreshList() {
    setListLoading(true);
    try {
      const res = await listHomeworkAssignments(50);
      if (res?.ok) setItems(res.items || []);
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!mounted) return;
      await refreshList();
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

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={label}>截止時間（dueAt）</div>
            <input value={form.dueAt} onChange={(e) => setForm(s => ({ ...s, dueAt: e.target.value }))} style={inputStyle} placeholder="2026-03-20T12:00:00Z" />
          </label>

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
                id: editingId || undefined,
                title: form.title,
                description: form.description,
                dueAt: form.dueAt,
                status: form.status,
                totalPoints,
                questions,
              });
              if (res?.ok) {
                alert((isEditing ? '已更新作業：' : '已儲存作業：') + res.assignmentId);
                await refreshList();
              } else {
                alert(res?.error || (isEditing ? '更新失敗' : '儲存失敗'));
              }
            }}>
              {isEditing ? '更新作業' : '儲存作業'}
            </button>

            {isEditing ? (
              <button type="button" style={btnGhost} onClick={() => {
                setEditingId(null);
                setForm({ title: '', description: '', dueAt: '', status: 'published' });
                setQuestions([]);
              }}>
                取消編輯
              </button>
            ) : null}
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
          <button type="button" style={btnGhost} onClick={() => refreshList()} disabled={listLoading}>
            {listLoading ? '更新中…' : '重新整理'}
          </button>
        </div>

          {items.length ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {items.map((a) => (
              <div key={a.id} style={{ padding: 12, borderRadius: 18, border: '1px solid rgba(17,24,39,0.10)', background: '#F9FAFB', display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 900 }}>{a.title || '（未命名作業）'}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" style={btnGhost} onClick={() => {
                      setEditingId(a.id);
                      setForm(toEditFormFromAssignment(a));
                      setQuestions(Array.isArray(a.questions) ? a.questions : []);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}>
                      編輯
                    </button>
                    <button type="button" style={btnGhost} onClick={async () => {
                      // Quick action: archive (status-only)
                      const res = await updateHomeworkAssignmentStatus({ assignmentId: a.id, status: 'archived' });
                      if (res?.ok) {
                        alert('已下架（archived）：' + a.id);
                        await refreshList();
                      } else {
                        alert(res?.error || '下架失敗');
                      }
                    }}>
                      下架
                    </button>
                  </div>
                </div>

                <div style={{ color: '#6B7280', fontWeight: 800, fontSize: 12 }}>
                  id: {a.id || '—'} · dueAt: {a.dueAt || '—'} · status: {a.status || '—'} · questions: {(a.questions || []).length} · total: {a.totalPoints ?? '—'}
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
