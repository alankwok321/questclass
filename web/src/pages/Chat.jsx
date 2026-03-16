import React, { useMemo, useState } from 'react';
import { chat } from '../services/api.js';
import { useToast } from '../components/Toast.jsx';
import { loadSettings } from '../services/settings.js';

export default function ChatPage() {
  const toast = useToast();
  const [topic, setTopic] = useState('general');
  const [mode, setMode] = useState('socratic');
  const [studentName, setStudentName] = useState('student');
  const [message, setMessage] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [debugOpen, setDebugOpen] = useState(true);
  const [debug, setDebug] = useState({ lastReq: null, lastRes: null, lastErr: null });

  const canSend = useMemo(() => message.trim().length > 0 && !loading, [message, loading]);

  const onSend = async () => {
    if (!canSend) return;
    const text = message.trim();
    setMessage('');
    setItems((prev) => [...prev, { role: 'user', text }]);

    const settings = loadSettings();
    const idTokenAvailable = Boolean(window.QuestClassFirebase?.getIdToken);
    const actorUid = window.__qc_user?.uid || null;

    const apiPayload = {
      message: text,
      topic,
      mode,
      studentName,
      // force local fallback into the request (even if build cache is weird)
      apiKey: settings.apiKey,
      apiBaseUrl: settings.apiBaseUrl,
      model: settings.apiModel,
      // Also send idToken if available
      idToken: idTokenAvailable ? await window.QuestClassFirebase.getIdToken() : null,
    };

    const reqPreview = {
      endpoint: '/api/chat',
      topic,
      mode,
      studentName,
      actorUid,
      settings: {
        apiBaseUrl: settings.apiBaseUrl || '',
        apiModel: settings.apiModel || '',
        hasApiKeyLocal: Boolean(String(settings.apiKey || '').trim()),
        aiStudentUid: settings.aiStudentUid || ''
      },
      payload: {
        hasApiKey: Boolean(String(apiPayload.apiKey || '').trim()),
        apiBaseUrl: apiPayload.apiBaseUrl || '',
        model: apiPayload.model || '',
        hasIdToken: Boolean(apiPayload.idToken)
      },
      firebase: {
        enabled: Boolean(window.QuestClassFirebase),
        idTokenAvailable
      }
    };
    setDebug({ lastReq: reqPreview, lastRes: null, lastErr: null });

    setLoading(true);
    try {
      const data = await chat(apiPayload);
      setItems((prev) => [...prev, { role: 'assistant', text: data.reply || '' }]);
      setDebug((d) => ({ ...d, lastRes: { ok: true, keys: Object.keys(data || {}), sample: { mode: data?.mode, replyLen: (data?.reply || '').length } } }));
    } catch (e) {
      setItems((prev) => [...prev, { role: 'error', text: e.message || 'chat failed' }]);
      setDebug((d) => ({ ...d, lastErr: { message: e?.message || String(e), stack: e?.stack || '' } }));
      toast.show('Chat 失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="card" style={{ padding: 14, borderRadius: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          <Field label="Topic" value={topic} onChange={setTopic} />
          <Field label="Mode" value={mode} onChange={setMode} />
          <Field label="Student" value={studentName} onChange={setStudentName} />
        </div>
      </div>

      <div className="card" style={{ minHeight: 360, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontWeight: 900 }}>對話</div>
          <button
            type="button"
            onClick={() => setDebugOpen(v => !v)}
            style={{ border: 0, background: 'transparent', color: '#007AFF', fontWeight: 900, cursor: 'pointer' }}
          >
            {debugOpen ? '隱藏 Debug' : '顯示 Debug'}
          </button>
        </div>

        {debugOpen ? (
          <div style={{ padding: 12, borderRadius: 18, border: '1px solid rgba(17,24,39,0.10)', background: '#F9FAFB', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', fontSize: 12, lineHeight: 1.5, color: '#111827' }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Debug board</div>
            <div style={{ display: 'grid', gap: 6 }}>
              <div><span style={k}>actorUid</span> {String(window.__qc_user?.uid || '—')}</div>
              <div><span style={k}>settings.aiStudentUid</span> {String(loadSettings().aiStudentUid || '—')}</div>
              <div><span style={k}>firebase bridge</span> {window.QuestClassFirebase ? 'OK' : 'missing'} · getIdToken: {window.QuestClassFirebase?.getIdToken ? 'OK' : 'missing'}</div>
              <div><span style={k}>localStorage.questclass_settings_v1</span></div>
              <pre style={pre}>{(() => {
                try {
                  const s = loadSettings() || {};
                  const safe = { ...s };
                  if (safe.apiKey) safe.apiKey = '***';
                  return JSON.stringify(safe, null, 2);
                } catch {
                  return '—';
                }
              })()}</pre>
              <div><span style={k}>lastReq</span></div>
              <pre style={pre}>{debug.lastReq ? JSON.stringify(debug.lastReq, null, 2) : '—'}</pre>
              <div><span style={k}>lastRes</span></div>
              <pre style={pre}>{debug.lastRes ? JSON.stringify(debug.lastRes, null, 2) : '—'}</pre>
              <div><span style={k}>lastErr</span></div>
              <pre style={pre}>{debug.lastErr ? JSON.stringify(debug.lastErr, null, 2) : '—'}</pre>
            </div>
          </div>
        ) : null}

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'grid', gap: 10 }}>
          {items.length === 0 ? (
            <div style={{ color: '#6B7280', fontWeight: 700 }}>
              在下面輸入訊息，會呼叫 <code>/api/chat</code>（繁中回覆）。
            </div>
          ) : null}

          {items.map((m, idx) => (
            <Bubble key={idx} role={m.role} text={m.text} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="輸入訊息..."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            style={{
              flex: 1,
              padding: '12px 14px',
              borderRadius: 18,
              border: '1px solid rgba(17,24,39,0.10)',
              background: '#F2F2F7',
              outline: 'none',
              fontWeight: 700,
            }}
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            style={{
              border: 0,
              background: canSend ? '#111827' : '#9CA3AF',
              color: 'white',
              padding: '12px 16px',
              borderRadius: 18,
              fontWeight: 900,
              cursor: canSend ? 'pointer' : 'not-allowed',
              minWidth: 96,
            }}
          >
            {loading ? '送出中…' : '送出'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <div style={{ fontWeight: 900, fontSize: 12, color: '#6B7280' }}>{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: '10px 12px',
          borderRadius: 14,
          border: '1px solid rgba(17,24,39,0.10)',
          background: '#F2F2F7',
          outline: 'none',
          fontWeight: 800,
        }}
      />
    </label>
  );
}

const k = { display: 'inline-block', minWidth: 160, fontWeight: 900, color: '#6B7280' };
const pre = { margin: 0, padding: 10, borderRadius: 14, border: '1px solid rgba(17,24,39,0.10)', background: 'white', overflow: 'auto' };

function Bubble({ role, text }) {
  const isUser = role === 'user';
  const isErr = role === 'error';
  return (
    <div style={{
      justifySelf: isUser ? 'end' : 'start',
      maxWidth: '84%',
      padding: '12px 14px',
      borderRadius: 18,
      background: isUser ? 'rgba(0,122,255,0.10)' : isErr ? 'rgba(255,59,48,0.10)' : 'rgba(17,24,39,0.06)',
      border: '1px solid rgba(17,24,39,0.08)',
      color: isErr ? '#B91C1C' : '#111827',
      fontWeight: 700,
      lineHeight: 1.6,
      whiteSpace: 'pre-wrap'
    }}>
      {text}
    </div>
  );
}
