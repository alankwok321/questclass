import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { listMyHomework, listMySubmissions, submitHomework } from '../services/firebase.js';
import QuestionTypeBadge from '../components/QuestionTypeBadge.jsx';

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

// ── Answer input (editable) ───────────────────────────────────────────────────
function AnswerInput({ q, value, onChange }) {
  const type = (q?.type || '').toUpperCase();

  if (type === 'MULTIPLE_CHOICE') {
    const options = q?.options || [];
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        {options.map((c) => {
          const id = c.id || c.value;
          const isSelected = value === id;
          return (
            <button key={id} type="button" onClick={() => onChange(id)} style={{
              textAlign: 'left', padding: '10px 14px', borderRadius: 12,
              border: isSelected ? '2px solid #007AFF' : '1px solid rgba(17,24,39,0.10)',
              background: isSelected ? 'rgba(0,122,255,0.08)' : '#fff',
              cursor: 'pointer', fontWeight: 800, fontSize: 14, color: '#111827',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: 999, flexShrink: 0,
                border: isSelected ? '2px solid #007AFF' : '2px solid rgba(17,24,39,0.15)',
                background: isSelected ? '#007AFF' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {isSelected && <span style={{ width: 8, height: 8, borderRadius: 999, background: '#fff', display: 'block' }} />}
              </span>
              <span><strong>{id}.</strong> {c.text}</span>
            </button>
          );
        })}
      </div>
    );
  }

  if (type === 'TRUE_FALSE') {
    return (
      <div style={{ display: 'flex', gap: 10 }}>
        {[{ label: '✓ 正確 (True)', val: true }, { label: '✗ 錯誤 (False)', val: false }].map(({ label, val }) => {
          const isSelected = value === val;
          return (
            <button key={String(val)} type="button" onClick={() => onChange(val)} style={{
              ...btnGhost,
              background: isSelected ? (val ? 'rgba(52,199,89,0.12)' : 'rgba(255,59,48,0.10)') : '#F2F2F7',
              border: isSelected ? `2px solid ${val ? '#34C759' : '#FF3B30'}` : '1px solid rgba(17,24,39,0.10)',
              color: isSelected ? (val ? '#15803D' : '#B91C1C') : '#111827',
            }}>{label}</button>
          );
        })}
      </div>
    );
  }

  if (type === 'FILL_IN_BLANK') {
    return <input style={inputStyle} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder="填入答案…" />;
  }

  return (
    <textarea value={value ?? ''} onChange={e => onChange(e.target.value)}
      style={{ ...inputStyle, minHeight: type === 'LONG_ANSWER' ? 140 : 90, resize: 'vertical' }}
      placeholder="輸入你的答案…" />
  );
}

// ── Read-only submitted answer display ────────────────────────────────────────
function SubmittedAnswer({ q, submittedAnswers }) {
  const type = (q?.type || '').toUpperCase();
  const ans = (submittedAnswers || []).find(a => a.questionId === q.id);
  const val = ans?.value;

  if (val == null || val === '') {
    return <span style={{ color: '#9CA3AF', fontWeight: 700, fontSize: 13 }}>（未作答）</span>;
  }

  if (type === 'TRUE_FALSE') {
    return (
      <span style={{ fontWeight: 800, fontSize: 13, color: val ? '#15803D' : '#B91C1C' }}>
        {val ? '✓ 正確 (True)' : '✗ 錯誤 (False)'}
      </span>
    );
  }

  if (type === 'MULTIPLE_CHOICE') {
    const opts = q?.options || [];
    const chosen = opts.find(o => o.id === val || o.value === val);
    return (
      <span style={{ fontWeight: 800, fontSize: 13, color: '#111827' }}>
        {chosen ? `${chosen.id}. ${chosen.text}` : String(val)}
      </span>
    );
  }

  return <span style={{ fontWeight: 700, fontSize: 13, color: '#111827', whiteSpace: 'pre-wrap' }}>{String(val)}</span>;
}

// ── Single question card ──────────────────────────────────────────────────────
function QuestionCard({ q, index, value, onChange }) {
  const text = q.question_text || q.prompt || '';
  return (
    <div style={{ background: '#F9FAFB', border: '1px solid rgba(17,24,39,0.08)', borderRadius: 16, padding: '16px 18px' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 900, minWidth: 22, paddingTop: 2 }}>{index + 1}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <QuestionTypeBadge type={q.type} />
            <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 700 }}>{q.points || 1} 分</span>
            {q.topic && <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 700 }}>· {q.topic}</span>}
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: text ? '#111827' : '#9CA3AF', lineHeight: 1.5 }}>
            {text || '（未填寫題目）'}
          </div>
        </div>
      </div>
      <div style={{ paddingLeft: 32 }}>
        <div style={{ fontWeight: 800, fontSize: 12, color: '#6B7280', marginBottom: 8 }}>你的答案</div>
        <AnswerInput q={q} value={value} onChange={onChange} />
      </div>
    </div>
  );
}

// ── Completed assignment detail (read-only) ───────────────────────────────────
function CompletedDetail({ assignment, submission, onBack }) {
  const questions = Array.isArray(assignment.questions) ? assignment.questions : [];
  const submittedAt = submission?.submittedAt
    ? new Date(submission.submittedAt).toLocaleString('zh-HK')
    : '—';

  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div><button onClick={onBack} style={btnGhost}>← 返回作業清單</button></div>

      <div className="qcCard" style={{ padding: '24px 28px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
          <div style={{ fontWeight: 900, fontSize: 18, color: '#111827' }}>{assignment.title || '作業'}</div>
          <span style={{
            background: 'rgba(52,199,89,0.12)', color: '#15803D',
            borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 900,
          }}>✓ 已完成</span>
        </div>
        {assignment.description && (
          <div style={{ color: '#6B7280', fontWeight: 700, fontSize: 14, lineHeight: 1.7, marginBottom: 8 }}>
            {assignment.description}
          </div>
        )}
        <div style={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF' }}>
          提交時間：{submittedAt}
        </div>

        <div style={{ borderTop: '1px solid rgba(17,24,39,0.08)', margin: '20px 0' }} />

        {/* Submitted answers */}
        {questions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#9CA3AF' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📝</div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>這份作業沒有題目</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {questions.map((q, idx) => {
              const text = q.question_text || q.prompt || '';
              return (
                <div key={q.id || idx} style={{
                  background: '#F9FAFB', border: '1px solid rgba(17,24,39,0.08)',
                  borderRadius: 16, padding: '16px 18px',
                }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
                    <div style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 900, minWidth: 22, paddingTop: 2 }}>{idx + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <QuestionTypeBadge type={q.type} />
                        <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 700 }}>{q.points || 1} 分</span>
                        {q.topic && <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 700 }}>· {q.topic}</span>}
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#111827', lineHeight: 1.5 }}>
                        {text || '（未填寫題目）'}
                      </div>
                    </div>
                  </div>
                  <div style={{ paddingLeft: 32 }}>
                    <div style={{ fontWeight: 800, fontSize: 12, color: '#6B7280', marginBottom: 6 }}>你的答案</div>
                    <SubmittedAnswer q={q} submittedAnswers={submission?.answers} />
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

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function StudentHomework() {
  const [view, setView] = useState('list');      // 'list' | 'answer' | 'review'
  const [items, setItems] = useState([]);
  const [mySubmissions, setMySubmissions] = useState({}); // assignmentId → submission
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [tab, setTab] = useState('active');

  const questions = useMemo(() => selected?.questions || [], [selected]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [hwRes, subRes] = await Promise.all([
        listMyHomework(50),
        listMySubmissions(100),
      ]);
      if (hwRes?.ok) setItems(hwRes.items || []);
      if (subRes?.ok) {
        const map = {};
        (subRes.submissions || []).forEach(s => { if (s.assignmentId) map[s.assignmentId] = s; });
        setMySubmissions(map);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const now = new Date();
  const byTab = useMemo(() => ({
    active: items.filter(a => !mySubmissions[a.id] && (!a.dueAt || new Date(a.dueAt) >= now)),
    done:   items.filter(a => Boolean(mySubmissions[a.id])),
    overdue: items.filter(a => !mySubmissions[a.id] && a.dueAt && new Date(a.dueAt) < now),
  }), [items, mySubmissions, now]);

  function openAnswer(a) {
    setSelected(a);
    setAnswers({});
    setSubmitted(false);
    setView('answer');
  }

  function openReview(a) {
    setSelected(a);
    setView('review');
  }

  async function onSubmit() {
    if (!selected?.id) return;
    const unanswered = questions.filter(q => answers[q.id] == null || answers[q.id] === '');
    if (unanswered.length > 0) {
      if (!window.confirm(`還有 ${unanswered.length} 題未作答，確定要送出嗎？`)) return;
    }
    setSubmitting(true);
    try {
      const payloadAnswers = questions.map(q => ({
        questionId: q.id,
        value: answers[q.id] ?? null,
      }));
      const res = await submitHomework({ assignmentId: selected.id, answers: payloadAnswers });
      if (res?.ok) {
        setSubmitted(true);
        // Refresh submissions map
        load();
      } else {
        alert(res?.error || '送出失敗');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const answeredCount = questions.filter(q => answers[q.id] != null && answers[q.id] !== '').length;
  const totalPts = questions.reduce((s, q) => s + (Number(q.points) || 1), 0);

  // ── REVIEW VIEW (read-only completed assignment) ────────────────────────────
  if (view === 'review' && selected) {
    return (
      <CompletedDetail
        assignment={selected}
        submission={mySubmissions[selected.id]}
        onBack={() => setView('list')}
      />
    );
  }

  // ── ANSWER VIEW (submitting) ────────────────────────────────────────────────
  if (view === 'answer') {
    return (
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <div><button onClick={() => setView('list')} style={btnGhost}>← 返回作業清單</button></div>

        <div className="qcCard" style={{ padding: '24px 28px' }}>
          <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 4, color: '#111827' }}>
            {selected?.title || '作業'}
          </div>
          {selected?.description && (
            <div style={{ color: '#6B7280', fontWeight: 700, fontSize: 14, lineHeight: 1.7, marginBottom: 8 }}>
              {selected.description}
            </div>
          )}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 4 }}>
            {selected?.dueAt && (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#6B7280' }}>
                📅 截止：{new Date(selected.dueAt).toLocaleDateString('zh-HK', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {questions.length > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#6B7280' }}>❓ 共 {questions.length} 題 · {totalPts} 分</span>
            )}
          </div>

          <div style={{ borderTop: '1px solid rgba(17,24,39,0.08)', margin: '20px 0' }} />

          {submitted ? (
            <div style={{
              textAlign: 'center', padding: '48px 0',
              background: 'rgba(52,199,89,0.06)', borderRadius: 18,
              border: '1px solid rgba(52,199,89,0.20)',
            }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <div style={{ fontWeight: 900, fontSize: 18, color: '#15803D', marginBottom: 4 }}>作業已送出！</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#6B7280', marginBottom: 20 }}>
                老師批改後結果會顯示在這裡
              </div>
              <button onClick={() => { setTab('done'); setView('list'); }} style={btnPrimary}>查看已完成作業</button>
            </div>
          ) : questions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#9CA3AF' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📝</div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>這份作業沒有題目</div>
            </div>
          ) : (
            <>
              {/* Progress bar */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#6B7280' }}>作答進度</span>
                  <span style={{ fontSize: 13, fontWeight: 900, color: answeredCount === questions.length ? '#34C759' : '#007AFF' }}>
                    {answeredCount} / {questions.length} 題
                  </span>
                </div>
                <div style={{ height: 6, background: 'rgba(17,24,39,0.06)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 999,
                    background: answeredCount === questions.length ? '#34C759' : '#007AFF',
                    width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%`,
                    transition: 'width 300ms ease',
                  }} />
                </div>
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                {questions.map((q, idx) => (
                  <QuestionCard key={q.id || idx} q={q} index={idx}
                    value={answers[q.id]}
                    onChange={v => setAnswers(s => ({ ...s, [q.id]: v }))} />
                ))}
              </div>

              <div style={{
                marginTop: 24, paddingTop: 18, borderTop: '1px solid rgba(17,24,39,0.08)',
                display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap',
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF', marginRight: 'auto' }}>
                  已作答 {answeredCount} / {questions.length} 題
                </span>
                <button onClick={() => setView('list')} style={btnGhost} disabled={submitting}>取消</button>
                <button onClick={onSubmit} style={btnPrimary} disabled={submitting}>
                  {submitting ? '送出中…' : '送出作業'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── LIST VIEW ──────────────────────────────────────────────────────────────
  const list = byTab[tab] || [];
  return (
    <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      {/* Header */}
      <div className="qcCard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '18px 24px' }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16, color: '#111827' }}>我的作業</div>
          <div style={{ color: '#6B7280', fontWeight: 700, fontSize: 12, marginTop: 2 }}>查看並完成老師指派的作業</div>
        </div>
      </div>

      {/* List card */}
      <div className="qcCard" style={{ padding: '18px 24px' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid rgba(17,24,39,0.08)' }}>
          {[
            { key: 'active',  label: '待完成' },
            { key: 'done',    label: '已完成' },
            { key: 'overdue', label: '已過期' },
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

        {/* Content */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#9CA3AF', fontWeight: 700 }}>載入中…</div>
        ) : list.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '56px 0', color: '#9CA3AF' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>
              {tab === 'done' ? '🎉' : '📋'}
            </div>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>
              {tab === 'done' ? '尚未完成任何作業' : '目前沒有作業'}
            </div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              {tab === 'active' ? '老師指派作業後會顯示在這裡' :
               tab === 'done'   ? '完成作業後會顯示在這裡' :
                                  '過期的作業會顯示在這裡'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {list.map(a => {
              const isDone = Boolean(mySubmissions[a.id]);
              const isPastDue = !isDone && a.dueAt && new Date(a.dueAt) < now;
              const sub = mySubmissions[a.id];
              return (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 16px', borderRadius: 18,
                  border: isDone ? '1px solid rgba(52,199,89,0.25)' : '1px solid rgba(17,24,39,0.12)',
                  background: isDone ? 'rgba(52,199,89,0.04)' : '#F9FAFB',
                  minWidth: 0, width: '100%', boxSizing: 'border-box',
                }}>
                  {/* Left icon */}
                  <div style={{
                    width: 36, height: 36, borderRadius: 999, flexShrink: 0,
                    background: isDone ? 'rgba(52,199,89,0.15)' : 'rgba(0,122,255,0.10)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16,
                  }}>
                    {isDone ? '✓' : '📋'}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 4, color: '#111827' }}>
                      {a.title || '（未命名作業）'}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {a.dueAt && (
                        <span style={{ color: isPastDue ? '#EF4444' : '#6B7280' }}>
                          📅 截止：{new Date(a.dueAt).toLocaleDateString('zh-HK')}
                          {isPastDue && ' （已過期）'}
                        </span>
                      )}
                      {(a.questions?.length > 0) && <span>❓ {a.questions.length} 題</span>}
                      {isDone && sub?.submittedAt && (
                        <span style={{ color: '#34C759' }}>
                          ✓ 提交：{new Date(sub.submittedAt).toLocaleDateString('zh-HK')}
                        </span>
                      )}
                    </div>
                  </div>

                  {isDone ? (
                    <button onClick={() => openReview(a)} style={{ ...btnGhost, color: '#15803D', border: '1px solid rgba(52,199,89,0.30)', background: 'rgba(52,199,89,0.08)' }}>
                      查看答案
                    </button>
                  ) : (
                    <button onClick={() => openAnswer(a)} style={btnPrimary}>開始作答</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
