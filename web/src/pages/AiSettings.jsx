import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/Toast.jsx';
import { getAiSettings, saveAiSettings, testAiSettings } from '../services/api.js';
import { listSchools } from '../services/firebase.js';
import { useConfirm } from '../components/Confirm.jsx';

// The one place a school's AI provider and API key are set: by that school's admin, or by the
// platform admin (who belongs to no school) for the school they pick.
// The key is sent to the server once, stored encrypted, and never shown again.
export default function AiSettingsPage({ user }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [info, setInfo] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [form, setForm] = useState({ apiBaseUrl: '', model: '', apiKey: '' });
  const [busy, setBusy] = useState('');
  const [testResult, setTestResult] = useState(null);
  const platform = user?.platformAdmin === true;
  const [schools, setSchools] = useState([]);
  // School admins always work on their own school; the platform admin picks one.
  const [schoolId, setSchoolId] = useState(platform ? '' : (user?.schoolId || ''));
  const target = platform ? schoolId : undefined;

  useEffect(() => {
    if (!platform) return;
    listSchools().then((r) => {
      const list = r?.schools || [];
      setSchools(list);
      setSchoolId((cur) => cur || list[0]?.id || '');
    });
  }, [platform]);

  const load = async () => {
    setLoadErr('');
    setInfo(null);
    if (platform && !schoolId) return;
    try {
      const data = await getAiSettings(target);
      setInfo(data);
      setForm({ apiBaseUrl: data.provider?.apiBaseUrl || '', model: data.provider?.model || '', apiKey: '' });
    } catch (e) {
      setLoadErr(e.message || '載入失敗');
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [schoolId]);

  if (String(user?.role || '').toLowerCase() !== 'admin' || (!user?.schoolId && !platform)) {
    return <div className="qcCard" style={{ color: '#D70015', fontWeight: 600 }}>只有學校管理員或平台管理員可使用此頁面。</div>;
  }

  const onSave = async (e) => {
    e?.preventDefault?.();
    setBusy('save');
    setTestResult(null);
    try {
      await saveAiSettings({ schoolId: target, apiBaseUrl: form.apiBaseUrl, model: form.model, apiKey: form.apiKey });
      toast.show(form.apiKey.trim() ? '已儲存，新的 API Key 已生效' : '已儲存');
      await load();
    } catch (err) {
      toast.show(err.message || '儲存失敗');
    } finally {
      setBusy('');
    }
  };

  const onClearKey = async () => {
    if (!await confirm('確定要移除已儲存的 API Key？移除後 AI 功能會改用伺服器環境變數（如有）。', { confirmText: '移除', danger: true })) return;
    setBusy('clear');
    setTestResult(null);
    try {
      await saveAiSettings({ schoolId: target, apiBaseUrl: form.apiBaseUrl, model: form.model, clearKey: true });
      toast.show('已移除 API Key');
      await load();
    } catch (err) {
      toast.show(err.message || '移除失敗');
    } finally {
      setBusy('');
    }
  };

  const onTest = async () => {
    setBusy('test');
    setTestResult(null);
    try {
      const r = await testAiSettings(target);
      setTestResult({ ok: true, text: `連線成功（${r.model}，來源：${SOURCE_NAMES[r.source] || r.source}）` });
    } catch (err) {
      setTestResult({ ok: false, text: err.message || '連線失敗' });
    } finally {
      setBusy('');
    }
  };

  const keyStatus = !info ? '—'
    : info.hasKey ? `已設定（${info.keyHint || '••••'}）`
    : info.envKeyConfigured ? '未在此設定，使用伺服器環境變數 OPENROUTER_API_KEY'
    : '未設定，AI 功能暫時無法使用';

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 720 }}>
      <div className="qcCard">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 className="qcSectionTitle">AI 設定</h2>
            <div style={{ color: '#6E6E73', fontSize: 14, marginTop: 4, lineHeight: 1.5 }}>
              每間學校各有一組 AI 設定。該校老師、學生和 AI 助理都使用該校的 API Key；其他學校無法查看或更改。
            </div>
          </div>
          <Link to="/admin" className="qcLink">← 管理後台</Link>
        </div>
        {platform ? (
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#6E6E73' }}>學校</span>
            {schools.length ? (
              <select value={schoolId} onChange={(e) => { setSchoolId(e.target.value); setTestResult(null); }} style={{ ...inputStyle, width: 'auto', minWidth: 220 }}>
                {schools.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            ) : <span style={{ fontSize: 14, color: '#86868B' }}>尚未有學校，請先到 <Link to="/admin/schools" className="qcLink">學校管理</Link> 建立。</span>}
          </label>
        ) : null}
        {loadErr ? <div style={{ marginTop: 12, color: '#D70015', fontWeight: 600 }}>{loadErr}</div> : null}
      </div>

      <div className="qcCard" style={{ display: 'grid', gap: 10 }}>
        <Row label="API Key" value={keyStatus} tone={info && !info.hasKey && !info.envKeyConfigured ? 'bad' : info?.hasKey ? 'good' : undefined} />
        <Row label="加密金鑰" value={!info ? '—' : info.encryptionConfigured ? '已設定' : '未設定 AI_CONFIG_ENCRYPTION_KEY，無法在此儲存 API Key'} tone={info && !info.encryptionConfigured ? 'bad' : undefined} />
        <Row label="最後更新" value={info?.updatedAt ? `${new Date(info.updatedAt).toLocaleString()}${info.updatedBy ? ` · ${info.updatedBy}` : ''}` : '—'} />
      </div>

      <form className="qcCard" onSubmit={onSave} style={{ display: 'grid', gap: 14 }}>
        <Field label="API Base URL" hint={info?.allowedHosts?.length ? `允許的網域：${info.allowedHosts.join('、')}` : ''}>
          <input value={form.apiBaseUrl} onChange={(e) => setForm((f) => ({ ...f, apiBaseUrl: e.target.value }))} placeholder="https://openrouter.ai/api/v1" style={inputStyle} />
        </Field>
        <Field label="模型">
          <input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} placeholder="openai/gpt-4.1-mini" style={inputStyle} />
        </Field>
        <Field label="新的 API Key" hint="留空＝保留目前的 Key。儲存後不會再顯示。">
          <input type="password" autoComplete="new-password" value={form.apiKey} onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))} placeholder="sk-or-..." style={inputStyle} />
        </Field>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="qcBtn qcBtnSecondary" onClick={onTest} disabled={!!busy || !info}>
              {busy === 'test' ? '測試中…' : '測試連線'}
            </button>
            {info?.hasKey ? (
              <button type="button" className="qcBtn qcBtnSecondary" style={{ color: '#D70015' }} onClick={onClearKey} disabled={!!busy}>
                {busy === 'clear' ? '移除中…' : '移除 Key'}
              </button>
            ) : null}
          </div>
          <button type="submit" className="qcBtn qcBtnPrimary" disabled={!!busy || !info}>
            {busy === 'save' ? '儲存中…' : '儲存'}
          </button>
        </div>
        {testResult ? (
          <div style={{ fontSize: 14, fontWeight: 600, color: testResult.ok ? '#248A3D' : '#D70015' }}>{testResult.text}</div>
        ) : null}
      </form>
    </div>
  );
}

const SOURCE_NAMES = { school: 'AI 設定頁', env: '伺服器環境變數' };

function Row({ label, value, tone }) {
  const color = tone === 'bad' ? '#D70015' : tone === 'good' ? '#248A3D' : '#1D1D1F';
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
      <div style={{ width: 88, flexShrink: 0, color: '#6E6E73', fontSize: 13, fontWeight: 600 }}>{label}</div>
      <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, color, overflowWrap: 'anywhere' }}>{value}</div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#6E6E73' }}>{label}</span>
      {children}
      {hint ? <span style={{ fontSize: 12, color: '#86868B' }}>{hint}</span> : null}
    </label>
  );
}

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '11px 14px',
  borderRadius: 12,
  border: '1px solid #D2D2D7',
  background: '#FFFFFF',
  outline: 'none',
  fontSize: 15,
  fontWeight: 500,
};
