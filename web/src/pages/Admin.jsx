import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from '../components/Toast.jsx';
import { Link } from 'react-router-dom';
import { getIdToken } from '../services/firebase.js';

function isAdmin(user) {
  return String(user?.role || '').toLowerCase() === 'admin';
}

export default function AdminPage({ user }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [remoteSaving, setRemoteSaving] = useState(false);
  const [classroomIdsText, setClassroomIdsText] = useState('');

  const [users, setUsers] = useState([]);

  const [selectedUid, setSelectedUid] = useState('');
  const selectedUser = useMemo(() => users.find(u => u.uid === selectedUid) || null, [users, selectedUid]);

  const [accountRole, setAccountRole] = useState('');
  const [accountStatus, setAccountStatus] = useState('active');
  const [adminNote, setAdminNote] = useState('');
  const [childUids, setChildUids] = useState([]);
  const [childSearch, setChildSearch] = useState('');


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

      const uRes = await fb.listUsers?.(500);

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
    // Roles are stored case-insensitively elsewhere ("Teacher" works in the rules), so match the dropdown.
    setAccountRole(String(selectedUser.role || 'student').trim().toLowerCase());
    setAccountStatus(selectedUser.accountStatus || 'active');
    setAdminNote(selectedUser.adminNote || '');
    setChildUids(Array.isArray(selectedUser.childUids) ? selectedUser.childUids : []);
    setChildSearch('');
    setClassroomIdsText(Array.isArray(selectedUser.classroomIds) ? selectedUser.classroomIds.join(', ') : String(selectedUser.classroomIds || ''));

  }, [selectedUser]);

  const onSaveAll = async () => {
    setRemoteSaving(true);
    try {
      const fb = window.QuestClassFirebase;
      if (!selectedUid) return toast.show('請先選擇使用者');
      if (selectedUid === user?.uid && (accountRole !== 'admin' || accountStatus !== 'active')) {
        return toast.show('不能移除自己的管理員權限或停用自己的帳戶，以免失去管理權限。');
      }

      // Save account settings (Firestore)
      const res = await fb.adminUpdateUserAccount?.(selectedUid, {
        role: accountRole,
        accountStatus,
        adminNote,
        classroomIds: classroomIdsText,
        // Only parents keep child links; changing the role away from parent clears them.
        childUids: accountRole === 'parent' ? childUids : []
      });
      if (!res?.ok) throw new Error(res?.error || 'update failed');

      toast.show('已儲存');
      await refresh();
    } catch (e) {
      toast.show(e.message || '儲存失敗');
    } finally {
      setRemoteSaving(false);
    }
  };

  const onRunMigration = async () => {
    setRemoteSaving(true);
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error('請先登入 Firebase');
      const res = await fetch('/api/admin/migrate-users-only', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, mode: 'merge' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'migrate failed');
      toast.show(`Migration 完成：merged=${data.merged || 0}, skipped=${data.skipped || 0}`);
      await refresh();
    } catch (e) {
      toast.show(e.message || 'Migration 失敗');
    } finally {
      setRemoteSaving(false);
    }
  };


  if (!user) {
    return (
      <div className="card">
        <div style={{ fontWeight: 700, fontSize: 16 }}>Admin</div>
        <div style={{ marginTop: 10, color: '#6E6E73', fontWeight: 500 }}>請先登入。</div>
      </div>
    );
  }

  if (!isAdmin(user)) {
    return (
      <div className="card">
        <div style={{ fontWeight: 700, fontSize: 16 }}>Admin</div>
        <div style={{ marginTop: 10, color: '#D70015', fontWeight: 600 }}>只有 admin 可使用此頁面。</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Admin 控制台</div>
            <div style={{ color: '#6E6E73', fontWeight: 500, marginTop: 4, fontSize: 13 }}>users / students（Firestore）</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link to="/admin/ai-settings" style={{ ...btnGhost, textDecoration: 'none', color: '#0071E3' }}>AI 設定</Link>
            <button type="button" onClick={refresh} disabled={loading} style={btnGhost}>
              {loading ? '刷新中…' : '重新整理'}
            </button>
          </div>
        </div>
        {err ? <div style={{ marginTop: 10, color: '#D70015', fontWeight: 600 }}>{err}</div> : null}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: 14 }}>
        <div className="card" style={{ padding: 12, overflow: 'hidden' }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>使用者</div>
          <div style={{ maxHeight: 520, overflow: 'auto', display: 'grid', gap: 8 }}>
            {users.map((u) => (
              <button
                key={u.uid}
                type="button"
                onClick={() => setSelectedUid(u.uid)}
                style={{
                  textAlign: 'left',
                  border: '1px solid rgba(0,0,0,0.10)',
                  background: u.uid === selectedUid ? 'rgba(0,113,227,0.10)' : '#F2F2F7',
                  borderRadius: 16,
                  padding: 10,
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name || u.email || u.uid}</div>
                <div style={{ marginTop: 2, color: '#6E6E73', fontWeight: 600, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ROLE_NAMES[String(u.role || '').toLowerCase()] || u.role || '—'} · {STATUS_NAMES[u.accountStatus || 'active'] || u.accountStatus}
                  {u.requestedRole && u.requestedRole !== u.role ? ` · 申請：${ROLE_NAMES[u.requestedRole] || u.requestedRole}` : ''}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: 12 }}>帳號設定</div>
            {!selectedUser ? (
              <div style={{ color: '#6E6E73', fontWeight: 500 }}>尚未選擇使用者</div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={label}>UID</div>
                  <div style={{ fontWeight: 600, color: '#374151', fontSize: 13 }}>{selectedUser.uid}</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <div style={label}>角色</div>
                    <select value={accountRole} onChange={(e) => setAccountRole(e.target.value)} style={selectStyle}>
                      <option value="student">學生</option>
                      <option value="teacher">老師</option>
                      <option value="parent">家長</option>
                      <option value="admin">管理員</option>
                    </select>
                  </label>

                  <label style={{ display: 'grid', gap: 6 }}>
                    <div style={label}>狀態</div>
                    <select value={accountStatus} onChange={(e) => setAccountStatus(e.target.value)} style={selectStyle}>
                      <option value="active">啟用</option>
                      <option value="review">待審核</option>
                      <option value="suspended">停用</option>
                    </select>
                  </label>
                </div>

                <label style={{ display: 'grid', gap: 6 }}>
                  <div style={label}>管理備註</div>
                  <input value={adminNote} onChange={(e) => setAdminNote(e.target.value)} style={inputStyle} placeholder="notes..." />
                </label>

                {accountRole === 'parent' ? (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={label}>連結子女（家長只可查看已連結子女的作業和成績）</div>
                    <input value={childSearch} onChange={(e) => setChildSearch(e.target.value)} style={inputStyle} placeholder="搜尋學生姓名或電郵" aria-label="搜尋學生" />
                    <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid #E8E8ED', borderRadius: 10 }}>
                      {users
                        .filter((u) => String(u.role || '').toLowerCase() === 'student')
                        .filter((u) => {
                          const q = childSearch.trim().toLowerCase();
                          return !q || String(u.name || '').toLowerCase().includes(q) || String(u.email || '').toLowerCase().includes(q);
                        })
                        .map((u) => {
                          const on = childUids.includes(u.uid);
                          return (
                            <label key={u.uid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid #F0F0F3', cursor: 'pointer', background: on ? 'rgba(0,113,227,0.06)' : 'transparent' }}>
                              <input type="checkbox" checked={on} onChange={() => setChildUids((prev) => (on ? prev.filter((x) => x !== u.uid) : [...prev, u.uid]))} />
                              <span style={{ fontSize: 14, fontWeight: 500 }}>{u.name || u.email || u.uid}</span>
                              <span style={{ fontSize: 12, color: '#6E6E73', marginLeft: 'auto' }}>{u.email || ''}</span>
                            </label>
                          );
                        })}
                    </div>
                    <div style={{ fontSize: 12, color: '#6E6E73' }}>已連結 {childUids.length} 位子女</div>
                  </div>
                ) : null}

                <label style={{ display: 'grid', gap: 6 }}>
                  <div style={label}>Classroom IDs（逗號分隔）</div>
                  <input value={classroomIdsText} onChange={(e) => setClassroomIdsText(e.target.value)} style={inputStyle} placeholder="classroom-001, classroom-002" />
                </label>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <button type="button" onClick={onRunMigration} disabled={remoteSaving} style={btnGhost}>
                    {remoteSaving ? '執行中…' : 'Run migration'}
                  </button>
                  <button type="button" onClick={onSaveAll} disabled={remoteSaving} style={btnPrimary}>
                    {remoteSaving ? '儲存中…' : '儲存'}
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

const label = { fontWeight: 700, fontSize: 13, color: '#6E6E73' };
const ROLE_NAMES = { admin: '管理員', teacher: '老師', student: '學生', parent: '家長' };
const STATUS_NAMES = { active: '啟用', review: '待審核', suspended: '停用' };

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #D2D2D7',
  background: '#FFFFFF',
  outline: 'none',
  fontWeight: 600,
};

const selectStyle = {
  ...inputStyle,
  appearance: 'none',
};

const btnPrimary = {
  border: 0,
  background: '#0071E3',
  color: 'white',
  padding: '10px 14px',
  borderRadius: 999,
  fontWeight: 600,
  cursor: 'pointer',
};

const btnGhost = {
  border: 0,
  background: '#E3E3E8',
  color: '#1D1D1F',
  padding: '10px 14px',
  borderRadius: 999,
  fontWeight: 500,
  cursor: 'pointer',
};
