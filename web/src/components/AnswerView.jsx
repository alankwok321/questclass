import React from 'react';

// Shared by 我的作業 (student results) and 作業批改 (teacher marking).
// ── Read-only submitted answer display ────────────────────────────────────────
export function SubmittedAnswer({ q, submittedAnswers }) {
  const type = (q?.type || '').toUpperCase();
  const ans = (submittedAnswers || []).find(a => String(a.questionId) === String(q.id));
  const val = ans?.value;

  if (val == null || val === '') {
    return <span style={{ color: '#86868B', fontWeight: 500, fontSize: 13 }}>（未作答）</span>;
  }

  if (type === 'TRUE_FALSE') {
    return (
      <span style={{ fontWeight: 600, fontSize: 13, color: val ? '#1E7B34' : '#D70015' }}>
        {val ? '✓ 正確 (True)' : '✗ 錯誤 (False)'}
      </span>
    );
  }

  if (type === 'MULTIPLE_CHOICE') {
    const opts = q?.options || [];
    const chosen = opts.find(o => o.id === val || o.value === val);
    return (
      <span style={{ fontWeight: 600, fontSize: 13, color: '#1D1D1F' }}>
        {chosen ? `${chosen.id}. ${chosen.text}` : String(val)}
      </span>
    );
  }

  return <span style={{ fontWeight: 500, fontSize: 13, color: '#1D1D1F', whiteSpace: 'pre-wrap' }}>{String(val)}</span>;
}

// ── Result of one question ───────────────────────────────────────────────────
export function ResultBadge({ r }) {
  if (!r) return null;
  const style = (bg, fg) => ({ padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: bg, color: fg, whiteSpace: 'nowrap' });
  if (r.pending) return <span style={style('#FFF4E0', '#B25000')}>待老師批改</span>;
  if (r.correct) return <span style={style('#E3F5E8', '#1E7B34')}>✓ 答對 · {r.earned}/{r.points} 分</span>;
  if (r.earned > 0) return <span style={style('#FFF4E0', '#B25000')}>部分正確 · {r.earned}/{r.points} 分</span>;
  return <span style={style('#FFE5E3', '#B8000F')}>✗ 答錯 · 0/{r.points} 分</span>;
}

// ── Completed assignment: score, your answers and the correct answers ────────
