import React, { useMemo, useState } from 'react';
import { clearSettings, loadSettings, saveSettings } from '../services/settings.js';

export default function ApiSettingsCard({ title = 'API 設定（本機）' }) {
  const initial = useMemo(() => {
    const s = loadSettings();
    return {
      apiBaseUrl: s.apiBaseUrl || 'https://openrouter.ai/api/v1',
      apiModel: s.apiModel || 'openai/gpt-4.1-mini',
      apiKey: s.apiKey || '',
      aiStudentUid: s.aiStudentUid || ''
    };
  }, []);

  const [form, setForm] = useState(initial);
  const [savedAt, setSavedAt] = useState('');

  const masked = (v) => (v ? `${String(v).slice(0, 3)}…${String(v).slice(-3)}` : '');

  const onSave = () => {
    saveSettings({
      apiBaseUrl: String(form.apiBaseUrl || '').trim(),
      apiModel: String(form.apiModel || '').trim(),
      apiKey: String(form.apiKey || '').trim(),
      aiStudentUid: String(form.aiStudentUid || '').trim(),
    });
    setSavedAt(new Date().toISOString());
  };

  const onClear = () => {
    clearSettings();
    setForm({ apiBaseUrl: 'https://openrouter.ai/api/v1', apiModel: 'openai/gpt-4.1-mini', apiKey: '', aiStudentUid: '' });
    setSavedAt('');
  };

  return (
    <div className="card">
      <div style={{ fontWeight: 900, marginBottom: 12 }}>{title}</div>
      <div style={{ display: 'grid', gap: 10 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <div style={label}>API Base URL</div>
          <input value={form.apiBaseUrl} onChange={(e) => setForm(s => ({ ...s, apiBaseUrl: e.target.value }))} style={inputStyle} placeholder="https://openrouter.ai/api/v1" />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <div style={label}>Model</div>
          <input value={form.apiModel} onChange={(e) => setForm(s => ({ ...s, apiModel: e.target.value }))} style={inputStyle} placeholder="openai/gpt-4.1-mini" />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <div style={label}>API Key</div>
          <input value={form.apiKey} onChange={(e) => setForm(s => ({ ...s, apiKey: e.target.value }))} style={inputStyle} placeholder="sk-..." type="password" />
          <div style={{ color: '#6B7280', fontWeight: 800, fontSize: 11 }}>目前：{masked(form.apiKey) || '（空）'}</div>
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <div style={label}>Student UID（由 admin/teacher 代設可填）</div>
          <input value={form.aiStudentUid} onChange={(e) => setForm(s => ({ ...s, aiStudentUid: e.target.value }))} style={inputStyle} placeholder="留空=自己" />
        </label>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClear} style={btnGhost}>清除</button>
          <button type="button" onClick={onSave} style={btnPrimary}>儲存</button>
        </div>

        {savedAt ? <div style={{ color: '#6B7280', fontWeight: 800, fontSize: 11 }}>已儲存：{savedAt}</div> : null}
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

const btnGhost = {
  border: '1px solid rgba(17,24,39,0.10)',
  background: '#F2F2F7',
  color: '#111827',
  padding: '10px 14px',
  borderRadius: 999,
  fontWeight: 900,
  cursor: 'pointer',
};
