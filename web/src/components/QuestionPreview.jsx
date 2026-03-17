import React from 'react';
import { CheckCircle2 } from './QuestionTypeBadge.jsx';

export default function QuestionPreview({ q }) {
  if (!q) return <div style={{ color: '#6B7280', fontWeight: 700, padding: '12px 0' }}>未選擇題目</div>;

  const type = String(q.type || '').toUpperCase();

  switch (type) {
    case 'TRUE_FALSE': {
      const correct = q.correct_answer;
      return (
        <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={tfBtn(correct === true)}>
              {correct === true ? <CheckCircle2 className="w-4 h-4" /> : null}
              正確
            </div>
            <div style={tfBtn(correct === false)}>
              {correct === false ? <CheckCircle2 className="w-4 h-4" /> : null}
              錯誤
            </div>
          </div>
        </div>
      );
    }

    case 'MULTIPLE_CHOICE': {
      const options = Array.isArray(q.options) ? q.options : [];
      return (
        <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          {options.map((opt) => (
            <div key={opt.id} style={mcRow(Boolean(opt.is_correct))}>
              <div style={optBadge(Boolean(opt.is_correct))}>{opt.id}</div>
              <div style={{ fontWeight: 800, color: opt.is_correct ? '#065F46' : '#111827' }}>{opt.text}</div>
              {opt.is_correct ? <CheckCircle2 className="w-5 h-5" style={{ marginLeft: 'auto', color: '#10B981' }} /> : null}
            </div>
          ))}
        </div>
      );
    }

    case 'FILL_IN_BLANK': {
      const text = String(q.question_text || '');
      const blanks = Array.isArray(q.blanks) ? q.blanks : [];
      const parts = text.split('[____]');
      return (
        <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
          <div style={panel}>
            {parts.map((part, idx) => (
              <React.Fragment key={idx}>
                {part}
                {idx < parts.length - 1 ? (
                  <input
                    readOnly
                    value={String(blanks[idx]?.accepted?.[0] || '')}
                    style={blankInput}
                  />
                ) : null}
              </React.Fragment>
            ))}
          </div>
          <div style={{ color: '#6B7280', fontWeight: 800, fontSize: 12 }}>
            允許答案：
            <ul>
              {blanks.map((b) => (
                <li key={b.position}>空格 {b.position}: {(b.accepted || []).join(', ')}</li>
              ))}
            </ul>
          </div>
        </div>
      );
    }

    case 'MATCHING': {
      const pairs = Array.isArray(q.pairs) ? q.pairs : [];
      return (
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={sectionLabel}>提示</div>
            {pairs.map((p, i) => (
              <div key={`p-${i}`} style={panel}>{p.prompt}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={sectionLabel}>配對</div>
            {pairs.map((p, i) => (
              <div key={`m-${i}`} style={{ ...panel, borderColor: 'rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900, color: '#065F46' }}>
                  <CheckCircle2 className="w-4 h-4" style={{ color: '#10B981' }} />
                  {p.match}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'SHORT_ANSWER': {
      return (
        <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
          <input readOnly value={String(q.ideal_answer || '')} style={shortAnswerInput} />
          <div style={{ color: '#6B7280', fontWeight: 800, fontSize: 12 }}>
            字數上限：{q.max_word_count ?? '—'}
          </div>
        </div>
      );
    }

    case 'LONG_ANSWER': {
      return (
        <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
          <textarea readOnly rows={4} placeholder="學生將在此輸入…" style={essayBox} />
          <div style={{ ...panel, borderLeft: '4px solid #F59E0B', background: 'rgba(245,158,11,0.10)' }}>
            <div style={{ fontWeight: 900, color: '#92400E' }}>評分標準</div>
            <div style={{ marginTop: 6, color: '#92400E', fontWeight: 800 }}>{String(q.grading_rubric || '')}</div>
            <div style={{ marginTop: 6, color: '#B45309', fontWeight: 800, fontSize: 12 }}>
              字數上限：{q.max_word_count ?? '—'}
            </div>
          </div>
        </div>
      );
    }

    default:
      return <div style={{ marginTop: 10, color: '#6B7280', fontWeight: 700 }}>不支援的題型：{type}</div>;
  }
}

const panel = {
  padding: 12,
  borderRadius: 16,
  border: '1px solid rgba(17,24,39,0.10)',
  background: '#F9FAFB',
  fontWeight: 800,
  color: '#111827',
  lineHeight: 1.7,
};

const sectionLabel = {
  fontWeight: 900,
  fontSize: 12,
  color: '#6B7280',
};

const tfBtn = (active) => ({
  flex: 1,
  padding: '12px 12px',
  borderRadius: 16,
  border: active ? '2px solid rgba(16,185,129,0.6)' : '1px solid rgba(17,24,39,0.10)',
  background: active ? 'rgba(16,185,129,0.10)' : '#F2F2F7',
  fontWeight: 900,
  color: active ? '#065F46' : '#6B7280',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
});

const mcRow = (correct) => ({
  padding: 12,
  borderRadius: 16,
  border: correct ? '2px solid rgba(16,185,129,0.6)' : '1px solid rgba(17,24,39,0.10)',
  background: correct ? 'rgba(16,185,129,0.08)' : '#F9FAFB',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
});

const optBadge = (correct) => ({
  width: 30,
  height: 30,
  borderRadius: 999,
  background: correct ? '#10B981' : 'rgba(17,24,39,0.08)',
  color: correct ? 'white' : '#6B7280',
  display: 'grid',
  placeItems: 'center',
  fontWeight: 900,
});

const blankInput = {
  margin: '0 6px',
  padding: '4px 8px',
  width: 90,
  border: 0,
  borderBottom: '2px solid rgba(16,185,129,0.6)',
  background: 'transparent',
  color: '#065F46',
  fontWeight: 900,
  textAlign: 'center',
  outline: 'none',
};

const shortAnswerInput = {
  padding: '12px 12px',
  borderRadius: 16,
  border: '2px solid rgba(16,185,129,0.25)',
  background: 'rgba(16,185,129,0.08)',
  fontWeight: 900,
  color: '#065F46',
};

const essayBox = {
  padding: 12,
  borderRadius: 16,
  border: '1px solid rgba(17,24,39,0.15)',
  background: 'white',
  fontWeight: 800,
  color: '#111827',
  resize: 'none',
};
