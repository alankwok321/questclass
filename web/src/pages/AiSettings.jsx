import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, KeyRound, RefreshCw, Search, Sparkles, Zap } from 'lucide-react';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/Confirm.jsx';
import { getAiSettings, listAiModels, saveAiSettings, testAiSettings } from '../services/api.js';
import { listSchools } from '../services/firebase.js';

// Where a school's AI provider, model and API key are set: by that school's admin, or by the
// platform admin for the school they pick. Switching model is one tap (saved at once); the key
// is sent to the server once, stored encrypted, and never shown again.

const OPENAI_URL = 'https://api.openai.com/v1';
const NOT_CHAT = /(audio|realtime|tts|transcribe|whisper|image|dall-e|embedding|moderation|search|instruct|davinci|babbage|sora)/i;

// Codex uses the same OpenAI key, so switching between GPT and Codex models needs no new key.
const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', note: 'GPT 系列', url: OPENAI_URL, keyName: 'OpenAI',
    show: (id) => /^(gpt|o\d|chatgpt)/i.test(id) && !/codex/i.test(id) && !NOT_CHAT.test(id) },
  { id: 'codex', name: 'Codex', note: 'OpenAI 編程模型，用 OpenAI Key', url: OPENAI_URL, keyName: 'OpenAI',
    show: (id) => /codex/i.test(id) },
  { id: 'gemini', name: 'Google Gemini', note: 'Gemini 系列', url: 'https://generativelanguage.googleapis.com/v1beta/openai', keyName: 'Gemini',
    show: (id) => /gemini/i.test(id) && !NOT_CHAT.test(id) && !/aqa/i.test(id) },
  { id: 'deepseek', name: 'DeepSeek', note: 'DeepSeek 系列', url: 'https://api.deepseek.com/v1', keyName: 'DeepSeek',
    show: () => true },
];

const norm = (u) => String(u || '').trim().replace(/\/+$/, '');
const hostOf = (url) => { try { return new URL(url).hostname; } catch { return url; } };
function providerOf(base, model) {
  if (norm(base) === OPENAI_URL) return PROVIDERS.find((p) => p.id === (/codex/i.test(model || '') ? 'codex' : 'openai'));
  return PROVIDERS.find((p) => norm(p.url) === norm(base)) || null;
}

function formatContext(n) {
  if (!n) return '';
  return n >= 1000000 ? `${Math.round(n / 100000) / 10}M` : `${Math.round(n / 1000)}K`;
}

export default function AiSettingsPage({ user }) {
  const toast = useToast();
  const confirm = useConfirm();
  const platform = user?.platformAdmin === true;

  const [schools, setSchools] = useState([]);
  // School admins always work on their own school; the platform admin picks one.
  const [schoolId, setSchoolId] = useState(platform ? (window.QuestClassFirebase?.getActiveSchool?.() || '') : (user?.schoolId || ''));
  const target = platform ? schoolId : undefined;

  const [info, setInfo] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [busy, setBusy] = useState('');
  const [testResult, setTestResult] = useState(null);

  const [tileId, setTileId] = useState('openai'); // provider tile being looked at / edited
  const [apiKey, setApiKey] = useState('');

  const [models, setModels] = useState(null); // null = not loaded yet
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsErr, setModelsErr] = useState('');
  const [query, setQuery] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [pendingModel, setPendingModel] = useState('');

  const tile = PROVIDERS.find((p) => p.id === tileId) || PROVIDERS[0];
  const savedBase = norm(info?.provider?.apiBaseUrl);
  const savedModel = info?.provider?.model || '';
  const savedProvider = info ? providerOf(savedBase, savedModel) : null;
  // A different service needs its own key; OpenAI ⇄ Codex share one.
  const providerChanged = Boolean(info) && norm(tile.url) !== savedBase;
  const hasSavedKeyHere = Boolean(info?.hasKey) && !providerChanged;
  const aiReady = Boolean(info?.hasKey || info?.envKeyConfigured);

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
    setTestResult(null);
    setModels(null);
    setModelsErr('');
    if (platform && !schoolId) return;
    try {
      const data = await getAiSettings(target);
      setInfo(data);
      setTileId(providerOf(data.provider?.apiBaseUrl, data.provider?.model)?.id || 'openai');
      setApiKey('');
      setPendingModel('');
    } catch (e) {
      setLoadErr(e.message || '載入失敗');
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [schoolId]);

  // Models are listed only with a key: the one saved for this service, or one just typed.
  const loadModels = async () => {
    const typed = apiKey.trim();
    if (!hasSavedKeyHere && !typed) return;
    setModelsLoading(true);
    setModelsErr('');
    try {
      const r = await listAiModels({ schoolId: target, apiBaseUrl: tile.url, apiKey: typed || undefined });
      setModels(r.models || []);
    } catch (e) {
      setModels(null);
      setModelsErr(e.message || '無法載入模型列表');
    } finally {
      setModelsLoading(false);
    }
  };

  // With a saved key, list the models as soon as the service is shown. Otherwise wait for a key.
  useEffect(() => {
    setModels(null);
    setModelsErr('');
    if (info && hasSavedKeyHere) loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info, tile.url]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (models || [])
      .filter((m) => tile.show(m.id))
      .filter((m) => !q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [models, query, tile]);

  if (String(user?.role || '').toLowerCase() !== 'admin' || (!user?.schoolId && !platform)) {
    return <div className="qcCard" style={{ color: '#D70015', fontWeight: 600 }}>只有學校管理員或平台管理員可使用此頁面。</div>;
  }

  // One tap: switch the model on the saved service and save at once.
  const chooseModel = async (id) => {
    const model = String(id || '').trim();
    if (!model) return;
    if (providerChanged || !info?.hasKey) {
      setPendingModel(model); // saved together with the new key
      return;
    }
    if (model === savedModel) return;
    setBusy('model:' + model);
    setTestResult(null);
    try {
      await saveAiSettings({ schoolId: target, apiBaseUrl: savedBase, model });
      toast.show(`已切換到 ${model}`);
      await load();
    } catch (e) {
      toast.show(e.message || '切換失敗');
    } finally {
      setBusy('');
    }
  };

  const onSave = async (e) => {
    e?.preventDefault?.();
    const model = pendingModel || (providerChanged ? '' : savedModel);
    if (!apiKey.trim() && (providerChanged || !info?.hasKey)) return toast.show(`請輸入 ${tile.keyName} 的 API Key`);
    if (!model) return toast.show('請先選擇模型');
    setBusy('save');
    setTestResult(null);
    try {
      await saveAiSettings({ schoolId: target, apiBaseUrl: tile.url, model, apiKey });
      toast.show(apiKey.trim() ? '已儲存，新的 API Key 已生效' : '已儲存');
      await load();
    } catch (err) {
      toast.show(err.message || '儲存失敗');
    } finally {
      setBusy('');
    }
  };

  const onClearKey = async () => {
    if (!await confirm('確定要移除已儲存的 API Key？移除後這間學校的 AI 功能會停用。', { confirmText: '移除', danger: true })) return;
    setBusy('clear');
    try {
      await saveAiSettings({ schoolId: target, apiBaseUrl: savedBase, model: savedModel, clearKey: true });
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
      setTestResult({ ok: true, text: `連線成功 · ${r.model}` });
    } catch (err) {
      setTestResult({ ok: false, text: err.message || '連線失敗' });
    } finally {
      setBusy('');
    }
  };

  const pickTile = (p) => {
    setTileId(p.id);
    setPendingModel('');
    setQuery('');
    if (norm(p.url) !== norm(tile.url)) setApiKey('');
  };

  const shownModel = pendingModel || (providerChanged ? '' : savedModel);
  const recent = providerChanged ? [] : (info?.recentModels || []).filter((m) => tile.show(m));
  const needsKey = !hasSavedKeyHere;
  const canSave = !!info && !busy && (apiKey.trim() || pendingModel) && (!needsKey || apiKey.trim());

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 760 }}>
      {/* Header + status */}
      <div className="qcCard" style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <h2 className="qcSectionTitle">AI 設定</h2>
            <div style={{ color: '#6E6E73', fontSize: 14, marginTop: 4, lineHeight: 1.5 }}>
              每間學校各有自己的 AI 服務、模型和 API Key。老師、學生和 AI 助理都會使用這裡的設定。
            </div>
          </div>
          {platform && schools.length ? (
            <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)} aria-label="學校" style={{ ...inputStyle, width: 'auto', minWidth: 180 }}>
              {schools.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          ) : null}
        </div>
        {platform && !schools.length ? (
          <div style={{ fontSize: 14, color: '#86868B' }}>尚未有學校，請先到 <Link to="/admin/schools" className="qcLink">學校管理</Link> 建立。</div>
        ) : null}
        {loadErr ? <div style={{ color: '#D70015', fontWeight: 600 }}>{loadErr}</div> : null}

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, background: aiReady ? 'rgba(52,199,89,0.10)' : 'rgba(255,59,48,0.08)' }}>
          <div aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', flexShrink: 0, color: '#fff',
            background: aiReady ? 'linear-gradient(135deg, #34C759, #248A3D)' : 'linear-gradient(135deg, #FF6961, #D70015)' }}>
            <Sparkles size={20} strokeWidth={2} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{!info ? '載入中…' : aiReady ? 'AI 已啟用' : '尚未設定 API Key'}</div>
            <div style={{ fontSize: 13, color: '#6E6E73', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {info?.hasKey ? `${savedProvider?.name || hostOf(savedBase)} · ${savedModel} · Key ${info.keyHint}` : info ? '選擇 AI 服務並輸入 API Key 開始使用' : ' '}
            </div>
          </div>
          <button type="button" className="qcBtn qcBtnSecondary qcBtnSmall" onClick={onTest} disabled={!!busy || !info || !aiReady}>
            <Zap size={14} aria-hidden="true" />{busy === 'test' ? '測試中…' : '測試連線'}
          </button>
        </div>
        {testResult ? (
          <div role="status" style={{ fontSize: 13, fontWeight: 600, color: testResult.ok ? '#248A3D' : '#D70015', marginTop: -6 }}>{testResult.text}</div>
        ) : null}
      </div>

      {/* Service + key */}
      <form className="qcCard" onSubmit={onSave} style={{ display: 'grid', gap: 14 }}>
        <div>
          <div style={sectionTitle}>AI 服務</div>
          <div style={sectionHint}>OpenAI 和 Codex 共用同一個 OpenAI API Key。</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          {PROVIDERS.map((p) => {
            const on = p.id === tileId;
            const inUse = info?.hasKey && savedProvider?.id === p.id;
            return (
              <button key={p.id} type="button" onClick={() => pickTile(p)} aria-pressed={on} style={{
                textAlign: 'left', padding: 12, borderRadius: 14, cursor: 'pointer', margin: on ? 0 : 1,
                border: on ? '2px solid #0071E3' : '1px solid #D2D2D7', background: on ? '#E8F0FC' : '#FFFFFF',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: '#1D1D1F' }}>{p.name}</span>
                  {inUse ? <span style={{ fontSize: 11, color: '#248A3D', fontWeight: 600 }}>使用中</span> : null}
                </div>
                <div style={{ fontSize: 12, color: '#6E6E73', marginTop: 3 }}>{p.note}</div>
              </button>
            );
          })}
        </div>

        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ ...labelStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <KeyRound size={14} aria-hidden="true" />
            {hasSavedKeyHere ? `更換 ${tile.keyName} API Key（目前 ${info.keyHint}）` : `${tile.keyName} API Key`}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="password" autoComplete="new-password" value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); if (!hasSavedKeyHere) { setModels(null); setModelsErr(''); } }}
              onBlur={() => { if (apiKey.trim() && !models) loadModels(); }}
              placeholder={hasSavedKeyHere ? '留空＝保留目前的 Key' : '貼上 API Key'} style={inputStyle} />
            {!hasSavedKeyHere ? (
              <button type="button" className="qcBtn qcBtnSecondary" onClick={loadModels} disabled={!apiKey.trim() || modelsLoading}>
                {modelsLoading ? '載入中…' : '顯示模型'}
              </button>
            ) : null}
          </div>
          {info && !info.encryptionConfigured ? (
            <span style={{ fontSize: 12, color: '#D70015' }}>伺服器未設定 AI_CONFIG_ENCRYPTION_KEY，暫時無法儲存 API Key。</span>
          ) : <span style={{ fontSize: 12, color: '#86868B' }}>Key 會加密儲存，之後不會再顯示。</span>}
        </label>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
          {info?.hasKey && !providerChanged ? (
            <button type="button" className="qcLink" style={{ color: '#D70015', fontSize: 13 }} onClick={onClearKey} disabled={!!busy}>
              {busy === 'clear' ? '移除中…' : '移除 API Key'}
            </button>
          ) : <span style={{ fontSize: 13, color: '#6E6E73' }}>{pendingModel ? `已選模型：${pendingModel}` : needsKey ? '輸入 Key 後選擇模型，再按儲存。' : ''}</span>}
          <button type="submit" className="qcBtn qcBtnPrimary" disabled={!canSave}>
            {busy === 'save' ? '儲存中…' : '儲存'}
          </button>
        </div>
      </form>

      {/* Model */}
      <div className="qcCard" style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={sectionTitle}>模型</div>
            <div style={sectionHint}>
              {needsKey ? `輸入 ${tile.keyName} API Key 後，會在這裡顯示可用的模型。` : '點一下即可切換，立即生效。'}
            </div>
          </div>
          <div style={{ fontSize: 13, color: '#6E6E73' }}>
            目前：<span style={{ fontFamily: monoFont, color: '#1D1D1F', fontWeight: 600 }}>{shownModel || '—'}</span>
            {pendingModel ? <span style={{ color: '#B25000' }}>（未儲存）</span> : null}
          </div>
        </div>

        {recent.length ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} aria-label="最近使用">
            {recent.map((m) => {
              const on = m === shownModel;
              return (
                <button key={m} type="button" onClick={() => chooseModel(m)} disabled={!!busy} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 999, cursor: 'pointer',
                  border: on ? '1px solid #0071E3' : '1px solid #D2D2D7', background: on ? '#E8F0FC' : '#FFFFFF',
                  color: on ? '#0071E3' : '#1D1D1F', fontSize: 13, fontWeight: 500, maxWidth: '100%',
                }}>
                  {on ? <Check size={14} aria-hidden="true" /> : null}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        {models === null ? (
          <div style={{ padding: '28px 16px', borderRadius: 14, background: '#F5F5F7', textAlign: 'center', color: '#6E6E73', fontSize: 14 }}>
            {modelsLoading ? '載入模型中…'
              : modelsErr ? <span style={{ color: '#B25000' }}>{modelsErr}</span>
              : needsKey ? (
                <><KeyRound size={22} aria-hidden="true" style={{ display: 'block', margin: '0 auto 8px', color: '#86868B' }} />先在上面輸入 {tile.keyName} API Key</>
              ) : '—'}
          </div>
        ) : (
          <>
            <div style={{ position: 'relative' }}>
              <Search size={16} aria-hidden="true" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#86868B' }} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋模型" aria-label="搜尋模型" style={{ ...inputStyle, paddingLeft: 36 }} />
            </div>
            <div style={{ border: '1px solid #E8E8ED', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#F5F5F7', fontSize: 12, color: '#6E6E73' }}>
                <span>{filtered.length} 個 {tile.name} 模型</span>
                <button type="button" className="qcLink" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={loadModels} disabled={modelsLoading}>
                  <RefreshCw size={12} aria-hidden="true" />重新載入
                </button>
              </div>
              <div role="listbox" aria-label="模型" style={{ maxHeight: 340, overflowY: 'auto' }}>
                {filtered.map((m) => {
                  const on = m.id === shownModel;
                  return (
                    <button key={m.id} type="button" role="option" aria-selected={on} onClick={() => chooseModel(m.id)} disabled={!!busy} style={{
                      display: 'flex', width: '100%', alignItems: 'center', gap: 12, padding: '11px 12px', border: 0, borderTop: '1px solid #F0F0F3',
                      background: on ? '#E8F0FC' : '#FFFFFF', cursor: 'pointer', textAlign: 'left',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, fontFamily: monoFont, color: on ? '#0071E3' : '#1D1D1F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.id}
                        </div>
                        {m.name || m.contextLength ? (
                          <div style={{ fontSize: 12, color: '#86868B', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {[m.name, m.contextLength && `${formatContext(m.contextLength)} context`].filter(Boolean).join(' · ')}
                          </div>
                        ) : null}
                      </div>
                      {busy === 'model:' + m.id ? <span style={{ fontSize: 12, color: '#6E6E73' }}>切換中…</span>
                        : on ? <Check size={18} color="#0071E3" aria-hidden="true" /> : null}
                    </button>
                  );
                })}
                {filtered.length === 0 ? <div style={{ padding: 14, fontSize: 13, color: '#86868B' }}>找不到符合的模型</div> : null}
              </div>
            </div>
          </>
        )}

        <form onSubmit={(e) => { e.preventDefault(); chooseModel(customModel); setCustomModel(''); }} style={{ display: 'flex', gap: 8 }}>
          <input value={customModel} onChange={(e) => setCustomModel(e.target.value)} placeholder="或直接輸入模型 ID"
            aria-label="模型 ID" style={{ ...inputStyle, fontFamily: monoFont, fontSize: 14 }} />
          <button type="submit" className="qcBtn qcBtnSecondary" disabled={!customModel.trim() || !!busy}>使用</button>
        </form>
      </div>
    </div>
  );
}

const monoFont = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const sectionTitle = { fontWeight: 700, fontSize: 17 };
const sectionHint = { fontSize: 13, color: '#6E6E73', marginTop: 4, lineHeight: 1.5 };
const labelStyle = { fontSize: 13, fontWeight: 600, color: '#6E6E73' };

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
