import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from '../components/Toast.jsx';
import ApiSettingsCard from '../components/ApiSettingsCard.jsx';
import { loadSettings } from '../services/settings.js';
import { upsertAiConfig } from '../services/api.js';
import { getIdToken } from '../services/firebase.js';

function isAdmin(user) {
  return String(user?.role || '').toLowerCase() === 'admin';
}

export default function AdminPage({ user }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [remoteSaving, setRemoteSaving] = useState(false);

  const [users, setUsers] = useState([]);

  const [selectedUid, setSelectedUid] = useState('');
  const selectedUser = useMemo(() => users.find(u => u.uid === selectedUid) || null, [users, selectedUid]);

  const [accountRole, setAccountRole] = useState('');
  const [accountStatus, setAccountStatus] = useState('active');
  const [adminNote, setAdminNote] = useState('');


  const refresh = async () => {
    setErr('');
    setLoading(true);
    try {
      const fb = window.QuestClassFirebase;
      if (!fb?.enabled?.()) {
        setErr('Firebase 未設定');
        return;
      }
      // Ensure auth state is loaded.
      await fb.init?.();

      const uRes = await fb.listUsers?.(80);

      if (!uRes?.ok) throw new Error(uRes?.error || 'listUsers failed');

      setUsers(uRes.users || []);

      // keep selection stable
      if (!selectedUid && (uRes.users || []).length) setSelectedUid(uRes.users[0].uid);
    } catch (e) {
      setErr(e.message || '載入失敗');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedUser) return;
    setAccountRole(selectedUser.role || '');
    setAccountStatus(selectedUser.accountStatus || 'active');
    setAdminNote(selectedUser.adminNote || '');
  }, [selectedUser]);

  const onUpdateAccount = async () => {
    try {
      const fb = window.QuestClassFirebase;
      if (!selectedUid) return toast.show('請先選擇使用者');
      const res = await fb.adminUpdateUserAccount?.(selectedUid, {
        role: accountRole,
        accountStatus,
        adminNote
      });
      if (!res?.ok) throw new Error(res?.error || 'update failed');
      toast.show('已更新');
      await refresh();
    } catch (e) {
      toast.show(e.message || '更新失敗');
    }
  };

  const onSaveApiKeyForUser = async () => {
    setRemoteSaving(true);
    try {
      if (!selectedUid) {
        toast.show('請先選擇使用者');
        return;
      }
      const idToken = await getIdToken();
      if (!idToken) {
        toast.show('請先登入 Firebase');
        return;
      }
      const s = loadSettings();
      if (!String(s.apiKey || '').trim()) {
        toast.show('請先在上方 API 設定填入 API Key');
        return;
      }
      await upsertAiConfig({
        idToken,
        studentUid: selectedUid,
        apiKey: s.apiKey || '',
        apiBaseUrl: s.apiBaseUrl || '',
        model: s.apiModel || ''
      });
      toast.show('已儲存 API Key 到 Firebase（此使用者）');
    } catch (e) {
      toast.show(e.message || '儲存失敗');
    } finally {
      setRemoteSaving(false);
    }
  };


  if (!user) {
    return (
      <div className="card">
        <div style={{ fontWeight: 900, fontSize: 16 }}>Admin</div>
        <div style={{ marginTop: 10, color: '#6B7280', fontWeight: 700 }}>請先登入。</div>
      </div>
    );
  }

  if (!isAdmin(user)) {
    return (
      <div className="card">
        <div style={{ fontWeight: 900, fontSize: 16 }}>Admin</div>
        <div style={{ marginTop: 10, color: '#B91C1C', fontWeight: 800 }}>只有 admin 可使用此頁面。</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16 }}>Admin 控制台</div>
            <div style={{ color: '#6B7280', fontWeight: 700, marginTop: 4, fontSize: 13 }}>users / students（Firestore）</div>
          </div>
          <button type="button" onClick={refresh} disabled={loading} style={btnGhost}>
            {loading ? '刷新中…' : '重新整理'}
          </button>
        </div>
        {err ? <div style={{ marginTop: 10, color: '#B91C1C', fontWeight: 800 }}>{err}</div> : null}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: 14 }}>
        <div className="card" style={{ padding: 12, overflow: 'hidden' }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>使用者</div>
          <div style={{ maxHeight: 520, overflow: 'auto', display: 'grid', gap: 8 }}>
            {users.map((u) => (
              <button
                key={u.uid}
                type="button"
                onClick={() => setSelectedUid(u.uid)}
                style={{
                  textAlign: 'left',
                  border: '1px solid rgba(17,24,39,0.10)',
                  background: u.uid === selectedUid ? 'rgba(0,122,255,0.10)' : '#F2F2F7',
                  borderRadius: 16,
                  padding: 10,
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontWeight: 900, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name || u.email || u.uid}</div>
                <div style={{ marginTop: 2, color: '#6B7280', fontWeight: 800, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  role: {u.role || '—'} · status: {u.accountStatus || 'active'}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <ApiSettingsCard title="API 設定（本機）" />

          <div className="card">
            <div style={{ fontWeight: 900, marginBottom: 12 }}>帳號設定</div>
            {!selectedUser ? (
              <div style={{ color: '#6B7280', fontWeight: 700 }}>尚未選擇使用者</div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={label}>UID</div>
                  <div style={{ fontWeight: 800, color: '#374151', fontSize: 13 }}>{selectedUser.uid}</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <div style={label}>角色</div>
                    <select value={accountRole} onChange={(e) => setAccountRole(e.target.value)} style={selectStyle}>
                      <option value="student">student</option>
                      <option value="teacher">teacher</option>
                      <option value="admin">admin</option>
                    </select>
                  </label>

                  <label style={{ display: 'grid', gap: 6 }}>
                    <div style={label}>狀態</div>
                    <select value={accountStatus} onChange={(e) => setAccountStatus(e.target.value)} style={selectStyle}>
                      <option value="active">active</option>
                      <option value="review">review</option>
                      <option value="suspended">suspended</option>
                    </select>
                  </label>
                </div>

                <label style={{ display: 'grid', gap: 6 }}>
                  <div style={label}>管理備註</div>
                  <input value={adminNote} onChange={(e) => setAdminNote(e.target.value)} style={inputStyle} placeholder="notes..." />
                </label>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button type="button" onClick={onSaveApiKeyForUser} disabled={remoteSaving} style={btnGhost}>
                    {remoteSaving ? '儲存中…' : '把上方 API Key 存到此使用者'}
                  </button>
                  <button type="button" onClick={onUpdateAccount} style={btnPrimary}>儲存</button>
                </div>
              </div>
            )}
          </div>

        </div>
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

const selectStyle = {
  ...inputStyle,
  appearance: 'none',
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
