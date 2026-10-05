import React, { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { joinSchool, listSchools } from '../services/firebase.js';

// Shown to a new account that has not chosen a school yet. After choosing, the account waits
// for that school's admin to approve it and assign a role.
export default function JoinSchool({ user, onJoined, onLogout }) {
  const [schools, setSchools] = useState(null);
  const [err, setErr] = useState('');
  const [picked, setPicked] = useState('');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listSchools().then((res) => {
      if (res?.ok) setSchools(res.schools || []);
      else { setSchools([]); setErr(res?.error || '載入學校失敗'); }
    });
  }, []);

  const onJoin = async () => {
    if (!picked) return;
    setSaving(true);
    setErr('');
    const res = await joinSchool(picked);
    setSaving(false);
    if (res?.ok) onJoined(res.user);
    else setErr(res?.error || '加入學校失敗');
  };

  const q = query.trim().toLowerCase();
  const shown = (schools || []).filter((s) => !q || String(s.name || '').toLowerCase().includes(q));

  return (
    <div className="qcCenter">
      <div className="qcCard" style={{ maxWidth: 460, padding: '30px 26px', display: 'grid', gap: 16 }}>
        <div style={{ textAlign: 'center' }}>
          <div className="brandMark" aria-hidden="true" style={{ margin: '0 auto 14px' }}><Star size={18} strokeWidth={2.2} /></div>
          <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700 }}>選擇你的學校</h1>
          <p style={{ margin: 0, color: '#6E6E73', fontSize: 15, lineHeight: 1.6 }}>
            {user?.email ? `${user.email} · ` : ''}加入後，學校管理員確認你的帳戶並設定角色，便可以開始使用。
          </p>
        </div>

        {schools === null ? (
          <div style={{ textAlign: 'center', color: '#86868B' }}>載入中…</div>
        ) : schools.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#6E6E73', fontSize: 14 }}>暫時未有學校。請聯絡平台管理員。</div>
        ) : (
          <>
            {schools.length > 6 ? (
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋學校" aria-label="搜尋學校"
                style={{ padding: '11px 14px', borderRadius: 12, border: '1px solid #D2D2D7', fontSize: 15 }} />
            ) : null}
            <div role="radiogroup" aria-label="學校" style={{ display: 'grid', gap: 8, maxHeight: 320, overflow: 'auto' }}>
              {shown.map((s) => {
                const on = picked === s.id;
                return (
                  <button key={s.id} type="button" role="radio" aria-checked={on} onClick={() => setPicked(s.id)} style={{
                    textAlign: 'left', padding: '12px 14px', borderRadius: 12, cursor: 'pointer', fontSize: 15, fontWeight: 500,
                    border: on ? '2px solid #0071E3' : '1px solid #D2D2D7', background: on ? 'rgba(0,113,227,0.06)' : '#FFFFFF',
                  }}>{s.name}</button>
                );
              })}
            </div>
          </>
        )}

        {err ? <div style={{ color: '#D70015', fontSize: 14, fontWeight: 600 }}>{err}</div> : null}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
          <button type="button" className="qcBtn qcBtnSecondary" onClick={onLogout}>登出</button>
          <button type="button" className="qcBtn qcBtnPrimary" onClick={onJoin} disabled={!picked || saving}>
            {saving ? '加入中…' : '加入學校'}
          </button>
        </div>
      </div>
    </div>
  );
}
