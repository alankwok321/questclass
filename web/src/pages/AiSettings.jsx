import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, ExternalLink, KeyRound, LogIn, RefreshCw, Search, Sparkles, Zap } from 'lucide-react';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/Confirm.jsx';
import {
  chatgptLoginPoll, chatgptLoginStart, chatgptLogout,
  getAiSettings, listAiModels, saveAiSettings, testAiSettings,
} from '../services/api.js';
import { listSchools } from '../services/firebase.js';

// Where a school's AI service, model and credentials are set: by that school's admin, or by the
// platform admin for the school they pick. OpenAI / Gemini / DeepSeek use an API key; Codex signs
// in with a ChatGPT account (like the pi agent). Switching model is one tap.

const NOT_CHAT = /(audio|realtime|tts|transcribe|whisper|image|dall-e|embedding|moderation|search|instruct|davinci|babbage|sora)/i;

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', note: 'API Key', url: 'https://api.openai.com/v1', keyName: 'OpenAI',
    show: (id) => /^(gpt|o\d|chatgpt|codex)/i.test(id) && !NOT_CHAT.test(id) },
  { id: 'codex', name: 'Codex', note: '用 ChatGPT 帳戶登入', login: true, show: () => true },
  { id: 'gemini', name: 'Google Gemini', note: 'API Key', url: 'https://generativelanguage.googleapis.com/v1beta/openai', keyName: 'Gemini',
    show: (id) => /gemini/i.test(id) && !NOT_CHAT.test(id) && !/aqa/i.test(id) },
  { id: 'deepseek', name: 'DeepSeek', note: 'API Key', url: 'https://api.deepseek.com/v1', keyName: 'DeepSeek', show: () => true },
];

const norm = (u) => String(u || '').trim().replace(/\/+$/, '');
const keyTileFor = (base) => PROVIDERS.find((p) => p.url && norm(p.url) === norm(base)) || null;

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
  const [tileId, setTileId] = useState('openai');
  const [apiKey, setApiKey] = useState('');

  const [models, setModels] = useState(null); // null = not loaded yet
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsErr, setModelsErr] = useState('');
  const [query, setQuery] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [pendingModel, setPendingModel] = useState('');

  // ChatGPT device-code sign-in in progress: { userCode, verificationUri, interval, until }
  const [login, setLogin] = useState(null);
  const pollTimer = useRef(null);

  const tile = PROVIDERS.find((p) => p.id === tileId) || PROVIDERS[0];
  const onChatgpt = info?.mode === 'chatgpt';
  const chatgptConnected = Boolean(info?.chatgpt?.connected);
  // The API-key setup: the active one, or (while on Codex) the one to switch back to.
  const keySetup = info ? (onChatgpt ? info.apiKeyProvider : info.provider) : null;
  const keyBase = norm(keySetup?.apiBaseUrl);
  const activeTileId = !info ? '' : onChatgpt ? 'codex' : (keyTileFor(info.provider?.apiBaseUrl)?.id || '');
  const isActiveTile = tile.id === activeTileId;

  const hasSavedKeyHere = !tile.login && Boolean(info?.hasKey) && norm(tile.url) === keyBase;
  const canListModels = tile.login ? chatgptConnected : (hasSavedKeyHere || Boolean(apiKey.trim()));
  // The model this tile would use: the live one if active, else the remembered one.
  const tileModel = isActiveTile ? (info?.provider?.model || '') : (!tile.login && hasSavedKeyHere ? (keySetup?.model || '') : '');
  const shownModel = pendingModel || tileModel;
  const aiReady = Boolean((onChatgpt && chatgptConnected) || (!onChatgpt && (info?.hasKey || info?.envKeyConfigured)));

  useEffect(() => {
    if (!platform) return;
    listSchools().then((r) => {
      const list = r?.schools || [];
      setSchools(list);
      setSchoolId((cur) => cur || list[0]?.id || '');
    });
  }, [platform]);

  const stopPolling = () => { if (pollTimer.current) clearTimeout(pollTimer.current); pollTimer.current = null; };
  useEffect(() => stopPolling, []);

  const load = async (keepTile = false) => {
    setLoadErr('');
    setTestResult(null);
    if (platform && !schoolId) { setInfo(null); return; }
    try {
      const data = await getAiSettings(target);
      setInfo(data);
      if (!keepTile) setTileId(data.mode === 'chatgpt' ? 'codex' : (keyTileFor(data.provider?.apiBaseUrl)?.id || 'openai'));
      setApiKey('');
      setPendingModel('');
    } catch (e) {
      setLoadErr(e.message || '載入失敗');
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { stopPolling(); setLogin(null); setInfo(null); load(); }, [schoolId]);

  const loadModels = async () => {
    if (!canListModels) return;
    setModelsLoading(true);
    setModelsErr('');
    try {
      const r = tile.login
        ? await listAiModels({ schoolId: target, mode: 'chatgpt' })
        : await listAiModels({ schoolId: target, apiBaseUrl: tile.url, apiKey: hasSavedKeyHere ? undefined : apiKey.trim() });
      setModels(r.models || []);
    } catch (e) {
      setModels(null);
      setModelsErr(e.message || '無法載入模型列表');
    } finally {
      setModelsLoading(false);
    }
  };

  // Models appear only once there is a credential: a saved key, or a ChatGPT sign-in.
  useEffect(() => {
    setModels(null);
    setModelsErr('');
    if (info && (tile.login ? chatgptConnected : hasSavedKeyHere)) loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info, tileId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (models || [])
      .filter((m) => tile.show(m.id))
      .filter((m) => !q || m.id.toLowerCase().includes(q) || String(m.name || '').toLowerCase().includes(q))
      .sort((a, b) => (tile.login ? 0 : a.id.localeCompare(b.id)));
  }, [models, query, tile]);

  if (String(user?.role || '').toLowerCase() !== 'admin' || (!user?.schoolId && !platform)) {
    return <div className="qcCard" style={{ color: '#D70015', fontWeight: 600 }}>只有學校管理員或平台管理員可使用此頁面。</div>;
  }

  // ── actions ──────────────────────────────────────────────────────────────
  const chooseModel = async (id) => {
    const model = String(id || '').trim();
    if (!model) return;
    if (tile.login ? !chatgptConnected : !hasSavedKeyHere) { setPendingModel(model); return; }
    if (isActiveTile && model === info?.provider?.model) return;
    setBusy('model:' + model);
    setTestResult(null);
    try {
      if (tile.login) await saveAiSettings({ schoolId: target, mode: 'chatgpt', model });
      else await saveAiSettings({ schoolId: target, apiBaseUrl: tile.url, model });
      toast.show(isActiveTile ? `已切換到 ${model}` : `已改用 ${tile.name} · ${model}`);
      await load(true);
    } catch (e) {
      toast.show(e.message || '切換失敗');
    } finally {
      setBusy('');
    }
  };

  const onSaveKey = async (e) => {
    e?.preventDefault?.();
    const model = pendingModel || tileModel;
    if (!apiKey.trim()) return toast.show(`請輸入 ${tile.keyName} 的 API Key`);
    if (!model) return toast.show('請先選擇模型');
    setBusy('save');
    try {
      await saveAiSettings({ schoolId: target, apiBaseUrl: tile.url, model, apiKey });
      toast.show(`已儲存，現正使用 ${tile.name} · ${model}`);
      await load(true);
    } catch (err) {
      toast.show(err.message || '儲存失敗');
    } finally {
      setBusy('');
    }
  };

  const onClearKey = async () => {
    if (!await confirm(`確定要移除已儲存的 ${tile.keyName} API Key？`, { confirmText: '移除', danger: true })) return;
    setBusy('clear');
    try {
      await saveAiSettings({ schoolId: target, apiBaseUrl: keyBase, model: keySetup?.model || 'gpt-5-mini', clearKey: true });
      toast.show('已移除 API Key');
      await load(true);
    } catch (err) {
      toast.show(err.message || '移除失敗');
    } finally {
      setBusy('');
    }
  };

  const pollLogin = (state) => {
    stopPolling();
    pollTimer.current = setTimeout(async () => {
      if (Date.now() > state.until) { setLogin(null); toast.show('登入代碼已過期，請再試一次'); return; }
      try {
        const r = await chatgptLoginPoll(target);
        if (r.status === 'connected') {
          setLogin(null);
          toast.show(`已登入 ChatGPT${r.email ? `（${r.email}）` : ''}，現正使用 Codex`);
          await load(true);
          return;
        }
        if (r.status === 'failed' || r.status === 'expired' || r.status === 'none') {
          setLogin(null);
          toast.show(r.error || '登入未完成，請再試一次');
          return;
        }
      } catch {
        // network hiccup: keep waiting
      }
      pollLogin(state);
    }, state.interval * 1000);
  };

  const onChatgptLogin = async () => {
    setBusy('login');
    try {
      const r = await chatgptLoginStart(target);
      const state = { userCode: r.userCode, verificationUri: r.verificationUri, interval: r.interval || 5, until: Date.now() + (r.expiresIn || 900) * 1000 };
      setLogin(state);
      window.open(r.verificationUri, '_blank', 'noopener');
      pollLogin(state);
    } catch (e) {
      toast.show(e.message || '無法開始登入');
    } finally {
      setBusy('');
    }
  };

  const onChatgptLogout = async () => {
    if (!await confirm('登出 ChatGPT？這間學校會改回使用已儲存的 API Key（如有）。', { confirmText: '登出', danger: true })) return;
    setBusy('logout');
    try {
      await chatgptLogout(target);
      toast.show('已登出 ChatGPT');
      await load();
    } catch (e) {
      toast.show(e.message || '登出失敗');
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
    setApiKey('');
  };

  const statusLine = !info ? ' '
    : onChatgpt ? `Codex（ChatGPT ${info.chatgpt?.email || '帳戶'}）· ${info.provider?.model}`
    : info.hasKey ? `${keyTileFor(info.provider?.apiBaseUrl)?.name || 'API'} · ${info.provider?.model} · Key ${info.keyHint}`
    : '選擇 AI 服務開始使用';
  const recent = (info?.recentModels || []).filter((m) => tile.show(m) && (tile.login
    ? (models || []).some((x) => x.id === m)
    : !(models || []).length || (models || []).some((x) => x.id === m)));

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 760 }}>
      {/* Header + status */}
      <div className="qcCard" style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <h2 className="qcSectionTitle">AI 設定</h2>
            <div style={{ color: '#6E6E73', fontSize: 14, marginTop: 4, lineHeight: 1.5 }}>
              每間學校各有自己的 AI 服務和模型。老師、學生和 AI 助理都會使用這裡的設定。
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
            <div style={{ fontWeight: 700, fontSize: 15 }}>{!info ? '載入中…' : aiReady ? 'AI 已啟用' : '尚未設定'}</div>
            <div style={{ fontSize: 13, color: '#6E6E73', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{statusLine}</div>
          </div>
          <button type="button" className="qcBtn qcBtnSecondary qcBtnSmall" onClick={onTest} disabled={!!busy || !info || !aiReady}>
            <Zap size={14} aria-hidden="true" />{busy === 'test' ? '測試中…' : '測試連線'}
          </button>
        </div>
        {testResult ? (
          <div role="status" style={{ fontSize: 13, fontWeight: 600, color: testResult.ok ? '#248A3D' : '#D70015', marginTop: -6 }}>{testResult.text}</div>
        ) : null}
      </div>

      {/* Service + credential */}
      <div className="qcCard" style={{ display: 'grid', gap: 14 }}>
        <div style={sectionTitle}>AI 服務</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          {PROVIDERS.map((p) => {
            const on = p.id === tileId;
            const inUse = p.id === activeTileId && aiReady;
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

        {tile.login ? (
          // ── Codex: ChatGPT sign-in ──
          <div style={{ display: 'grid', gap: 12 }}>
            {chatgptConnected ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, background: '#F5F5F7', flexWrap: 'wrap' }}>
                <Check size={18} color="#248A3D" aria-hidden="true" />
                <div style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
                  已登入 ChatGPT{info.chatgpt.email ? <>：<b>{info.chatgpt.email}</b></> : null}
                  <div style={{ fontSize: 12, color: '#6E6E73', marginTop: 2 }}>這間學校的 AI 會使用這個 ChatGPT 方案的用量。</div>
                </div>
                <button type="button" className="qcLink" style={{ color: '#D70015', fontSize: 13 }} onClick={onChatgptLogout} disabled={!!busy}>登出</button>
              </div>
            ) : login ? (
              <div style={{ display: 'grid', gap: 10, padding: 16, borderRadius: 16, background: '#F5F5F7', textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: '#1D1D1F' }}>在 OpenAI 的登入頁輸入以下代碼：</div>
                <div style={{ fontFamily: monoFont, fontSize: 30, fontWeight: 700, letterSpacing: 3 }}>{login.userCode}</div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button type="button" className="qcBtn qcBtnSecondary qcBtnSmall"
                    onClick={() => { navigator.clipboard?.writeText(login.userCode).then(() => toast.show('已複製代碼'), () => {}); }}>
                    <Copy size={14} aria-hidden="true" />複製代碼
                  </button>
                  <a className="qcBtn qcBtnPrimary qcBtnSmall" href={login.verificationUri} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                    <ExternalLink size={14} aria-hidden="true" />打開登入頁
                  </a>
                </div>
                <div style={{ fontSize: 12, color: '#6E6E73' }}>登入並輸入代碼後，這裡會自動完成（等待中…）</div>
                <button type="button" className="qcLink" style={{ fontSize: 12, justifySelf: 'center' }} onClick={() => { stopPolling(); setLogin(null); }}>取消</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10, justifyItems: 'start' }}>
                <div style={{ fontSize: 13, color: '#6E6E73', lineHeight: 1.6 }}>
                  用你的 ChatGPT 帳戶（Plus / Pro）登入，學校的 AI 便會使用這個方案的 Codex 用量，不需要 API Key。
                </div>
                <button type="button" className="qcBtn qcBtnPrimary" onClick={onChatgptLogin} disabled={!!busy || !info}>
                  <LogIn size={16} aria-hidden="true" />{busy === 'login' ? '準備中…' : '使用 ChatGPT 帳戶登入'}
                </button>
                <div style={{ fontSize: 12, color: '#B25000', lineHeight: 1.5 }}>
                  這是非官方的登入方式（與 pi agent 相同），OpenAI 可能隨時更改或停用；用量會計入你的 ChatGPT 方案。
                </div>
              </div>
            )}
          </div>
        ) : (
          // ── API key services ──
          <form onSubmit={onSaveKey} style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ ...labelStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <KeyRound size={14} aria-hidden="true" />
                {hasSavedKeyHere ? `${tile.keyName} API Key（已儲存 ${info.keyHint}）` : `${tile.keyName} API Key`}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="password" autoComplete="new-password" value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); if (!hasSavedKeyHere) { setModels(null); setModelsErr(''); } }}
                  onBlur={() => { if (apiKey.trim() && !hasSavedKeyHere && !models) loadModels(); }}
                  placeholder={hasSavedKeyHere ? '貼上新的 Key 以更換' : '貼上 API Key'} style={inputStyle} />
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
              {hasSavedKeyHere ? (
                <button type="button" className="qcLink" style={{ color: '#D70015', fontSize: 13 }} onClick={onClearKey} disabled={!!busy}>
                  {busy === 'clear' ? '移除中…' : '移除 API Key'}
                </button>
              ) : <span style={{ fontSize: 13, color: '#6E6E73' }}>{pendingModel ? `已選模型：${pendingModel}` : '輸入 Key 後選擇模型，再按儲存。'}</span>}
              <button type="submit" className="qcBtn qcBtnPrimary" disabled={!!busy || !info || !apiKey.trim() || (!pendingModel && !tileModel)}>
                {busy === 'save' ? '儲存中…' : '儲存 Key'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Model */}
      <div className="qcCard" style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={sectionTitle}>模型</div>
            <div style={sectionHint}>
              {!canListModels ? (tile.login ? '登入 ChatGPT 後，會在這裡顯示 Codex 可用的模型。' : `輸入 ${tile.keyName} API Key 後，會在這裡顯示可用的模型。`)
                : (tile.login ? chatgptConnected : hasSavedKeyHere) ? (isActiveTile ? '點一下即可切換，立即生效。' : `點一下即改用 ${tile.name} 和該模型。`)
                : '選好模型後按「儲存 Key」。'}
            </div>
          </div>
          {shownModel ? (
            <div style={{ fontSize: 13, color: '#6E6E73' }}>
              {isActiveTile ? '目前' : '選擇'}：<span style={{ fontFamily: monoFont, color: '#1D1D1F', fontWeight: 600 }}>{shownModel}</span>
              {pendingModel ? <span style={{ color: '#B25000' }}>（未儲存）</span> : null}
            </div>
          ) : null}
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
              : (
                <>
                  {tile.login ? <LogIn size={22} aria-hidden="true" style={{ display: 'block', margin: '0 auto 8px', color: '#86868B' }} />
                    : <KeyRound size={22} aria-hidden="true" style={{ display: 'block', margin: '0 auto 8px', color: '#86868B' }} />}
                  {tile.login ? '先在上面登入 ChatGPT' : `先在上面輸入 ${tile.keyName} API Key`}
                </>
              )}
          </div>
        ) : (
          <>
            {models.length > 12 ? (
              <div style={{ position: 'relative' }}>
                <Search size={16} aria-hidden="true" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#86868B' }} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋模型" aria-label="搜尋模型" style={{ ...inputStyle, paddingLeft: 36 }} />
              </div>
            ) : null}
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
                        <div style={{ fontSize: 14, fontWeight: 600, color: on ? '#0071E3' : '#1D1D1F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.name || m.id}
                        </div>
                        <div style={{ fontSize: 12, color: '#86868B', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{ fontFamily: monoFont }}>{m.id}</span>{m.contextLength ? ` · ${formatContext(m.contextLength)} context` : ''}
                        </div>
                      </div>
                      {busy === 'model:' + m.id ? <span style={{ fontSize: 12, color: '#6E6E73' }}>切換中…</span>
                        : on ? <Check size={18} color="#0071E3" aria-hidden="true" /> : null}
                    </button>
                  );
                })}
                {filtered.length === 0 ? <div style={{ padding: 14, fontSize: 13, color: '#86868B' }}>找不到符合的模型</div> : null}
              </div>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); chooseModel(customModel); setCustomModel(''); }} style={{ display: 'flex', gap: 8 }}>
              <input value={customModel} onChange={(e) => setCustomModel(e.target.value)} placeholder="或直接輸入模型 ID"
                aria-label="模型 ID" style={{ ...inputStyle, fontFamily: monoFont, fontSize: 14 }} />
              <button type="submit" className="qcBtn qcBtnSecondary" disabled={!customModel.trim() || !!busy}>使用</button>
            </form>
          </>
        )}
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
