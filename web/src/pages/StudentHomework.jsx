import React, { useState } from 'react';

export default function StudentHomework() {
  const [answer, setAnswer] = useState('');

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card">
        <div style={{ fontWeight: 900, marginBottom: 10 }}>我的作業</div>
        <div style={{ color: '#6B7280', fontWeight: 700, lineHeight: 1.7 }}>
          這裡會顯示老師指派給你的作業（下一步接 Firestore：homeworkAssignments + submissions）。
        </div>
      </div>

      <div className="card">
        <div style={{ fontWeight: 900, marginBottom: 10 }}>作業：示範題</div>
        <div style={{ color: '#111827', fontWeight: 800, lineHeight: 1.7 }}>
          請用一句話解釋：為什麼 1/2 + 1/4 = 3/4？
        </div>

        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          <div style={{ fontWeight: 900, fontSize: 12, color: '#6B7280' }}>你的回答</div>
          <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} style={inputStyle} placeholder="輸入你的想法..." />

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" style={btnPrimary} onClick={() => alert('下一步：把回答寫入 submissions')}>
              送出
            </button>
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
  minHeight: 120,
  resize: 'vertical'
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
