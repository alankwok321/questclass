import React, { useState, useEffect, useCallback } from 'react';
import {
  listHomeworkAssignments,
  createHomeworkAssignment,
  updateHomeworkAssignmentStatus,
  listClassrooms,
  getIdToken,
} from '../services/firebase.js';

const EMPTY_FORM = { title: '', description: '', dueAt: '', classroomId: '' };

const TYPE_LABELS = {
  TRUE_FALSE: 'T/F',
  MULTIPLE_CHOICE: 'MC',
  FILL_IN_BLANK: 'Fill',
  SHORT_ANSWER: 'Short',
  LONG_ANSWER: 'Long',
  true_false: 'T/F',
  multiple_choice: 'MC',
  numeric: 'Num',
  short_text: 'Short',
};

// ─── Shared styles ────────────────────────────────────────────────────────────
const ghostBtn = {
  padding: '7px 16px', border: '1px solid #D1D5DB', borderRadius: 7,
  background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#374151',
};
const primaryBtn = {
  padding: '7px 16px', border: 'none', borderRadius: 7,
  background: '#2563EB', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#fff',
};
const purpleBtn = {
  ...primaryBtn, background: '#7C3AED',
};
const labelStyle = {
  display: 'flex', flexDirection: 'column', gap: 5,
  fontSize: 13, fontWeight: 600, color: '#374151',
};
const inputStyle = {
  padding: '8px 11px', border: '1px solid #D1D5DB', borderRadius: 7,
  fontSize: 14, outline: 'none', background: '#fff', fontFamily: 'inherit', color: '#111827',
};

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    draft:     { bg: '#FEF3C7', color: '#92400E', label: 'Draft' },
    published: { bg: '#D1FAE5', color: '#065F46', label: 'Assigned' },
    archived:  { bg: '#F3F4F6', color: '#6B7280', label: 'Archived' },
  };
  const s = map[status] || map.draft;
  return (
    <span style={{ background: s.bg, color: s.color, borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
      {s.label}
    </span>
  );
}

// ─── Question card (read-only) ─────────────────────────────────────────────────
function QuestionCard({ q, index, onRemove }) {
  return (
    <div style={{
      background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8,
      padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'flex-start',
    }}>
      <div style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 700, minWidth: 20, paddingTop: 3 }}>
        {index + 1}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 5, alignItems: 'center' }}>
          <span style={{
            background: '#EDE9FE', color: '#7C3AED', borderRadius: 4,
            padding: '1px 7px', fontSize: 11, fontWeight: 700,
          }}>
            {TYPE_LABELS[q.type] || q.type}
          </span>
          <span style={{ fontSize: 11, color: '#9CA3AF' }}>
            {q.points || 1} pt{(q.points || 1) !== 1 ? 's' : ''}
          </span>
        </div>
        <div style={{ fontSize: 13, color: q.prompt ? '#111827' : '#9CA3AF' }}>
          {q.prompt || '(no question text)'}
        </div>
        {q.options && (
          <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {q.options.map((opt, i) => (
              <span key={i} style={{
                background: opt === q.answer ? '#D1FAE5' : '#F3F4F6',
                color: opt === q.answer ? '#065F46' : '#374151',
                borderRadius: 4, padding: '2px 8px', fontSize: 11,
              }}>
                {opt}
              </span>
            ))}
          </div>
        )}
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 18, padding: '0 4px', lineHeight: 1 }}
        >
          ×
        </button>
      )}
    </div>
  );
}

// ─── AI Generate Modal ─────────────────────────────────────────────────────────
function AiModal({ form, onClose, onAdd }) {
  const [aiForm, setAiForm] = useState({ topic: form.title || '', count: 5, level: 'S1' });
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: token,
          topic: 'teacher-homework',
          mode: 'generate',
          format: 'json',
          messages: [{
            role: 'user',
            content: `Create ${aiForm.count} homework questions about "${aiForm.topic || form.title}" for a ${aiForm.level} level class. Assignment title: "${form.title}".`,
          }],
          systemOverride: `You are a Hong Kong school teacher creating homework questions for level ${aiForm.level}.
Return ONLY valid JSON in this exact format, no other text:
{"questions":[
  {"type":"MULTIPLE_CHOICE","prompt":"Question text?","options":["A","B","C","D"],"answer":"A","points":1},
  {"type":"TRUE_FALSE","prompt":"Statement is true or false?","answer":true,"points":1},
  {"type":"SHORT_ANSWER","prompt":"Question?","answer":"Expected answer","points":2}
]}
Available types: TRUE_FALSE, MULTIPLE_CHOICE, SHORT_ANSWER, FILL_IN_BLANK`,
        }),
      });
      const data = await res.json();
      const text = data.content || data.message || '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('No JSON found in AI response');
      const parsed = JSON.parse(match[0]);
      const newQs = (parsed.questions || []).map((q, i) => ({
        ...q,
        id: `q_${Date.now()}_${i}`,
      }));
      if (!newQs.length) throw new Error('No questions generated');
      onAdd(newQs);
      onClose();
    } catch (e) {
      alert('AI generation failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: '#fff', borderRadius: 14, padding: 28,
        width: 400, maxWidth: '92vw', boxShadow: '0 24px 60px rgba(0,0,0,0.2)',
      }}>
        <h3 style={{ margin: '0 0 20px', fontWeight: 800, fontSize: 17 }}>✨ AI Generate Questions</h3>

        <div style={{ display: 'grid', gap: 14 }}>
          <label style={labelStyle}>
            Topic / Subject
            <input
              style={inputStyle}
              value={aiForm.topic}
              onChange={e => setAiForm(f => ({ ...f, topic: e.target.value }))}
              placeholder={form.title || 'e.g. Fractions, World War II…'}
            />
          </label>

          <label style={labelStyle}>
            Number of questions: <strong>{aiForm.count}</strong>
            <input
              type="range" min="1" max="20"
              value={aiForm.count}
              onChange={e => setAiForm(f => ({ ...f, count: Number(e.target.value) }))}
              style={{ width: '100%', marginTop: 4 }}
            />
          </label>

          <label style={labelStyle}>
            Grade Level
            <select style={inputStyle} value={aiForm.level} onChange={e => setAiForm(f => ({ ...f, level: e.target.value }))}>
              {['P1','P2','P3','P4','P5','P6','S1','S2','S3','S4','S5','S6'].map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ marginTop: 24, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={ghostBtn} disabled={loading}>Cancel</button>
          <button onClick={generate} style={purpleBtn} disabled={loading}>
            {loading ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function TeacherHomeworkPage() {
  const [view, setView] = useState('list'); // 'list' | 'edit'
  const [tab, setTab] = useState('published');
  const [assignments, setAssignments] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [questions, setQuestions] = useState([]);
  const [aiOpen, setAiOpen] = useState(false);

  // Load
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [hw, cls] = await Promise.all([
        listHomeworkAssignments(null, 100),
        listClassrooms(),
      ]);
      setAssignments(hw || []);
      setClassrooms(cls || []);
    } catch (e) {
      console.error('Load error:', e);
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
    setEditId(null);
    setForm(EMPTY_FORM);
    setQuestions([]);
    setView('edit');
  }

  function openEdit(a) {
    setEditId(a.id);
    setForm({
      title: a.title || '',
      description: a.description || '',
      dueAt: a.dueAt ? a.dueAt.substring(0, 16) : '',
      classroomId: a.classroomId || '',
    });
    setQuestions(a.questions || []);
    setView('edit');
  }

  async function save(status) {
    if (!form.title.trim()) return alert('Please enter a title.');
    if (!form.classroomId) return alert('Please select a classroom.');
    setSaving(true);
    try {
      await createHomeworkAssignment({ ...form, status, questions, id: editId || undefined });
      await load();
      setView('list');
      setTab(status === 'published' ? 'published' : 'draft');
    } catch (e) {
      alert('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(id, status) {
    try {
      await updateHomeworkAssignmentStatus({ id, status });
      await load();
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }

  const totalPts = questions.reduce((s, q) => s + (Number(q.points) || 1), 0);
  const cls = classrooms.find(c => c.id === form.classroomId);

  // ── LIST VIEW ──────────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div style={{ maxWidth: 860, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Homework</h2>
            <div style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>
              Create and manage assignments for your classes
            </div>
          </div>
          <button onClick={openNew} style={primaryBtn}>＋ New Assignment</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '2px solid #E5E7EB' }}>
          {[
            { key: 'published', label: 'Assigned' },
            { key: 'draft',     label: 'Drafts' },
            { key: 'archived',  label: 'Archived' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '9px 18px', border: 'none', background: 'none',
                cursor: 'pointer', fontSize: 14,
                fontWeight: tab === t.key ? 700 : 500,
                color: tab === t.key ? '#2563EB' : '#6B7280',
                borderBottom: `2px solid ${tab === t.key ? '#2563EB' : 'transparent'}`,
                marginBottom: -2,
              }}
            >
              {t.label}
              <span style={{
                marginLeft: 7, background: '#F3F4F6', borderRadius: 10,
                padding: '1px 7px', fontSize: 11, color: '#374151',
              }}>
                {byTab[t.key].length}
              </span>
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9CA3AF' }}>Loading…</div>
        ) : byTab[tab].length === 0 ? (
          <div style={{ textAlign: 'center', padding: 70, color: '#9CA3AF' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>📋</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>No assignments here yet</div>
            {tab === 'draft' && (
              <button onClick={openNew} style={{ ...primaryBtn, marginTop: 14 }}>
                Create your first assignment
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {byTab[tab].map(a => {
              const room = classrooms.find(c => c.id === a.classroomId);
              return (
                <div
                  key={a.id}
                  className="card"
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 5 }}>{a.title}</div>
                    <div style={{ fontSize: 12, color: '#6B7280', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {room && <span>🏫 {room.name}</span>}
                      {a.dueAt && <span>📅 Due {new Date(a.dueAt).toLocaleDateString()}</span>}
                      {a.questions?.length > 0 && <span>❓ {a.questions.length} question{a.questions.length !== 1 ? 's' : ''}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                    <button onClick={() => openEdit(a)} style={ghostBtn}>Edit</button>
                    {a.status === 'draft' && (
                      <button onClick={() => changeStatus(a.id, 'published')} style={primaryBtn}>Assign</button>
                    )}
                    {a.status === 'published' && (
                      <button onClick={() => changeStatus(a.id, 'archived')} style={ghostBtn}>Archive</button>
                    )}
                    {a.status === 'archived' && (
                      <button onClick={() => changeStatus(a.id, 'draft')} style={ghostBtn}>Restore</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── EDIT VIEW ─────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      {/* Back */}
      <button onClick={() => setView('list')} style={{ ...ghostBtn, marginBottom: 20 }}>
        ← Back to list
      </button>

      <div className="card" style={{ padding: 28 }}>
        <h3 style={{ margin: '0 0 24px', fontWeight: 800, fontSize: 18 }}>
          {editId ? 'Edit Assignment' : 'New Assignment'}
        </h3>

        {/* Assignment details */}
        <div style={{ display: 'grid', gap: 16 }}>
          <label style={labelStyle}>
            Title *
            <input
              style={inputStyle}
              value={form.title}
              placeholder="e.g. Chapter 3 Reading Comprehension"
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />
          </label>

          <label style={labelStyle}>
            Instructions for students
            <textarea
              style={{ ...inputStyle, height: 80, resize: 'vertical' }}
              value={form.description}
              placeholder="Describe what students need to do…"
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <label style={labelStyle}>
              Classroom *
              <select
                style={inputStyle}
                value={form.classroomId}
                onChange={e => setForm(f => ({ ...f, classroomId: e.target.value }))}
              >
                <option value="">Select a classroom…</option>
                {classrooms.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>

            <label style={labelStyle}>
              Due Date &amp; Time
              <input
                type="datetime-local"
                style={inputStyle}
                value={form.dueAt}
                onChange={e => setForm(f => ({ ...f, dueAt: e.target.value }))}
              />
            </label>
          </div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid #E5E7EB', margin: '28px 0 20px' }} />

        {/* Questions header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            Questions
            {questions.length > 0 && (
              <span style={{ marginLeft: 8, color: '#6B7280', fontWeight: 400, fontSize: 13 }}>
                {questions.length} question{questions.length !== 1 ? 's' : ''} · {totalPts} pts total
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setQuestions(prev => [...prev, {
                id: `q_${Date.now()}`, type: 'SHORT_ANSWER', prompt: '', answer: '', points: 1,
              }])}
              style={ghostBtn}
            >
              ＋ Add manually
            </button>
            <button onClick={() => setAiOpen(true)} style={purpleBtn}>
              ✨ AI Generate
            </button>
          </div>
        </div>

        {/* Questions list */}
        {questions.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '36px 0', color: '#9CA3AF',
            background: '#F9FAFB', borderRadius: 8, border: '2px dashed #E5E7EB',
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📝</div>
            <div style={{ fontWeight: 500, marginBottom: 4 }}>No questions yet</div>
            <div style={{ fontSize: 12 }}>Use AI Generate for instant questions, or add them manually</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {questions.map((q, i) => (
              <QuestionCard
                key={q.id || i}
                q={q}
                index={i}
                onRemove={() => setQuestions(prev => prev.filter((_, idx) => idx !== i))}
              />
            ))}
          </div>
        )}

        {/* Footer actions */}
        <div style={{
          marginTop: 28, paddingTop: 18, borderTop: '1px solid #E5E7EB',
          display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center',
        }}>
          {cls && (
            <span style={{ fontSize: 12, color: '#9CA3AF', marginRight: 'auto' }}>
              Assigning to: <strong style={{ color: '#374151' }}>{cls.name}</strong>
            </span>
          )}
          <button onClick={() => setView('list')} style={ghostBtn} disabled={saving}>Cancel</button>
          <button onClick={() => save('draft')} style={ghostBtn} disabled={saving}>
            {saving ? 'Saving…' : 'Save as Draft'}
          </button>
          <button onClick={() => save('published')} style={primaryBtn} disabled={saving}>
            {saving ? 'Saving…' : 'Assign Now'}
          </button>
        </div>
      </div>

      {/* AI Modal */}
      {aiOpen && (
        <AiModal
          form={form}
          onClose={() => setAiOpen(false)}
          onAdd={newQs => setQuestions(prev => [...prev, ...newQs])}
        />
      )}
    </div>
  );
}
