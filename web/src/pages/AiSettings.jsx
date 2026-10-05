import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, KeyRound, RefreshCw, Search, Sparkles, Zap } from 'lucide-react';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/Confirm.jsx';
import { getAiSettings, listAiModels, saveAiSettings, testAiSettings } from '../services/api.js';
import { listSchools } from '../services/firebase.js';

// Where a school's AI provider, model and API key are set: by that school's admin, or by the
// platform admin for the school they pick. Switching model is one tap (saved at once); the key
// is sent to the server once, stored encrypted, and never shown again.

const PROVIDERS = [
  { id: 'openrouter', name: 'OpenRouter', note: '一個 Key 用數百款模型', url: 'https://openrouter.ai/api/v1' },
  { id: 'openai', name: 'OpenAI', note: 'GPT 系列', url: 'https://api.openai.com/v1' },
  { id: 'gemini', name: 'Google Gemini', note: 'Gemini 系列', url: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  { id: 'deepseek', name: 'DeepSeek', note: 'DeepSeek 系列', url: 'https://api.deepseek.com/v1' },
  { id: 'groq', name: 'Groq', note: '回應極快', url: 'https://api.groq.com/openai/v1' },
  { id: 'mistral', name: 'Mistral', note: 'Mistral 系列', url: 'https://api.mistral.ai/v1' },
];

const norm = (u) => String(u || '').trim().replace(/\/+$/, '');
const providerFor = (url) => PROVIDERS.find((p) => norm(p.url) === norm(url)) || null;
const hostOf = (url) => { try { return new URL(url).hostname; } catch { return url; } };

function formatContext(n) {
  if (!n) return '';
  return n >= 1000000 ? `${Math.round(n / 100000) / 10}M` : `${Math.round(n / 1000)}K`;
}

function formatPrice(m) {
  if (m.promptPrice == null && m.completionPrice == null) return '';
  if (!m.promptPrice && !m.completionPrice) return '免費';
  return `$${m.promptPrice} / $${m.completionPrice}`;
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

  // Provider being edited (may differ from the saved one until 儲存).
  const [baseUrl, setBaseUrl] = useState('');
  const [showCustomUrl, setShowCustomUrl] = useState(false);
  const [apiKey, setApiKey] = useState('');

  const [models, setModels] = useState(null); // null = not loaded
  const [modelsErr, setModelsErr] = useState('');
  const [query, setQuery] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [pendingModel, setPendingModel] = useState('');

  const savedBase = norm(info?.provider?.apiBaseUrl);
  const savedModel = info?.provider?.model || '';
  const providerChanged = Boolean(info) && norm(baseUrl) !== savedBase;
  const aiReady = Boolean(info?.hasKey || info?.envKeyConfigured);
  const currentProvider = providerFor(baseUrl);

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
    if (platform && !schoolId) return;
    try {
      const data = await getAiSettings(target);
      setInfo(data);
      setBaseUrl(norm(data.provider?.apiBaseUrl));
      setShowCustomUrl(!providerFor(data.provider?.apiBaseUrl));
      setApiKey('');
      setPendingModel('');
    } catch (e) {
      setLoadErr(e.message || '載入失敗');
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [schoolId]);

  const loadModels = async (url = baseUrl) => {
    if (!url) return;
    setModels(null);
    setModelsErr('');
    try {
      const r = await listAiModels({ schoolId: target, apiBaseUrl: url });
      setModels(r.models || []);
    } catch (e) {
      setModels([]);
      setModelsErr(e.message || '無法載入模型列表');
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (info && baseUrl) loadModels(baseUrl); }, [info, baseUrl]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = models || [];
    return (q ? list.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)) : list);
  }, [models, query]);

  if (String(user?.role || '').toLowerCase() !== 'admin' || (!user?.schoolId && !platform)) {
    return <div className="qcCard" style={{ color: '#D70015', fontWeight: 600 }}>只有學校管理員或平台管理員可使用此頁面。</div>;
  }

  // One tap: switch the model on the saved provider and save at once.
  const chooseModel = async (id) => {
    const model = String(id || '').trim();
    if (!model) return;
    if (providerChanged || !aiReady) {
      // New provider (or no key yet): keep it until 儲存 together with the key.
      setPendingModel(model);
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

  const onSaveProvider = async (e) => {
    e?.preventDefault?.();
    const model = pendingModel || savedModel;
    if (!model) return toast.show('請先選擇模型');
    if (providerChanged && !apiKey.trim()) return toast.show(`請輸入 ${currentProvider?.name || '這個服務'} 的 API Key`);
    setBusy('save');
    setTestResult(null);
    try {
      await saveAiSettings({ schoolId: target, apiBaseUrl: baseUrl, model, apiKey });
      toast.show(apiKey.trim() ? '已儲存，新的 API Key 已生效' : '已儲存');
      await load();
    } catch (err) {
      toast.show(err.message || '儲存失敗');
    } finally {
      setBusy('');
    }
  };

  const onClearKey = async () => {
    if (!await confirm('確定要移除已儲存的 API Key？移除後這間學校的 AI 功能會停用（除非伺服器另有設定）。', { confirmText: '移除', danger: true })) return;
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

  const pickProvider = (p) => {
    setBaseUrl(norm(p.url));
    setShowCustomUrl(false);
    setPendingModel('');
    setQuery('');
  };

  const shownModel = pendingModel || savedModel;
  const recent = (info?.recentModels || []).filter((m) => !providerChanged);

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
              {info ? `${providerFor(savedBase)?.name || hostOf(savedBase)} · ${savedModel}${info.hasKey ? ` · Key ${info.keyHint}` : ''}` : ' '}
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

      {/* Model */}
      <div className="qcCard" style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={sectionTitle}>模型</div>
            <div style={sectionHint}>
              {providerChanged || !aiReady ? '選好模型後，在下面輸入 API Key 再按「儲存」。' : '點一下即可切換，立即生效。'}
            </div>
          </div>
          <div style={{ fontSize: 13, color: '#6E6E73' }}>
            目前：<span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#1D1D1F', fontWeight: 600 }}>{shownModel || '—'}</span>
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

        <div style={{ position: 'relative' }}>
          <Search size={16} aria-hidden="true" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#86868B' }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋模型，例如 gpt、claude、gemini、deepseek"
            aria-label="搜尋模型" style={{ ...inputStyle, paddingLeft: 36 }} />
        </div>

        <div style={{ border: '1px solid #E8E8ED', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#F5F5F7', fontSize: 12, color: '#6E6E73' }}>
            <span>
              {models === null ? '載入模型中…' : modelsErr ? '' : `${filtered.length} 個模型${currentProvider ? ` · ${currentProvider.name}` : ''}`}
              {models && models.some((m) => m.promptPrice != null) ? ' · 價錢為每百萬 tokens（輸入 / 輸出）' : ''}
            </span>
            <button type="button" className="qcLink" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => loadModels()} disabled={models === null}>
              <RefreshCw size={12} aria-hidden="true" />重新載入
            </button>
          </div>
          {modelsErr ? <div style={{ padding: 14, fontSize: 13, color: '#B25000' }}>{modelsErr}</div> : null}
          <div role="listbox" aria-label="模型" style={{ maxHeight: 340, overflowY: 'auto' }}>
            {(filtered || []).slice(0, 150).map((m) => {
              const on = m.id === shownModel;
              const meta = [formatContext(m.contextLength) && `${formatContext(m.contextLength)} context`, formatPrice(m)].filter(Boolean).join(' · ');
              return (
                <button key={m.id} type="button" role="option" aria-selected={on} onClick={() => chooseModel(m.id)} disabled={!!busy} style={{
                  display: 'flex', width: '100%', alignItems: 'center', gap: 12, padding: '10px 12px', border: 0, borderTop: '1px solid #F0F0F3',
                  background: on ? '#E8F0FC' : '#FFFFFF', cursor: 'pointer', textAlign: 'left',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: on ? '#0071E3' : '#1D1D1F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.name || m.id}
                    </div>
                    <div style={{ fontSize: 12, color: '#86868B', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{m.id}</span>{meta ? ` · ${meta}` : ''}
                    </div>
                  </div>
                  {busy === 'model:' + m.id ? <span style={{ fontSize: 12, color: '#6E6E73' }}>切換中…</span>
                    : on ? <Check size={18} color="#0071E3" aria-hidden="true" /> : null}
                </button>
              );
            })}
            {models && !modelsErr && filtered.length === 0 ? <div style={{ padding: 14, fontSize: 13, color: '#86868B' }}>找不到符合的模型</div> : null}
            {filtered.length > 150 ? <div style={{ padding: 10, fontSize: 12, color: '#86868B', textAlign: 'center' }}>只顯示前 150 個，請用搜尋縮窄範圍</div> : null}
          </div>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); chooseModel(customModel); setCustomModel(''); }} style={{ display: 'flex', gap: 8 }}>
          <input value={customModel} onChange={(e) => setCustomModel(e.target.value)} placeholder="或直接輸入模型 ID"
            aria-label="模型 ID" style={{ ...inputStyle, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 14 }} />
          <button type="submit" className="qcBtn qcBtnSecondary" disabled={!customModel.trim() || !!busy}>使用</button>
        </form>
      </div>

      {/* Provider + key */}
      <form className="qcCard" onSubmit={onSaveProvider} style={{ display: 'grid', gap: 14 }}>
        <div>
          <div style={sectionTitle}>AI 服務與 API Key</div>
          <div style={sectionHint}>換服務需要該服務的 API Key。用 OpenRouter 的話，一個 Key 已可使用大部分模型。</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          {PROVIDERS.map((p) => {
            const on = !showCustomUrl && norm(p.url) === norm(baseUrl);
            const isSaved = norm(p.url) === savedBase;
            return (
              <button key={p.id} type="button" onClick={() => pickProvider(p)} aria-pressed={on} style={{
                textAlign: 'left', padding: '12px 12px', borderRadius: 14, cursor: 'pointer',
                border: on ? '2px solid #0071E3' : '1px solid #D2D2D7', background: on ? '#E8F0FC' : '#FFFFFF',
                margin: on ? 0 : 1,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: '#1D1D1F' }}>{p.name}</span>
                  {isSaved ? <span style={{ fontSize: 11, color: '#248A3D', fontWeight: 600 }}>使用中</span> : null}
                </div>
                <div style={{ fontSize: 12, color: '#6E6E73', marginTop: 3 }}>{p.note}</div>
              </button>
            );
          })}
        </div>

        <button type="button" className="qcLink" onClick={() => setShowCustomUrl((v) => !v)}
          style={{ justifySelf: 'start', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }} aria-expanded={showCustomUrl}>
          <ChevronDown size={14} aria-hidden="true" style={{ transform: showCustomUrl ? 'rotate(180deg)' : 'none' }} />其他服務（自訂網址）
        </button>
        {showCustomUrl ? (
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={labelStyle}>API Base URL</span>
            <input value={baseUrl} onChange={(e) => { setBaseUrl(e.target.value); setPendingModel(''); }} onBlur={(e) => setBaseUrl(norm(e.target.value))}
              placeholder="https://…/v1" style={inputStyle} />
            {info?.allowedHosts?.length ? <span style={{ fontSize: 12, color: '#86868B' }}>允許的網域：{info.allowedHosts.join('、')}</span> : null}
          </label>
        ) : null}

        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ ...labelStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <KeyRound size={14} aria-hidden="true" />
            {providerChanged ? `${currentProvider?.name || '新服務'} 的 API Key` : (info?.hasKey ? `更換 API Key（目前 ${info.keyHint}）` : 'API Key')}
          </span>
          <input type="password" autoComplete="new-password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder={providerChanged || !info?.hasKey ? '貼上 API Key' : '留空＝保留目前的 Key'} style={inputStyle} />
          {!info?.encryptionConfigured && info ? (
            <span style={{ fontSize: 12, color: '#D70015' }}>伺服器未設定 AI_CONFIG_ENCRYPTION_KEY，暫時無法儲存 API Key。</span>
          ) : <span style={{ fontSize: 12, color: '#86868B' }}>Key 會加密儲存，之後不會再顯示。</span>}
        </label>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
          {info?.hasKey && !providerChanged ? (
            <button type="button" className="qcLink" style={{ color: '#D70015', fontSize: 13 }} onClick={onClearKey} disabled={!!busy}>
              {busy === 'clear' ? '移除中…' : '移除 API Key'}
            </button>
          ) : <span />}
          <button type="submit" className="qcBtn qcBtnPrimary" disabled={!!busy || !info || (!providerChanged && !apiKey.trim() && !pendingModel)}>
            {busy === 'save' ? '儲存中…' : '儲存'}
          </button>
        </div>
      </form>
    </div>
  );
}

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
