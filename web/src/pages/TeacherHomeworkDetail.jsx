import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { listHomeworkAssignments } from '../services/firebase.js';

export default function TeacherHomeworkDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [item, setItem] = useState(null);

  async function load() {
    setLoading(true);
    try {
      // No get-by-id API yet. Quick workaround: list and find.
      const res = await listHomeworkAssignments(null, 200);
      if (res?.ok) {
        const found = (res.items || []).find((a) => a.id === id);
        setItem(found || null);
      } else {
        alert(res?.error || '載入失敗');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  const questions = useMemo(() => Array.isArray(item?.questions) ? item.questions : [], [item]);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{item?.title || (loading ? '載入中…' : '找不到作業')}</div>
          <div style={{ marginTop: 6, color: '#6B7280', fontWeight: 800, fontSize: 12 }}>
            id: {id} · classroom: {item?.classroomId || '—'} · dueAt: {item?.dueAt || '—'} · status: {item?.status || '—'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={btnGhost} onClick={() => navigate(`/teacher-homework/${id}/edit`)}>
            編輯
          </button>
          <button type="button" style={btnGhost} onClick={() => navigate(-1)}>
            返回
          </button>
        </div>
      </div>

      {item?.description ? (
        <div style={{ marginTop: 12, color: '#374151', fontWeight: 800, lineHeight: 1.7 }}>
          {item.description}
        </div>
      ) : null}

      <div style={{ marginTop: 16, fontWeight: 900 }}>題目（{questions.length}）</div>
      <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
        {questions.map((q, idx) => (
          <div key={q.id || idx} style={qCard}>
            <div style={{ fontWeight: 900 }}>{idx + 1}. ({q.type}) {q.prompt}</div>
            <div style={{ marginTop: 6, color: '#6B7280', fontWeight: 800, fontSize: 12 }}>
              points: {q.points ?? '—'}
            </div>
          </div>
        ))}
        {!questions.length ? (
          <div style={{ color: '#6B7280', fontWeight: 700 }}>{loading ? '載入中…' : '沒有題目'}</div>
        ) : null}
      </div>
    </div>
  );
}

const qCard = {
  padding: 12,
  borderRadius: 18,
  border: '1px solid rgba(17,24,39,0.10)',
  background: '#F9FAFB'
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
