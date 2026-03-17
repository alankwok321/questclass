import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { listClassrooms, listHomeworkAssignments, updateHomeworkAssignmentStatus } from '../services/firebase.js';

export default function TeacherHomeworkList({ status = 'published' }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [classrooms, setClassrooms] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const classroomId = params.get('classroomId') || '';

  async function refresh() {
    setLoading(true);
    try {
      const res = await listHomeworkAssignments(classroomId || null, 100);
      if (res?.ok) {
        const filtered = (res.items || []).filter((a) => String(a.status || 'published') === status);
        setItems(filtered);
      } else {
        alert(res?.error || '載入作業失敗');
      }
    } finally {
      setLoading(false);
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
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    refresh();
  }, [classroomId, status]);

  const title = useMemo(() => {
    if (status === 'draft') return '草稿';
    if (status === 'archived') return '已封存';
    return '已指派';
  }, [status]);

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ fontWeight: 900 }}>{title}</div>
        <button type="button" style={btnGhost} onClick={refresh} disabled={loading}>
          {loading ? '更新中…' : '重新整理'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 900, fontSize: 12, color: '#6B7280' }}>班級：</div>
        <select
          value={classroomId}
          onChange={(e) => {
            const v = e.target.value;
            const next = new URLSearchParams(params);
            if (v) next.set('classroomId', v); else next.delete('classroomId');
            setParams(next);
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
            <div key={a.id} style={cardRow}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 900 }}>{a.title || '（未命名作業）'}</div>
                  <div style={{ marginTop: 4, color: '#6B7280', fontWeight: 800, fontSize: 12 }}>
                    classroom: {a.classroomId || '—'} · dueAt: {a.dueAt || '—'} · questions: {(a.questions || []).length} · total: {a.totalPoints ?? '—'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" style={btnGhost} onClick={() => navigate(`/teacher-homework/${a.id}`)}>
                    檢視
                  </button>
                  <button type="button" style={btnGhost} onClick={() => navigate(`/teacher-homework/${a.id}/edit`)}>
                    編輯
                  </button>

                  {status === 'published' ? (
                    <button type="button" style={btnGhost} onClick={async () => {
                      const res = await updateHomeworkAssignmentStatus({ assignmentId: a.id, status: 'archived' });
                      if (!res?.ok) alert(res?.error || '下架失敗');
                      else await refresh();
                    }}>
                      下架
                    </button>
                  ) : null}

                  {status === 'draft' ? (
                    <button type="button" style={btnPrimary} onClick={async () => {
                      // Teams style: Assign = publish
                      const res = await updateHomeworkAssignmentStatus({ assignmentId: a.id, status: 'published' });
                      if (!res?.ok) alert(res?.error || '指派失敗');
                      else await refresh();
                    }}>
                      指派
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: '#6B7280', fontWeight: 700 }}>{loading ? '載入中…' : '目前沒有作業'}</div>
      )}
    </div>
  );
}

const cardRow = {
  padding: 12,
  borderRadius: 18,
  border: '1px solid rgba(17,24,39,0.10)',
  background: '#F9FAFB',
};

const selectStyle = {
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
