import React, { createContext, useContext, useMemo, useState } from 'react';

const ToastCtx = createContext({ show: () => {} });

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);

  const api = useMemo(() => ({
    show: (text) => {
      setToast(String(text || ''));
      window.clearTimeout(window.__qc_toast_timer);
      window.__qc_toast_timer = window.setTimeout(() => setToast(null), 2400);
    }
  }), []);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {toast ? (
        <div style={{
          position: 'fixed',
          left: '50%',
          bottom: 18,
          transform: 'translateX(-50%)',
          background: 'rgba(17,24,39,0.92)',
          color: 'white',
          padding: '10px 14px',
          borderRadius: 999,
          fontWeight: 700,
          fontSize: 13,
          boxShadow: '0 16px 40px rgba(0,0,0,0.25)',
          zIndex: 9999,
          maxWidth: 'calc(100vw - 24px)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>{toast}</div>
      ) : null}
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
