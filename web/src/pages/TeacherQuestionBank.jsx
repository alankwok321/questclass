import React, { useEffect, useMemo, useState } from 'react';
import { listClassrooms, listQuestionBank } from '../services/firebase.js';
import QuestionTypeBadge from '../components/QuestionTypeBadge.jsx';
import QuestionPreview from '../components/QuestionPreview.jsx';

export default function TeacherQuestionBank() {
  const [classrooms, setClassrooms] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [classroomId, setClassroomId] = useState('');

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const [q, setQ] = useState('');
  const [topic, setTopic] = useState('');
  const [type, setType] = useState('');

  const [selectedId, setSelectedId] = useState(null);

  const selected = useMemo(() => (items || []).find((x) => x.id === selectedId) || null, [items, selectedId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingClasses(true);
      try {
        const res = await listClassrooms();
        if (!mounted) return;
        if (res?.ok) {
          const cs = res.classrooms || [];
          setClassrooms(cs);
          if (!classroomId && cs[0]?.id) setClassroomId(cs[0].id);
        }
      } finally {
        if (mounted) setLoadingClasses(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  async function refresh() {
    if (!classroomId) return;
    setLoading(true);
    try {
      const res = await listQuestionBank(classroomId, 200);
      if (!res?.ok) {
        alert(res?.error || '載入題庫失敗');
        return;
      }
      setItems(res.items || []);
      if (!selectedId && res.items?.[0]?.id) setSelectedId(res.items[0].id);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [classroomId]);

  const filtered = useMemo(() => {
    const qq = String(q || '').trim().toLowerCase();
    const tt = String(topic || '').trim().toLowerCase();
    const ty = String(type || '').trim().toUpperCase();

    return (items || []).filter((it) => {
      const text = String(it.question_text || it.prompt || '').toLowerCase();
      if (qq && !text.includes(qq)) return false;
      const tpc = String(it.topic || '').toLowerCase();
      if (tt && !tpc.includes(tt)) return false;
      const ity = String(it.type || '').toUpperCase();
      if (ty && ity !== ty) return false;
      return true;
    });
  }, [items, q, topic, type]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16 }}>題庫</div>
            <div style={{ marginTop: 6, color: '#6B7280', fontWeight: 800, fontSize: 12 }}>
              獨立題庫頁：搜尋、篩選、預覽（教師視角）。
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={classroomId} onChange={(e) => setClassroomId(e.target.value)} style={selectStyle} disabled={loadingClasses}>
              <option value="">{loadingClasses ? '載入班級…' : '選擇班級'}</option>
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>{c.name || c.id}</option>
              ))}
            </select>
            <button type="button" style={btnGhost} onClick={refresh} disabled={loading || !classroomId}>
              {loading ? '更新中…' : '更新題庫'}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 200px 200px', gap: 10 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋題幹…" style={inputStyle} />
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="topic filter" style={inputStyle} />
          <select value={type} onChange={(e) => setType(e.target.value)} style={selectStyle}>
            <option value="">全部題型</option>
            <option value="TRUE_FALSE">是非題</option>
            <option value="MULTIPLE_CHOICE">選擇題</option>
            <option value="FILL_IN_BLANK">填空題</option>
            <option value="MATCHING">配對題</option>
            <option value="SHORT_ANSWER">簡答題</option>
            <option value="LONG_ANSWER">申論題</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 16, alignItems: 'start' }}>
        {/* List */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 14, borderBottom: '1px solid rgba(17,24,39,0.10)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 900 }}>題目（{filtered.length}）</div>
            <div style={{ color: '#6B7280', fontWeight: 900, fontSize: 12 }}>{classroomId || '—'}</div>
          </div>
          <div style={{ maxHeight: 620, overflow: 'auto' }}>
            {filtered.map((it) => {
              const active = it.id === selectedId;
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setSelectedId(it.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: 0,
                    borderLeft: active ? '4px solid #0B5FFF' : '4px solid transparent',
                    background: active ? 'rgba(0,122,255,0.08)' : 'transparent',
                    padding: 12,
                    cursor: 'pointer',
                    display: 'grid',
                    gap: 6,
                    borderBottom: '1px solid rgba(17,24,39,0.06)',
                  }}
                >
                  <div style={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.question_text || it.prompt || '（無題幹）'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                    <QuestionTypeBadge type={it.type} />
                    <span style={{ color: '#6B7280', fontWeight: 900, fontSize: 12 }}>{it.topic || '—'} · {it.points ?? '—'}分</span>
                  </div>
                </button>
              );
            })}
            {!filtered.length ? (
              <div style={{ padding: 14, color: '#6B7280', fontWeight: 700 }}>
                {loading ? '載入中…' : '沒有題目（或篩選後為空）'}
              </div>
            ) : null}
          </div>
        </div>

        {/* Preview */}
        <div className="card" style={{ minHeight: 300 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 14 }}>預覽（教師視角）</div>
              <div style={{ marginTop: 6, color: '#6B7280', fontWeight: 800, fontSize: 12 }}>
                {selected ? `id: ${selected.id}` : '從左側選擇題目'}
              </div>
            </div>
            {selected ? (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 900 }}>{selected.points ?? '—'} 分</div>
                <div style={{ marginTop: 6 }}>
                  <QuestionTypeBadge type={selected.type} />
                </div>
              </div>
            ) : null}
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>{selected?.question_text || selected?.prompt || '（未選取）'}</div>
            <div style={{ marginTop: 8, color: '#6B7280', fontWeight: 900, fontSize: 12 }}>topic: {selected?.topic || '—'}</div>
            <QuestionPreview q={selected} />
          </div>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 14,
  border: '1px solid rgba(17,24,39,0.10)',
  background: '#F2F2F7',
  outline: 'none',
  fontWeight: 800,
};

const selectStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 14,
  border: '1px solid rgba(17,24,39,0.10)',
  background: '#F2F2F7',
  outline: 'none',
  fontWeight: 800,
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
