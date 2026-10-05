import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// On-page replacement for window.confirm(). Some browsers (including embedded ones) block
// confirm() pop-ups and treat them as "cancel", which made buttons silently do nothing.
// Usage: const confirm = useConfirm(); if (!(await confirm('確定？'))) return;
const ConfirmCtx = createContext(async () => false);

export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null); // { message, confirmText, danger, resolve }
  const okRef = useRef(null);

  const confirm = useCallback((message, opts = {}) => new Promise((resolve) => {
    setReq({ message: String(message || ''), confirmText: opts.confirmText || '確定', danger: !!opts.danger, resolve });
  }), []);

  const close = (answer) => {
    if (req) req.resolve(answer);
    setReq(null);
  };

  useEffect(() => {
    if (!req) return undefined;
    okRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') close(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {req ? (
        <div role="presentation" onMouseDown={() => close(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 10000,
        }}>
          <div role="alertdialog" aria-modal="true" aria-label="確認" onMouseDown={(e) => e.stopPropagation()} style={{
            width: 'min(420px, 100%)', background: '#FFFFFF', borderRadius: 18, padding: '22px 20px 16px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)', display: 'grid', gap: 18,
          }}>
            <div style={{ fontSize: 15, lineHeight: 1.6, color: '#1D1D1F', whiteSpace: 'pre-line' }}>{req.message}</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="qcBtn qcBtnSecondary" onClick={() => close(false)}>取消</button>
              <button type="button" ref={okRef} className="qcBtn qcBtnPrimary" onClick={() => close(true)}
                style={req.danger ? { background: '#D70015' } : undefined}>{req.confirmText}</button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmCtx);
}
