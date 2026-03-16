import React, { useState } from 'react';

export default function TeacherHomework() {
  const [form, setForm] = useState({
    title: '',
    description: '',
    dueDate: '',
    classroomId: '',
    points: 10,
  });

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card">
        <div style={{ fontWeight: 900, marginBottom: 10 }}>指派作業</div>
        <div style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <div style={label}>標題</div>
            <input value={form.title} onChange={(e) => setForm(s => ({ ...s, title: e.target.value }))} style={inputStyle} placeholder="例如：分數加減練習" />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={label}>說明</div>
            <textarea value={form.description} onChange={(e) => setForm(s => ({ ...s, description: e.target.value }))} style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} placeholder="作業內容/規則..." />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <div style={label}>班級 ID</div>
              <input value={form.classroomId} onChange={(e) => setForm(s => ({ ...s, classroomId: e.target.value }))} style={inputStyle} placeholder="classroom-001" />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <div style={label}>截止日期</div>
              <input value={form.dueDate} onChange={(e) => setForm(s => ({ ...s, dueDate: e.target.value }))} style={inputStyle} placeholder="YYYY-MM-DD" />
            </label>
          </div>

          <label style={{ display: 'grid', gap: 6 }}>
            <div style={label}>配分</div>
            <input type="number" value={form.points} onChange={(e) => setForm(s => ({ ...s, points: Number(e.target.value) }))} style={inputStyle} />
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" style={btnPrimary} onClick={() => alert('下一步：接 Firestore 寫入作業')}>
              建立作業
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ fontWeight: 900, marginBottom: 10 }}>已指派作業</div>
        <div style={{ color: '#6B7280', fontWeight: 700 }}>（下一步接 Firestore：homeworkAssignments）</div>
      </div>
    </div>
  );
}

const label = { fontWeight: 900, fontSize: 12, color: '#6B7280' };
const inputStyle = {
  width: '100%',
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
