import React from 'react';

export default function PlaceholderTab({ title }) {
  return (
    <div className="qcCard" style={{
      height: '60vh',
      display: 'grid',
      placeItems: 'center',
      borderRadius: 32,
      borderStyle: 'dashed'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: 999, background: 'white', border: '1px solid rgba(17,24,39,0.08)', boxShadow: '0 2px 12px rgba(0,0,0,0.03)', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
          <div style={{ color: '#007AFF', fontWeight: 900, fontSize: 22 }}>⧉</div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em' }}>{title}</div>
        <div style={{ marginTop: 10, color: '#6B7280', fontWeight: 700, maxWidth: 360, lineHeight: 1.7 }}>
          此模組目前為概念展示階段。後續會接上 QuestClass 的資料與功能。
        </div>
      </div>
    </div>
  );
}
