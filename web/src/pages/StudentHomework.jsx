import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { ResultBadge, SubmittedAnswer } from '../components/AnswerView.jsx';
import { gradeMySubmission, listMyHomework, listMySubmissions, submitHomework } from '../services/firebase.js';
import QuestionTypeBadge from '../components/QuestionTypeBadge.jsx';
import { CheckCircle2, ClipboardList, PartyPopper, RefreshCw } from 'lucide-react';
import { useConfirm } from '../components/Confirm.jsx';

// ── Shared styles ──────────────────────────────────────────────────────────────
const btnPrimary = {
  border: 0, background: '#0071E3', color: '#fff',
  padding: '10px 18px', borderRadius: 999, fontWeight: 600, fontSize: 13,
  cursor: 'pointer', whiteSpace: 'nowrap',
};
const btnGhost = {
  border: 0, background: '#E3E3E8', color: '#1D1D1F',
  padding: '10px 18px', borderRadius: 999, fontWeight: 500, fontSize: 13,
  cursor: 'pointer', whiteSpace: 'nowrap',
};
const inputStyle = {
  width: '100%', padding: '10px 14px',
  border: '1px solid #D2D2D7', borderRadius: 10,
  fontSize: 14, fontWeight: 500, outline: 'none',
  background: '#FFFFFF', fontFamily: 'inherit', color: '#1D1D1F',
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
              border: isSelected ? '2px solid #0071E3' : '1px solid rgba(0,0,0,0.10)',
              background: isSelected ? 'rgba(0,113,227,0.08)' : '#fff',
              cursor: 'pointer', fontWeight: 600, fontSize: 14, color: '#1D1D1F',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: 999, flexShrink: 0,
                border: isSelected ? '2px solid #0071E3' : '2px solid rgba(0,0,0,0.15)',
                background: isSelected ? '#0071E3' : 'transparent',
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
              border: isSelected ? `2px solid ${val ? '#34C759' : '#FF3B30'}` : '1px solid rgba(0,0,0,0.10)',
              color: isSelected ? (val ? '#1E7B34' : '#D70015') : '#1D1D1F',
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

// ── Single question card ──────────────────────────────────────────────────────
function QuestionCard({ q, index, value, onChange }) {
  const text = q.question_text || q.prompt || '';
  return (
    <div style={{ background: '#FAFAFC', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '16px 18px' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ color: '#86868B', fontSize: 12, fontWeight: 700, minWidth: 22, paddingTop: 2 }}>{index + 1}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <QuestionTypeBadge type={q.type} />
            <span style={{ fontSize: 12, color: '#86868B', fontWeight: 500 }}>{q.points || 1} 分</span>
            {q.topic && <span style={{ fontSize: 12, color: '#86868B', fontWeight: 500 }}>· {q.topic}</span>}
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: text ? '#1D1D1F' : '#86868B', lineHeight: 1.5 }}>
            {text || '（未填寫題目）'}
          </div>
        </div>
      </div>
      <div style={{ paddingLeft: 32 }}>
        <div style={{ fontWeight: 600, fontSize: 12, color: '#6E6E73', marginBottom: 8 }}>你的答案</div>
        <AnswerInput q={q} value={value} onChange={onChange} />
      </div>
    </div>
  );
}

function CompletedDetail({ assignment, submission, onBack, onGraded }) {
  const questions = Array.isArray(assignment.questions) ? assignment.questions : [];
  const [grading, setGrading] = useState(false);
  const [gradeErr, setGradeErr] = useState('');
  const graded = submission?.status === 'graded' && Array.isArray(submission?.results);
  const results = new Map((graded ? submission.results : []).map((r) => [String(r.questionId), r]));
  const submittedAt = submission?.submittedAt ? new Date(submission.submittedAt).toLocaleString('zh-HK') : '—';

  // Older hand-ins (before automatic marking) are marked when opened.
  useEffect(() => {
    if (!submission || graded) return;
    let live = true;
    setGrading(true);
    gradeMySubmission(assignment.id).then((r) => {
      if (!live) return;
      if (r?.ok) onGraded?.();
      else setGradeErr(r?.error || '暫時未能批改');
    }).finally(() => { if (live) setGrading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment.id, graded]);

  const score = Number(submission?.score);
  const max = Number(submission?.maxScore);
  const pct = graded && max > 0 ? Math.round((score / max) * 100) : null;
  const correctCount = graded ? submission.results.filter((r) => r.correct).length : 0;

  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div><button onClick={onBack} style={btnGhost}>← 返回作業清單</button></div>

      <div className="qcCard" style={{ padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 18, color: '#1D1D1F' }}>{assignment.title || '作業'}</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#86868B', marginTop: 6 }}>提交時間：{submittedAt}</div>
          </div>
          {graded ? (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: pct >= 50 ? '#1E7B34' : '#B8000F' }}>
                {score}<span style={{ fontSize: 18, color: '#86868B', fontWeight: 600 }}> / {max}</span>
              </div>
              <div style={{ fontSize: 12, color: '#6E6E73' }}>答對 {correctCount} / {questions.length} 題{pct != null ? ` · ${pct}%` : ''}</div>
            </div>
          ) : (
            <span style={{ background: '#F2F2F5', color: '#6E6E73', borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 600 }}>
              {grading ? '批改中…' : gradeErr || '已提交'}
            </span>
          )}
        </div>
        {submission?.teacherComment ? (
          <div style={{ marginTop: 12, fontSize: 14, color: '#1D1D1F', background: '#EEF5FF', padding: '10px 12px', borderRadius: 12, lineHeight: 1.6 }}>
            <b>老師評語：</b>{submission.teacherComment}
          </div>
        ) : null}
        {graded && submission.pendingReview ? (
          <div style={{ marginTop: 12, fontSize: 13, color: '#B25000', background: '#FFF8EC', padding: '10px 12px', borderRadius: 12 }}>
            部分題目需要老師批改，分數之後可能會更新。
          </div>
        ) : null}

        <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', margin: '20px 0' }} />

        {questions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#86868B' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📝</div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>這份作業沒有題目</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {questions.map((q, idx) => {
              const text = q.question_text || q.prompt || '';
              const r = results.get(String(q.id ?? idx));
              const border = !r ? 'rgba(0,0,0,0.08)' : r.pending ? 'rgba(255,149,0,0.35)' : r.correct ? 'rgba(52,199,89,0.35)' : r.earned > 0 ? 'rgba(255,149,0,0.35)' : 'rgba(255,59,48,0.30)';
              return (
                <div key={q.id || idx} style={{ background: '#FAFAFC', border: `1px solid ${border}`, borderRadius: 16, padding: '16px 18px' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
                    <div style={{ color: '#86868B', fontSize: 12, fontWeight: 700, minWidth: 22, paddingTop: 2 }}>{idx + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <QuestionTypeBadge type={q.type} />
                        {r ? <ResultBadge r={r} /> : <span style={{ fontSize: 12, color: '#86868B', fontWeight: 500 }}>{q.points || 1} 分</span>}
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#1D1D1F', lineHeight: 1.5 }}>{text || '（未填寫題目）'}</div>
                    </div>
                  </div>
                  <div style={{ paddingLeft: 32, display: 'grid', gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 12, color: '#6E6E73', marginBottom: 4 }}>你的答案</div>
                      <SubmittedAnswer q={q} submittedAnswers={submission?.answers} />
                    </div>
                    {r && r.correctAnswer && !r.correct ? (
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 12, color: '#1E7B34', marginBottom: 4 }}>{r.pending || ['SHORT_ANSWER', 'LONG_ANSWER', 'ESSAY'].includes(String(q.type).toUpperCase()) ? '參考答案' : '正確答案'}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1D1D1F', whiteSpace: 'pre-wrap' }}>{r.correctAnswer}</div>
                      </div>
                    ) : null}
                    {r?.feedback ? (
                      <div style={{ fontSize: 13, color: '#3A3A3C', background: '#F2F2F7', borderRadius: 10, padding: '8px 10px' }}>💬 {r.feedback}</div>
                    ) : null}
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
export default function StudentHomework({ user }) {
  const confirm = useConfirm();
  // Teachers and admins can open this page to see what students see, but not hand in.
  const preview = Boolean(user) && (String(user.role || '').toLowerCase() !== 'student' || Boolean(user.platformAdmin));
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
        preview ? null : listMySubmissions(100),
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
  }, [preview]);

  useEffect(() => { load(); }, [load]);

  const now = new Date();
  // Archived (封存) homework only shows to students who handed it in, so they keep their results.
  const byTab = useMemo(() => {
    const open = items.filter(a => a.status !== 'archived');
    return {
      active: open.filter(a => !mySubmissions[a.id] && (!a.dueAt || new Date(a.dueAt) >= now)),
      done:   items.filter(a => Boolean(mySubmissions[a.id])),
      overdue: open.filter(a => !mySubmissions[a.id] && a.dueAt && new Date(a.dueAt) < now),
    };
  }, [items, mySubmissions, now]);

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
      if (!await confirm(`還有 ${unanswered.length} 題未作答，確定要送出嗎？`, { confirmText: '送出' })) return;
    }
    setSubmitting(true);
    try {
      const payloadAnswers = questions.map(q => ({
        questionId: q.id,
        value: answers[q.id] ?? null,
      }));
      const res = await submitHomework({ assignmentId: selected.id, answers: payloadAnswers });
      if (res?.ok) {
        // Marked on the server: show the score and the correct answers right away.
        await load();
        setView('review');
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
        onGraded={load}
      />
    );
  }

  // ── ANSWER VIEW (submitting) ────────────────────────────────────────────────
  if (view === 'answer') {
    return (
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <div><button onClick={() => setView('list')} style={btnGhost}>← 返回作業清單</button></div>

        <div className="qcCard" style={{ padding: '24px 28px' }}>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4, color: '#1D1D1F' }}>
            {selected?.title || '作業'}
          </div>
          {selected?.description && (
            <div style={{ color: '#6E6E73', fontWeight: 500, fontSize: 14, lineHeight: 1.7, marginBottom: 8 }}>
              {selected.description}
            </div>
          )}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 4 }}>
            {selected?.dueAt && (
              <span style={{ fontSize: 12, fontWeight: 500, color: '#6E6E73' }}>
                截止：{new Date(selected.dueAt).toLocaleDateString('zh-HK', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {questions.length > 0 && (
              <span style={{ fontSize: 12, fontWeight: 500, color: '#6E6E73' }}>共 {questions.length} 題 · {totalPts} 分</span>
            )}
          </div>

          <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', margin: '20px 0' }} />

          {submitted ? (
            <div style={{
              textAlign: 'center', padding: '48px 0',
              background: 'rgba(52,199,89,0.06)', borderRadius: 18,
              border: '1px solid rgba(52,199,89,0.20)',
            }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <div style={{ fontWeight: 700, fontSize: 18, color: '#1E7B34', marginBottom: 4 }}>作業已送出！</div>
              <div style={{ fontWeight: 500, fontSize: 14, color: '#6E6E73', marginBottom: 20 }}>
                老師批改後結果會顯示在這裡
              </div>
              <button onClick={() => { setTab('done'); setView('list'); }} style={btnPrimary}>查看已完成作業</button>
            </div>
          ) : questions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#86868B' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📝</div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>這份作業沒有題目</div>
            </div>
          ) : (
            <>
              {/* Progress bar */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#6E6E73' }}>作答進度</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: answeredCount === questions.length ? '#34C759' : '#0071E3' }}>
                    {answeredCount} / {questions.length} 題
                  </span>
                </div>
                <div style={{ height: 6, background: 'rgba(0,0,0,0.06)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 999,
                    background: answeredCount === questions.length ? '#34C759' : '#0071E3',
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
                marginTop: 24, paddingTop: 18, borderTop: '1px solid rgba(0,0,0,0.08)',
                display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap',
              }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: '#86868B', marginRight: 'auto' }}>
                  已作答 {answeredCount} / {questions.length} 題
                </span>
                <button onClick={() => setView('list')} style={btnGhost} disabled={submitting}>取消</button>
                {preview ? (
                  <button style={btnPrimary} disabled title="老師和管理員只能預覽，不能提交">預覽模式 · 不能提交</button>
                ) : (
                  <button onClick={onSubmit} style={btnPrimary} disabled={submitting}>
                    {submitting ? '送出中…' : '送出作業'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── LIST VIEW ──────────────────────────────────────────────────────────────
  const list = byTab[tab] || [];
  const tabs = [
    { key: 'active', label: '待完成' },
    { key: 'done', label: '已完成' },
    { key: 'overdue', label: '已過期' },
  ];
  const dayMs = 24 * 60 * 60 * 1000;
  function dueLabel(a) {
    if (!a.dueAt) return null;
    const diff = new Date(a.dueAt) - now;
    if (diff < 0) return { text: '已過期', tone: 'danger' };
    const days = Math.floor(diff / dayMs);
    if (days < 1) return { text: '今天截止', tone: 'danger' };
    if (days < 2) return { text: '明天截止', tone: 'danger' };
    return { text: `還有 ${days} 天`, tone: 'neutral' };
  }

  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ color: '#6E6E73', fontSize: 15 }}>{preview ? '預覽模式：這裡顯示學生看到的作業。老師和管理員可以打開作答畫面，但不能提交。' : '查看並完成老師指派的作業'}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div role="tablist" aria-label="篩選作業" style={{ display: 'inline-flex', padding: 2, borderRadius: 9, background: '#E3E3E8' }}>
            {tabs.map((t) => {
              const on = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setTab(t.key)}
                  style={{
                    height: 32, padding: '0 14px', border: 0, borderRadius: 7, cursor: 'pointer',
                    fontSize: 13, fontWeight: on ? 600 : 500, color: '#1D1D1F',
                    background: on ? '#FFFFFF' : 'transparent',
                    boxShadow: on ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                  }}
                >
                  {t.label} {byTab[t.key].length}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={load} disabled={loading} className="qcBtn qcBtnSmall" style={{ background: '#FFFFFF', color: '#1D1D1F', fontWeight: 500, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <RefreshCw size={14} aria-hidden="true" />
            {loading ? '載入中…' : '重新整理'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="qcCard qcEmpty" style={{ textAlign: 'center', padding: '48px 0' }}>載入中…</div>
      ) : list.length === 0 ? (
        <div className="qcCard" style={{ textAlign: 'center', padding: '56px 24px', color: '#6E6E73' }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: '#F2F2F5', display: 'grid', placeItems: 'center', margin: '0 auto 14px', color: '#86868B' }}>
            {tab === 'done' ? <PartyPopper size={26} aria-hidden="true" /> : <ClipboardList size={26} aria-hidden="true" />}
          </div>
          <div style={{ fontWeight: 600, fontSize: 17, color: '#1D1D1F', marginBottom: 4 }}>
            {tab === 'done' ? '尚未完成任何作業' : '目前沒有作業'}
          </div>
          <div style={{ fontSize: 14 }}>
            {tab === 'active' ? '老師指派作業後會顯示在這裡' :
             tab === 'done' ? '完成作業後會顯示在這裡' :
                              '過期的作業會顯示在這裡'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {list.map((a) => {
            const isDone = Boolean(mySubmissions[a.id]);
            const sub = mySubmissions[a.id];
            const due = !isDone ? dueLabel(a) : null;
            const qCount = a.questions?.length || 0;
            const pts = (a.questions || []).reduce((s, q) => s + (Number(q.points) || 1), 0);
            const score = sub?.score != null ? Number(sub.score) : null;
            return (
              <div key={a.id} className="qcCard" style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '18px 22px' }}>
                <div aria-hidden="true" style={{
                  width: 52, height: 52, borderRadius: 14, flexShrink: 0, display: 'grid', placeItems: 'center',
                  background: isDone ? '#E3F5E8' : '#E8F0FC', color: isDone ? '#1E7B34' : '#0071E3',
                }}>
                  {isDone ? <CheckCircle2 size={24} /> : <ClipboardList size={24} />}
                </div>

                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {due ? (
                      <span style={{
                        padding: '3px 9px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                        background: due.tone === 'danger' ? '#FFE5E3' : '#F2F2F5',
                        color: due.tone === 'danger' ? '#B8000F' : '#1D1D1F',
                      }}>{due.text}</span>
                    ) : null}
                    {isDone ? (
                      <span style={{ padding: '3px 9px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: '#E3F5E8', color: '#1E7B34' }}>已完成</span>
                    ) : null}
                    {qCount > 0 ? <span style={{ fontSize: 13, color: '#6E6E73' }}>{qCount} 題 · 共 {pts} 分</span> : null}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 17, color: '#1D1D1F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.title || '（未命名作業）'}
                  </div>
                  <div style={{ fontSize: 13, color: '#6E6E73' }}>
                    {isDone && sub?.submittedAt
                      ? `提交：${new Date(sub.submittedAt).toLocaleDateString('zh-HK')}`
                      : a.dueAt
                        ? `截止：${new Date(a.dueAt).toLocaleString('zh-HK', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                        : '沒有截止時間'}
                  </div>
                </div>

                {isDone && score != null && Number.isFinite(score) ? (
                  <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', marginRight: 4 }}>
                    {score}{sub?.maxScore ? <span style={{ fontSize: 15, color: '#86868B', fontWeight: 600 }}> / {sub.maxScore}</span> : null}
                  </div>
                ) : null}

                {isDone ? (
                  <button type="button" onClick={() => openReview(a)} className="qcBtn qcBtnTinted">查看結果</button>
                ) : due?.tone === 'danger' && due.text === '已過期' ? (
                  <button type="button" className="qcBtn qcBtnSecondary" disabled title="已過截止時間，不能再提交">已過期</button>
                ) : (
                  <button type="button" onClick={() => openAnswer(a)} className="qcBtn qcBtnPrimary">{preview ? '預覽' : '開始作答'}</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
