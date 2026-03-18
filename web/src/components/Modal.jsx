import React from 'react';

export default function Modal({ open, title, children, onClose, footer }) {
  if (!open) return null;

  return (
    <div style={backdrop} onMouseDown={onClose}>
      <div style={dialog} onMouseDown={(e) => e.stopPropagation()}>
        <div style={header}>
          <div style={{ fontWeight: 900, fontSize: 14 }}>{title}</div>
          <button type="button" style={closeBtn} onClick={onClose}>×</button>
        </div>
        <div style={body}>{children}</div>
        {footer ? <div style={footerStyle}>{footer}</div> : null}
      </div>
    </div>
  );
}

const backdrop = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(17,24,39,0.55)',
  display: 'grid',
  placeItems: 'center',
  padding: 16,
  zIndex: 9999,
};

const dialog = {
  width: 'min(1100px, 100%)',
  maxHeight: 'min(82vh, 900px)',
  background: 'white',
  borderRadius: 18,
  border: '1px solid rgba(17,24,39,0.10)',
  overflow: 'hidden',
  display: 'grid',
  gridTemplateRows: 'auto 1fr auto',
};

const header = {
  padding: '12px 14px',
  borderBottom: '1px solid rgba(17,24,39,0.10)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
};

const body = {
  padding: 14,
  overflow: 'auto',
};

const footerStyle = {
  padding: 14,
  borderTop: '1px solid rgba(17,24,39,0.10)',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 10,
  flexWrap: 'wrap',
};

const closeBtn = {
  width: 34,
  height: 34,
  borderRadius: 999,
  border: '1px solid rgba(17,24,39,0.10)',
  background: '#F2F2F7',
  color: '#111827',
  cursor: 'pointer',
  fontWeight: 900,
  fontSize: 18,
  lineHeight: '32px',
};
