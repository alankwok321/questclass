import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listHomeworkAssignments, updateHomeworkAssignmentStatus } from '../services/firebase.js';

export default function TeacherHomeworkList({ status = 'published', compact = false, hideTitle = false, onSelect = null }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function refresh() {
    setLoading(true);
    try {
      const res = await listHomeworkAssignments(100);
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
    refresh();
  }, [status]);

  const title = useMemo(() => {
    if (status === 'draft') return '草稿';
    if (status === 'archived') return '已封存';
    return '已指派';
  }, [status]);

  return (
    <div className="card">
      {!hideTitle ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ fontWeight: 900 }}>{title}</div>
          <button type="button" style={btnGhost} onClick={refresh} disabled={loading}>
            {loading ? '更新中…' : '重新整理'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <button type="button" style={btnGhost} onClick={refresh} disabled={loading}>
            {loading ? '更新中…' : '重新整理'}
          </button>
        </div>
      )}

      {items.length ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {items.map((a) => (
            <div key={a.id} style={cardRow}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof onSelect === 'function') return onSelect(a);
                    return navigate(`/teacher-homework/${a.id}`);
                  }}
                  style={{
                    textAlign: 'left',
                    border: 0,
                    background: 'transparent',
                    padding: 0,
                    cursor: 'pointer',
                    minWidth: 0,
                    flex: 1,
                  }}
                  title={a.title || a.id}
                >
                  <div style={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.title || '（未命名作業）'}
                  </div>
                  <div style={{ marginTop: 4, color: '#6B7280', fontWeight: 800, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    dueAt: {a.dueAt || '—'} · Q: {(a.questions || []).length}
                  </div>
                </button>

                {!compact ? (
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
                ) : null}
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
