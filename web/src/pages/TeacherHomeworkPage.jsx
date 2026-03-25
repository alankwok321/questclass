import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  listHomeworkAssignments,
  createHomeworkAssignment,
  updateHomeworkAssignmentStatus,
  listClassrooms,
  listQuestionBank,
  getIdToken,
} from '../services/firebase.js';
import QuestionTypeBadge, { formatTypeLabel } from '../components/QuestionTypeBadge.jsx';
import QuestionPreview from '../components/QuestionPreview.jsx';

const EMPTY_FORM = { title: '', description: '', dueAt: '', classroomId: '' };

// Firestore rejects undefined values — strip them recursively before any write
function stripUndefined(obj) {
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)])
    );
  }
  return obj;
}

// ── Shared styles ──────────────────────────────────────────────────────────────
const btnPrimary = {
  border: 0, background: '#007AFF', color: '#fff',
  padding: '10px 18px', borderRadius: 999, fontWeight: 900, fontSize: 13,
  cursor: 'pointer', whiteSpace: 'nowrap',
};
const btnGhost = {
  border: '1px solid rgba(17,24,39,0.10)', background: '#F2F2F7', color: '#111827',
  padding: '10px 18px', borderRadius: 999, fontWeight: 900, fontSize: 13,
  cursor: 'pointer', whiteSpace: 'nowrap',
};
const inputStyle = {
  width: '100%', padding: '10px 14px',
  border: '1px solid rgba(17,24,39,0.10)', borderRadius: 14,
  fontSize: 14, fontWeight: 700, outline: 'none',
  background: '#F2F2F7', fontFamily: 'inherit', color: '#111827',
  boxSizing: 'border-box',
};
const labelStyle = {
  display: 'flex', flexDirection: 'column', gap: 6,
  fontSize: 13, fontWeight: 800, color: '#6B7280',
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function nowMinString() {
  const d = new Date();
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
}

// ── Question card (in assignment) ──────────────────────────────────────────────
function QuestionCard({ q, index, onRemove }) {
  const text = q.question_text || q.prompt || '';
  return (
    <div style={{
      background: '#F9FAFB', border: '1px solid rgba(17,24,39,0.08)',
      borderRadius: 16, padding: '12px 14px',
      display: 'flex', gap: 12, alignItems: 'flex-start',
    }}>
      <div style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 900, minWidth: 22, paddingTop: 3 }}>
        {index + 1}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <QuestionTypeBadge type={q.type} />
          <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 700 }}>{q.points || 1} 分</span>
          {q.topic && <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 700 }}>· {q.topic}</span>}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: text ? '#111827' : '#9CA3AF' }}>
          {text || '（未填寫題目）'}
        </div>
      </div>
      <button
        onClick={onRemove}
        style={{ ...btnGhost, padding: '4px 10px', fontSize: 16, lineHeight: 1, color: '#FF3B30' }}
      >×</button>
    </div>
  );
}

// ── Question Bank Picker Modal ─────────────────────────────────────────────────
function QuestionBankPicker({ classroomId, alreadyIds, onAdd, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [topic, setTopic] = useState('');
  const [type, setType] = useState('');
  const [level, setLevel] = useState('');
  const [previewId, setPreviewId] = useState(null);
  const [checked, setChecked] = useState({});

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    listQuestionBank(classroomId, 200).then(res => {
      if (!mounted) return;
      setItems(Array.isArray(res?.items) ? res.items : []);
    }).catch(() => {}).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [classroomId]);

  const filtered = useMemo(() => {
    const sq = search.trim().toLowerCase();
    const st = topic.trim().toLowerCase();
    const sy = type.trim().toUpperCase();
    const sl = level.trim().toUpperCase();
    return items.filter(it => {
      const text = (it.question_text || it.prompt || '').toLowerCase();
      if (sq && !text.includes(sq)) return false;
      if (st && !(it.topic || '').toLowerCase().includes(st)) return false;
      if (sy && String(it.type || '').toUpperCase() !== sy) return false;
      if (sl && String(it.target_level || '').toUpperCase() !== sl) return false;
      return true;
    });
  }, [items, search, topic, type, level]);

  const preview = filtered.find(it => it.id === previewId) || filtered[0] || null;

  const toggleAll = () => {
    const allChecked = filtered.every(it => checked[it.id]);
    const next = { ...checked };
    filtered.forEach(it => { next[it.id] = !allChecked; });
    setChecked(next);
  };

  const selectedItems = filtered.filter(it => checked[it.id]);

  function doAdd() {
    if (!selectedItems.length) return alert('請至少選擇一題');
    onAdd(selectedItems.map(it => stripUndefined({
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      type: it.type,
      topic: it.topic || '',
      points: it.points || 1,
      prompt: it.question_text || it.prompt || '',
      question_text: it.question_text || it.prompt || '',
      options: it.options,
      correct_answer: it.correct_answer,
      answer: it.answer,
      blanks: it.blanks,
      pairs: it.pairs,
      ideal_answer: it.ideal_answer,
      grading_rubric: it.grading_rubric,
      max_word_count: it.max_word_count,
      target_level: it.target_level,
      bankId: it.id,
    })));
    onClose();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: '#fff', borderRadius: 28, padding: 0,
        width: 900, maxWidth: '96vw', maxHeight: '90vh',
        boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
        border: '1px solid rgba(17,24,39,0.08)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(17,24,39,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 17 }}>從題庫選題</div>
            <div style={{ color: '#6B7280', fontWeight: 700, fontSize: 12, marginTop: 2 }}>
              已選 {selectedItems.length} 題
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={btnGhost}>取消</button>
            <button onClick={doAdd} style={btnPrimary} disabled={!selectedItems.length}>
              加入作業（{selectedItems.length}）
            </button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ padding: '12px 24px', borderBottom: '1px solid rgba(17,24,39,0.08)', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋題目…" style={{ ...inputStyle, padding: '8px 12px' }} />
          <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="主題篩選" style={{ ...inputStyle, padding: '8px 12px' }} />
          <select value={type} onChange={e => setType(e.target.value)} style={{ ...inputStyle, padding: '8px 12px' }}>
            <option value="">全部題型</option>
            <option value="TRUE_FALSE">是非題</option>
            <option value="MULTIPLE_CHOICE">選擇題</option>
            <option value="FILL_IN_BLANK">填空題</option>
            <option value="MATCHING">配對題</option>
            <option value="SHORT_ANSWER">簡答題</option>
            <option value="LONG_ANSWER">申論題</option>
          </select>
          <select value={level} onChange={e => setLevel(e.target.value)} style={{ ...inputStyle, padding: '8px 12px' }}>
            <option value="">全部年級</option>
            {['P1','P2','P3','P4','P5','P6','S1','S2','S3','S4','S5','S6'].map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <button onClick={toggleAll} style={{ ...btnGhost, padding: '8px 14px', fontSize: 12, whiteSpace: 'nowrap' }}>
            {filtered.length > 0 && filtered.every(it => checked[it.id]) ? '全不選' : '全選'}
          </button>
        </div>

        {/* Body: list + preview */}
        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '380px 1fr' }}>
          {/* List */}
          <div style={{ borderRight: '1px solid rgba(17,24,39,0.08)', overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: 24, color: '#9CA3AF', fontWeight: 700, textAlign: 'center' }}>載入中…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 24, color: '#9CA3AF', fontWeight: 700, textAlign: 'center' }}>
                {items.length === 0 ? '題庫暫無題目' : '篩選後無結果'}
              </div>
            ) : filtered.map(it => {
              const isChecked = Boolean(checked[it.id]);
              const isActive = preview?.id === it.id;
              const alreadyAdded = alreadyIds.has(it.id);
              return (
                <div
                  key={it.id}
                  onClick={() => setPreviewId(it.id)}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid rgba(17,24,39,0.06)',
                    borderLeft: isActive ? '4px solid #007AFF' : '4px solid transparent',
                    background: isActive ? 'rgba(0,122,255,0.06)' : 'transparent',
                    cursor: 'pointer',
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={e => { e.stopPropagation(); setChecked(c => ({ ...c, [it.id]: !isChecked })); }}
                    onClick={e => e.stopPropagation()}
                    style={{ marginTop: 3, accentColor: '#007AFF', flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 800, fontSize: 13, color: '#111827',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      opacity: alreadyAdded ? 0.5 : 1,
                    }}>
                      {it.question_text || it.prompt || '（無題目）'}
                      {alreadyAdded && <span style={{ marginLeft: 6, color: '#9CA3AF', fontSize: 11 }}>已加入</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                      <QuestionTypeBadge type={it.type} />
                      {it.topic && <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 700 }}>{it.topic}</span>}
                      {it.target_level && <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 700 }}>{it.target_level}</span>}
                      <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 700, marginLeft: 'auto' }}>{it.points || 1} 分</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Preview */}
          <div style={{ overflowY: 'auto', padding: '20px 24px' }}>
            {preview ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <QuestionTypeBadge type={preview.type} />
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 900, color: '#111827' }}>{preview.points || 1} 分</div>
                    {preview.target_level && <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 700, marginTop: 2 }}>{preview.target_level}</div>}
                  </div>
                </div>
                {preview.topic && (
                  <div style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 700, marginBottom: 8 }}>主題：{preview.topic}</div>
                )}
                <div style={{ fontWeight: 900, fontSize: 16, color: '#111827', lineHeight: 1.5, marginBottom: 12 }}>
                  {preview.question_text || preview.prompt || '（無題目）'}
                </div>
                <QuestionPreview q={preview} />
              </>
            ) : (
              <div style={{ color: '#9CA3AF', fontWeight: 700, textAlign: 'center', paddingTop: 60 }}>
                從左側選擇題目預覽
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AI Generate Modal ─────────────────────────────────────────────────────────
function AiModal({ form, onClose, onAdd }) {
  const [aiForm, setAiForm] = useState({ topic: form.title || '', count: 5, level: 'S1' });
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const token = await getIdToken();
      if (!token) { alert('請先登入才能使用 AI 功能'); return; }
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: token,
          topic: 'teacher-homework',
          mode: 'generate',
          format: 'json',
          studentName: 'teacher',
          message: `標題：${form.title}\n主題：${aiForm.topic || form.title}\n年級：${aiForm.level}\n題數：${aiForm.count}`,
          system: `你是一個老師助教。請產出「作業題目」JSON，輸出必須是純 JSON，不要 markdown。\n只能使用以下題型：TRUE_FALSE、MULTIPLE_CHOICE、SHORT_ANSWER、FILL_IN_BLANK\n依照香港學制（HK）調整難度，target_level: ${aiForm.level}\n輸出格式：{"questions":[{"type":"MULTIPLE_CHOICE","question_text":"題目","options":[{"id":"A","text":"選項A","is_correct":true},{"id":"B","text":"選項B","is_correct":false}],"points":1},{"type":"TRUE_FALSE","question_text":"陳述句","correct_answer":true,"points":1},{"type":"SHORT_ANSWER","question_text":"問題","ideal_answer":"參考答案","points":2}]}\n請產出 ${aiForm.count} 題。`,
        }),
      });
      const data = await res.json();
      const text = data.content || data.message || JSON.stringify(data);
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('AI 回應中找不到 JSON 格式');
      const parsed = JSON.parse(match[0]);
      const newQs = (parsed.questions || []).map((q, i) => stripUndefined({
        ...q,
        id: `q_${Date.now()}_${i}`,
        prompt: q.question_text || q.prompt || '',
      }));
      if (!newQs.length) throw new Error('未產生任何題目');
      onAdd(newQs);
      onClose();
    } catch (e) {
      alert('AI 產生失敗：' + e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: '#fff', borderRadius: 28, padding: 28,
        width: 420, maxWidth: '92vw',
        boxShadow: '0 24px 60px rgba(0,0,0,0.15)',
        border: '1px solid rgba(17,24,39,0.08)',
      }}>
        <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 4 }}>✨ AI 產生題目</div>
        <div style={{ color: '#6B7280', fontWeight: 700, fontSize: 13, marginBottom: 22 }}>
          輸入主題，AI 將自動生成適合的作業題目
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          <label style={labelStyle}>
            主題 / 科目
            <input style={inputStyle} value={aiForm.topic}
              onChange={e => setAiForm(f => ({ ...f, topic: e.target.value }))}
              placeholder={form.title || '例如：分數、二次大戰…'} />
          </label>
          <label style={labelStyle}>
            題目數量：<strong style={{ color: '#111827' }}>{aiForm.count} 題</strong>
            <input type="range" min="1" max="20" value={aiForm.count}
              onChange={e => setAiForm(f => ({ ...f, count: Number(e.target.value) }))}
              style={{ width: '100%', marginTop: 4, accentColor: '#007AFF' }} />
          </label>
          <label style={labelStyle}>
            年級程度
            <select style={inputStyle} value={aiForm.level} onChange={e => setAiForm(f => ({ ...f, level: e.target.value }))}>
              {['P1','P2','P3','P4','P5','P6','S1','S2','S3','S4','S5','S6'].map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ marginTop: 24, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnGhost} disabled={loading}>取消</button>
          <button onClick={generate} style={{ ...btnPrimary, background: '#7C3AED' }} disabled={loading}>
            {loading ? '產生中…' : '產生題目'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TeacherHomeworkPage() {
  const [view, setView] = useState('list');
  const [tab, setTab] = useState('published');
  const [assignments, setAssignments] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [questions, setQuestions] = useState([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [hwRes, clsRes] = await Promise.all([
        listHomeworkAssignments(null, 100),
        listClassrooms(),
      ]);
      setAssignments(Array.isArray(hwRes?.items) ? hwRes.items : []);
      setClassrooms(Array.isArray(clsRes?.classrooms) ? clsRes.classrooms : []);
    } catch (e) {
      console.error('載入失敗：', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const byTab = {
    published: assignments.filter(a => a.status === 'published'),
    draft:     assignments.filter(a => a.status === 'draft'),
    archived:  assignments.filter(a => a.status === 'archived'),
  };

  function openNew() {
    setEditId(null); setForm(EMPTY_FORM); setQuestions([]); setView('edit');
  }
  function openEdit(a) {
    setEditId(a.id);
    setForm({
      title: a.title || '',
      description: a.description || '',
      dueAt: a.dueAt ? a.dueAt.substring(0, 16) : '',
      classroomId: a.classroomId || '',
    });
    setQuestions(Array.isArray(a.questions) ? a.questions : []);
    setView('edit');
  }

  async function save(status) {
    if (!form.title.trim()) return alert('請輸入作業標題。');
    if (!form.classroomId) return alert('請選擇班級。');
    if (form.dueAt && form.dueAt < nowMinString()) return alert('截止日期不能早於現在。');
    setSaving(true);
    try {
      const payload = stripUndefined({ ...form, status, questions, ...(editId ? { id: editId } : {}) });
      const res = await createHomeworkAssignment(payload);
      if (!res?.ok) return alert(res?.error || '儲存失敗');
      await load();
      setView('list');
      setTab(status === 'published' ? 'published' : 'draft');
    } catch (e) {
      alert('儲存失敗：' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(assignmentId, status) {
    try {
      const res = await updateHomeworkAssignmentStatus({ assignmentId, status });
      if (!res?.ok) return alert(res?.error || '更新失敗');
      await load();
    } catch (e) {
      alert('更新失敗：' + e.message);
    }
  }

  const totalPts = questions.reduce((s, q) => s + (Number(q.points) || 1), 0);
  const selectedClass = classrooms.find(c => c.id === form.classroomId);
  const addedBankIds = useMemo(() => new Set(questions.map(q => q.bankId).filter(Boolean)), [questions]);

  // ── LIST VIEW ──────────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div style={{ display: 'grid', gap: 20 }}>
        <div className="qcCard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '18px 24px' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16, color: '#111827' }}>出作業</div>
            <div style={{ color: '#6B7280', fontWeight: 700, fontSize: 12, marginTop: 2 }}>建立及管理班級作業</div>
          </div>
          <button onClick={openNew} style={btnPrimary}>＋ 新增作業</button>
        </div>

        <div className="qcCard" style={{ padding: '18px 24px' }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid rgba(17,24,39,0.08)' }}>
            {[
              { key: 'published', label: '已指派' },
              { key: 'draft',     label: '草稿' },
              { key: 'archived',  label: '已封存' },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: tab === t.key ? 900 : 700,
                color: tab === t.key ? '#007AFF' : '#6B7280',
                borderBottom: `2px solid ${tab === t.key ? '#007AFF' : 'transparent'}`,
                marginBottom: -1, transition: 'all 150ms',
              }}>
                {t.label}
                <span style={{
                  marginLeft: 6,
                  background: tab === t.key ? 'rgba(0,122,255,0.12)' : 'rgba(17,24,39,0.06)',
                  color: tab === t.key ? '#007AFF' : '#6B7280',
                  borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 900,
                }}>{byTab[t.key].length}</span>
              </button>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
              <button onClick={load} disabled={loading} style={{ ...btnGhost, padding: '6px 14px', fontSize: 12 }}>
                {loading ? '載入中…' : '重新整理'}
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#9CA3AF', fontWeight: 700 }}>載入中…</div>
          ) : byTab[tab].length === 0 ? (
            <div style={{ textAlign: 'center', padding: '56px 0', color: '#9CA3AF' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>目前沒有作業</div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                {tab === 'draft' ? '點擊右上角「新增作業」開始建立' :
                 tab === 'published' ? '指派作業後會顯示在這裡' : '封存的作業會顯示在這裡'}
              </div>
              {tab === 'draft' && <button onClick={openNew} style={{ ...btnPrimary, marginTop: 16 }}>新增作業</button>}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {byTab[tab].map(a => {
                const room = classrooms.find(c => c.id === a.classroomId);
                return (
                  <div key={a.id} style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 16px', borderRadius: 18,
                    border: '1px solid rgba(17,24,39,0.08)', background: '#F9FAFB',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 4, color: '#111827' }}>
                        {a.title || '（未命名作業）'}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {room && <span>🏫 {room.name || room.id}</span>}
                        {a.dueAt && <span>📅 截止：{new Date(a.dueAt).toLocaleDateString('zh-HK')}</span>}
                        {a.questions?.length > 0 && <span>❓ {a.questions.length} 題</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button onClick={() => openEdit(a)} style={btnGhost}>編輯</button>
                      {a.status === 'draft' && <button onClick={() => changeStatus(a.id, 'published')} style={btnPrimary}>指派</button>}
                      {a.status === 'published' && <button onClick={() => changeStatus(a.id, 'archived')} style={btnGhost}>封存</button>}
                      {a.status === 'archived' && <button onClick={() => changeStatus(a.id, 'draft')} style={btnGhost}>還原</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── EDIT VIEW ─────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <button onClick={() => setView('list')} style={btnGhost}>← 返回清單</button>
      </div>

      <div className="qcCard" style={{ padding: '24px 28px' }}>
        <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 4, color: '#111827' }}>
          {editId ? '編輯作業' : '新增作業'}
        </div>
        <div style={{ color: '#6B7280', fontWeight: 700, fontSize: 13, marginBottom: 24 }}>
          填寫作業內容，完成後可儲存草稿或直接指派給學生
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <label style={labelStyle}>
            標題 *
            <input style={inputStyle} value={form.title}
              placeholder="例如：第三章閱讀理解"
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </label>

          <label style={labelStyle}>
            學生說明
            <textarea style={{ ...inputStyle, height: 88, resize: 'vertical' }} value={form.description}
              placeholder="描述學生需要完成的任務…"
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <label style={labelStyle}>
              班級 *
              <select style={inputStyle} value={form.classroomId}
                onChange={e => setForm(f => ({ ...f, classroomId: e.target.value }))}>
                <option value="">選擇班級…</option>
                {classrooms.map(c => <option key={c.id} value={c.id}>{c.name || c.id}</option>)}
              </select>
            </label>

            <label style={labelStyle}>
              截止日期與時間
              <input type="datetime-local" style={inputStyle} value={form.dueAt}
                min={nowMinString()}
                onChange={e => setForm(f => ({ ...f, dueAt: e.target.value }))} />
            </label>
          </div>
        </div>

        <div style={{ borderTop: '1px solid rgba(17,24,39,0.08)', margin: '24px 0' }} />

        {/* Questions header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 15, color: '#111827' }}>
            題目
            {questions.length > 0 && (
              <span style={{ marginLeft: 8, color: '#6B7280', fontWeight: 700, fontSize: 13 }}>
                共 {questions.length} 題 · {totalPts} 分
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                if (!form.classroomId) return alert('請先選擇班級才能開啟題庫');
                setBankOpen(true);
              }}
              style={btnGhost}
            >
              📚 從題庫選題
            </button>
            <button
              onClick={() => setQuestions(prev => [...prev, {
                id: `q_${Date.now()}`, type: 'SHORT_ANSWER', prompt: '', question_text: '', answer: '', points: 1,
              }])}
              style={btnGhost}
            >
              ＋ 手動新增
            </button>
            <button onClick={() => setAiOpen(true)} style={{ ...btnPrimary, background: '#7C3AED' }}>
              ✨ AI 產生題目
            </button>
          </div>
        </div>

        {/* Questions list */}
        {questions.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '40px 0', background: '#F9FAFB',
            borderRadius: 18, border: '2px dashed rgba(17,24,39,0.10)', color: '#9CA3AF',
          }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📝</div>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4, color: '#6B7280' }}>尚未新增題目</div>
            <div style={{ fontWeight: 700, fontSize: 12 }}>從題庫選題、AI 產生，或手動新增</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {questions.map((q, i) => (
              <QuestionCard key={q.id || i} q={q} index={i}
                onRemove={() => setQuestions(prev => prev.filter((_, idx) => idx !== i))} />
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{
          marginTop: 24, paddingTop: 18, borderTop: '1px solid rgba(17,24,39,0.08)',
          display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap',
        }}>
          {selectedClass && (
            <span style={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF', marginRight: 'auto' }}>
              指派至：<strong style={{ color: '#111827' }}>{selectedClass.name || selectedClass.id}</strong>
            </span>
          )}
          <button onClick={() => setView('list')} style={btnGhost} disabled={saving}>取消</button>
          <button onClick={() => save('draft')} style={btnGhost} disabled={saving}>
            {saving ? '儲存中…' : '儲存草稿'}
          </button>
          <button onClick={() => save('published')} style={btnPrimary} disabled={saving}>
            {saving ? '處理中…' : '立即指派'}
          </button>
        </div>
      </div>

      {/* Modals */}
      {bankOpen && (
        <QuestionBankPicker
          classroomId={form.classroomId}
          alreadyIds={addedBankIds}
          onAdd={qs => setQuestions(prev => [...prev, ...qs])}
          onClose={() => setBankOpen(false)}
        />
      )}
      {aiOpen && (
        <AiModal form={form} onClose={() => setAiOpen(false)}
          onAdd={newQs => setQuestions(prev => [...prev, ...newQs])} />
      )}
    </div>
  );
}
