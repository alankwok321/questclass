import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bot, Check, RefreshCw } from 'lucide-react';
import Avatar from '../components/Avatar.jsx';
import QuestionTypeBadge from '../components/QuestionTypeBadge.jsx';
import { SubmittedAnswer } from '../components/AnswerView.jsx';
import { Segmented } from '../components/ClassStats.jsx';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/Confirm.jsx';
import { autogradeSubmission, getSubmissionForMarking, saveSubmissionMarks } from '../services/api.js';

// 作業批改: hand-ins with answers still to mark (open questions the AI could not mark, or hand-ins
// never marked), AI marks waiting for the teacher to confirm, and finished ones.
const fb = () => window.QuestClassFirebase;
const OPEN_TYPES = new Set(['SHORT_ANSWER', 'LONG_ANSWER', 'ESSAY', 'OPEN_ENDED']);

export function stateOf(sub) {
  const results = Array.isArray(sub?.results) ? sub.results : [];
  if (sub?.status !== 'graded' || !results.length) return 'unmarked';
  if (sub.pendingReview || results.some((r) => r.pending)) return 'pending';
  if (!sub.teacherReviewed && results.some((r) => r.markedBy === 'ai')) return 'ai';
  return 'done';
}

const when = (v) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('zh-HK', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
};

function StateChip({ sub }) {
  const st = stateOf(sub);
  const style = (bg, fg) => ({ padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: bg, color: fg, whiteSpace: 'nowrap' });
  if (st === 'unmarked') return <span style={style('#FFF4E0', '#B25000')}>未批改</span>;
  if (st === 'pending') {
    const n = (sub.results || []).filter((r) => r.pending).length;
    return <span style={style('#FFF4E0', '#B25000')}>{n} 題待批改</span>;
  }
  if (st === 'ai') return <span style={style('#EEF0FF', '#3634A3')}>AI 已評分 · 待確認</span>;
  return <span style={style('#E3F5E8', '#1E7B34')}>已批改</span>;
}

export default function AssignmentsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [subs, setSubs] = useState([]);
  const [students, setStudents] = useState({});
  const [tab, setTab] = useState('todo');
  const [cls, setCls] = useState('');
  const [hwId, setHwId] = useState('');
  const [openId, setOpenId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [s, st] = await Promise.all([fb()?.listSubmissionsForReview?.(), fb()?.listStudents?.(1000)]);
      if (!s) throw new Error('Firebase 未設定');
      if (!s.ok) throw new Error(s.error || '載入提交失敗');
      setSubs(s.submissions || []);
      const map = {};
      (st?.students || []).forEach((x) => { map[x.uid || x.id] = x; });
      setStudents(map);
    } catch (e) {
      setErr(e?.message || '載入失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const classes = useMemo(() => [...new Set(subs.map((s) => String(s.class || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'zh-Hant', { numeric: true })), [subs]);
  const homework = useMemo(() => {
    const m = new Map();
    subs.forEach((s) => { if (!m.has(s.assignmentId)) m.set(s.assignmentId, s.assignmentTitle || '作業'); });
    return [...m.entries()];
  }, [subs]);

  const filtered = subs.filter((s) => (!cls || s.class === cls) && (!hwId || s.assignmentId === hwId));
  const counts = { todo: 0, ai: 0, done: 0 };
  filtered.forEach((s) => { const st = stateOf(s); counts[st === 'unmarked' || st === 'pending' ? 'todo' : st] += 1; });
  const shown = filtered.filter((s) => {
    const st = stateOf(s);
    if (tab === 'todo') return st === 'unmarked' || st === 'pending';
    if (tab === 'ai') return st === 'ai';
    if (tab === 'done') return st === 'done';
    return true;
  });

  const open = subs.find((s) => s.id === openId);
  if (open) {
    const queue = shown.map((s) => s.id);
    const next = queue[queue.indexOf(open.id) + 1] || '';
    return (
      <MarkSubmission
        key={open.id}
        sub={open}
        student={students[open.studentUid]}
        onBack={() => { setOpenId(''); load(); }}
        onSaved={async (goNext) => {
          await load();
          setOpenId(goNext && next ? next : '');
          toast?.show?.('已儲存批改');
        }}
        hasNext={Boolean(next)}
      />
    );
  }

  const select = { height: 34, borderRadius: 9, border: '1px solid #D2D2D7', padding: '0 10px', fontSize: 14, background: '#fff', maxWidth: 220 };
  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Segmented label="批改狀態" value={tab} onChange={setTab} options={[
          ['todo', `待批改 ${counts.todo}`], ['ai', `AI 評分待確認 ${counts.ai}`], ['done', `已批改 ${counts.done}`], ['all', '全部'],
        ]} />
        {classes.length > 1 ? (
          <select aria-label="班別" value={cls} onChange={(e) => setCls(e.target.value)} style={select}>
            <option value="">全部班別</option>
            {classes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        ) : null}
        {homework.length > 1 ? (
          <select aria-label="作業" value={hwId} onChange={(e) => setHwId(e.target.value)} style={select}>
            <option value="">全部作業</option>
            {homework.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
          </select>
        ) : null}
        <span style={{ flexGrow: 1 }} />
        <button type="button" onClick={load} disabled={loading} className="qcBtn qcBtnSecondary qcBtnSmall">
          <RefreshCw size={14} aria-hidden="true" /> 重新整理
        </button>
      </div>

      {err ? <div className="qcCard" style={{ color: '#D70015', fontWeight: 500 }}>{err}</div> : null}

      <div className="qcCard" style={{ padding: 0, overflow: 'hidden' }}>
        {loading && !subs.length ? <div className="qcEmpty" style={{ padding: 24 }}>載入中…</div>
          : shown.length === 0 ? (
            <div className="qcEmpty" style={{ padding: 24 }}>
              {tab === 'todo' ? '沒有待批改的答案。選擇題、是非題和填充題會自動批改；AI 未能批改的文字題會出現在這裡。'
                : tab === 'ai' ? '沒有等待確認的 AI 評分。' : '還沒有提交。'}
            </div>
          ) : shown.map((s, i) => {
            const st = students[s.studentUid] || {};
            const name = st.name || st.displayName || s.studentName || '學生';
            return (
              <button key={s.id} type="button" onClick={() => setOpenId(s.id)} style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '14px 18px', border: 0,
                borderTop: i ? '1px solid #F0F0F3' : 0, background: 'transparent', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit',
              }}>
                <Avatar photoURL={st.photoURL || s.studentPhotoURL} name={name} size={36} />
                <div style={{ flexGrow: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{name}{s.class ? <span style={{ color: '#6E6E73', fontWeight: 500 }}> · {s.class}</span> : null}</div>
                  <div style={{ fontSize: 13, color: '#6E6E73', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.assignmentTitle || '作業'}{s.submittedAt ? ` · 提交 ${when(s.submittedAt)}` : ''}
                  </div>
                </div>
                <StateChip sub={s} />
                {s.score != null ? (
                  <div style={{ fontSize: 17, fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: 64, textAlign: 'right' }}>
                    {s.score}<span style={{ fontSize: 13, color: '#6E6E73', fontWeight: 500 }}> / {s.maxScore}</span>
                  </div>
                ) : <div style={{ minWidth: 64 }} />}
              </button>
            );
          })}
      </div>
    </div>
  );
}

function MarkSubmission({ sub, student, onBack, onSaved, hasNext }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [marks, setMarks] = useState({}); // questionId → { earned, feedback }
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState('');

  const loadDetail = useCallback(async () => {
    setErr('');
    try {
      const d = await getSubmissionForMarking(sub.id);
      setData(d);
      const m = {};
      (d.submission?.results || []).forEach((r) => {
        m[String(r.questionId)] = { earned: r.pending ? '' : String(r.earned ?? 0), feedback: r.feedback || '' };
      });
      setMarks(m);
      setComment(d.submission?.teacherComment || '');
    } catch (e) {
      setErr(e?.message || '載入失敗');
    }
  }, [sub.id]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  const s = data?.submission || sub;
  const results = new Map((s.results || []).map((r) => [String(r.questionId), r]));
  const questions = data?.questions || [];
  const graded = s.status === 'graded' && results.size > 0;
  const name = student?.name || student?.displayName || '學生';

  const total = questions.reduce((t, q) => {
    const v = Number(marks[q.id]?.earned);
    return t + (Number.isFinite(v) && marks[q.id]?.earned !== '' ? Math.min(q.points, Math.max(0, v)) : 0);
  }, 0);
  const max = questions.reduce((t, q) => t + (Number(q.points) || 1), 0);
  const blank = questions.filter((q) => (marks[q.id]?.earned ?? '') === '');

  const setMark = (id, patch) => setMarks((m) => ({ ...m, [id]: { ...(m[id] || { earned: '', feedback: '' }), ...patch } }));

  const runAuto = async () => {
    setBusy('auto');
    try {
      await autogradeSubmission(sub.id);
      await loadDetail();
    } catch (e) {
      toast?.show?.(e?.message || '自動批改失敗');
    } finally {
      setBusy('');
    }
  };

  const save = async (goNext) => {
    if (blank.length && !await confirm(`還有 ${blank.length} 題未給分，未給分的題目會保持「待批改」。確定儲存？`, { confirmText: '儲存' })) return;
    setBusy(goNext ? 'next' : 'save');
    try {
      const list = questions.filter((q) => (marks[q.id]?.earned ?? '') !== '')
        .map((q) => ({ questionId: q.id, earned: Number(marks[q.id].earned), feedback: marks[q.id].feedback || '' }));
      await saveSubmissionMarks(sub.id, list, comment);
      await onSaved(goNext);
    } catch (e) {
      toast?.show?.(e?.message || '儲存失敗');
      setBusy('');
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div><button type="button" onClick={onBack} className="qcBtn qcBtnSecondary qcBtnSmall"><ArrowLeft size={15} aria-hidden="true" /> 返回清單</button></div>

      <div className="qcCard" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <Avatar photoURL={student?.photoURL || s.studentPhotoURL} name={name} size={44} />
        <div style={{ flexGrow: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{name}{s.class ? <span style={{ color: '#6E6E73', fontWeight: 500 }}> · {s.class}</span> : null}</div>
          <div style={{ fontSize: 13, color: '#6E6E73' }}>{data?.assignment?.title || s.assignmentTitle || '作業'}{s.submittedAt ? ` · 提交 ${when(s.submittedAt)}` : ''}</div>
        </div>
        <StateChip sub={s} />
        {graded ? (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{Math.round(total * 100) / 100}<span style={{ fontSize: 16, color: '#6E6E73', fontWeight: 600 }}> / {max}</span></div>
            <div style={{ fontSize: 12, color: '#6E6E73' }}>按目前給分計算</div>
          </div>
        ) : null}
      </div>

      {err ? <div className="qcCard" style={{ color: '#D70015', fontWeight: 500 }}>{err}</div> : null}
      {!data && !err ? <div className="qcCard qcEmpty">載入中…</div> : null}

      {data && !graded ? (
        <div className="qcCard" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flexGrow: 1, fontSize: 14, color: '#3A3A3C' }}>這份作業還沒有批改。先自動批改選擇題、是非題和填充題（文字題會用學校的 AI 評分），再由你檢查。</div>
          <button type="button" className="qcBtn qcBtnPrimary qcBtnSmall" onClick={runAuto} disabled={busy === 'auto'}>
            <Bot size={15} aria-hidden="true" /> {busy === 'auto' ? '批改中…' : '自動批改'}
          </button>
        </div>
      ) : null}

      {data && graded ? questions.map((q, idx) => {
        const r = results.get(q.id);
        const mk = marks[q.id] || { earned: '', feedback: '' };
        const isOpen = OPEN_TYPES.has(String(q.type).toUpperCase()) || r?.markedBy === 'ai' || r?.pending;
        const tone = r?.pending ? '#FF9500' : r?.markedBy === 'ai' && !s.teacherReviewed ? '#5E5CE6' : '#E8E8ED';
        return (
          <section key={q.id} className="qcCard" style={{ display: 'grid', gap: 12, borderLeft: `4px solid ${tone}` }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ color: '#86868B', fontSize: 13, fontWeight: 700, minWidth: 22, paddingTop: 2 }}>{idx + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <QuestionTypeBadge type={q.type} />
                  <span style={{ fontSize: 12, color: '#6E6E73' }}>{q.points} 分</span>
                  {r?.pending ? <span style={{ fontSize: 12, fontWeight: 700, color: '#B25000' }}>待批改</span> : null}
                  {r?.markedBy === 'ai' ? <span style={{ fontSize: 12, fontWeight: 700, color: '#3634A3' }}>AI 評分</span> : null}
                  {r?.markedBy === 'teacher' ? <span style={{ fontSize: 12, fontWeight: 700, color: '#1E7B34' }}>老師已批改</span> : null}
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{q.question_text || '（未填寫題目）'}</div>
              </div>
            </div>

            <div style={{ paddingLeft: 32, display: 'grid', gap: 10 }}>
              <div style={{ background: '#FAFAFC', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: '#6E6E73', marginBottom: 4 }}>學生答案</div>
                <SubmittedAnswer q={q} submittedAnswers={s.answers} />
              </div>
              {q.ideal_answer || q.correctAnswer ? (
                <div>
                  <div style={{ fontWeight: 600, fontSize: 12, color: '#1E7B34', marginBottom: 4 }}>{isOpen ? '參考答案' : '正確答案'}</div>
                  <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{q.ideal_answer || q.correctAnswer}</div>
                </div>
              ) : null}
              {q.grading_rubric ? (
                <div>
                  <div style={{ fontWeight: 600, fontSize: 12, color: '#6E6E73', marginBottom: 4 }}>評分準則</div>
                  <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: '#3A3A3C' }}>{q.grading_rubric}</div>
                </div>
              ) : null}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>給分</span>
                <input type="number" inputMode="decimal" min={0} max={q.points} step={0.5} aria-label={`第 ${idx + 1} 題給分`}
                  value={mk.earned} onChange={(e) => setMark(q.id, { earned: e.target.value })} placeholder="—"
                  style={{ width: 72, height: 34, borderRadius: 9, border: `1px solid ${mk.earned === '' ? '#FF9500' : '#D2D2D7'}`, padding: '0 8px', fontSize: 15, fontVariantNumeric: 'tabular-nums' }} />
                <span style={{ fontSize: 13, color: '#6E6E73' }}>/ {q.points}</span>
                <span style={{ width: 8 }} />
                {[0, q.points / 2, q.points].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
                  <button key={v} type="button" className="qcBtn qcBtnSmall" onClick={() => setMark(q.id, { earned: String(Math.round(v * 2) / 2) })}
                    aria-pressed={Number(mk.earned) === Math.round(v * 2) / 2 && mk.earned !== ''}
                    style={{ height: 30, padding: '0 10px', background: Number(mk.earned) === Math.round(v * 2) / 2 && mk.earned !== '' ? '#0071E3' : '#E8E8ED', color: Number(mk.earned) === Math.round(v * 2) / 2 && mk.earned !== '' ? '#fff' : '#1D1D1F', fontSize: 12 }}>
                    {v === 0 ? '0 分' : v === q.points ? '滿分' : `${Math.round(v * 2) / 2} 分`}
                  </button>
                ))}
              </div>
              {isOpen ? (
                <textarea value={mk.feedback} onChange={(e) => setMark(q.id, { feedback: e.target.value })} rows={2} placeholder="給學生的回饋（可留空）"
                  style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #D2D2D7', borderRadius: 10, padding: 10, fontSize: 14, lineHeight: 1.5, fontFamily: 'inherit', resize: 'vertical' }} />
              ) : null}
            </div>
          </section>
        );
      }) : null}

      {data && graded ? (
        <div className="qcCard" style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>老師評語（學生會看到）</div>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="可留空"
            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #D2D2D7', borderRadius: 10, padding: 10, fontSize: 14, lineHeight: 1.5, fontFamily: 'inherit', resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" className="qcBtn qcBtnSecondary" onClick={() => save(false)} disabled={Boolean(busy)}>
              <Check size={15} aria-hidden="true" /> {busy === 'save' ? '儲存中…' : '儲存'}
            </button>
            {hasNext ? (
              <button type="button" className="qcBtn qcBtnPrimary" onClick={() => save(true)} disabled={Boolean(busy)}>
                {busy === 'next' ? '儲存中…' : '儲存並批改下一份'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
