import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/Toast.jsx';
import { listSchools } from '../services/firebase.js';
import { createSchool, renameSchool } from '../services/api.js';
import { useConfirm } from '../components/Confirm.jsx';

const ROLE_ORDER = ['admin', 'teacher', 'student', 'parent'];
const ROLE_NAMES = { admin: '管理員', teacher: '老師', student: '學生', parent: '家長' };

// Platform admin only: create schools and see who belongs to each one.
// School admins then manage their own members on 管理後台.
export default function SchoolsPage({ user }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [schools, setSchools] = useState(null);
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState({ id: '', name: '' });

  const load = async () => {
    setErr('');
    const [s, u] = await Promise.all([listSchools(), window.QuestClassFirebase?.listUsers?.(2000)]);
    if (!s?.ok) setErr(s?.error || '載入學校失敗');
    setSchools(s?.schools || []);
    setUsers(u?.ok ? u.users : []);
  };

  useEffect(() => { if (user?.platformAdmin) load(); }, [user?.platformAdmin]);

  const counts = useMemo(() => {
    const out = {};
    for (const u of users) {
      if (u.platformAdmin === true) continue; // platform admins belong to no school
      const k = u.schoolId || '';
      out[k] = out[k] || { total: 0 };
      out[k].total += 1;
      const r = String(u.role || '').toLowerCase();
      out[k][r] = (out[k][r] || 0) + 1;
      if (u.accountStatus === 'review') out[k].review = (out[k].review || 0) + 1;
    }
    return out;
  }, [users]);

  if (!user?.platformAdmin) {
    return <div className="qcCard" style={{ color: '#D70015', fontWeight: 600 }}>只有平台管理員可使用此頁面。</div>;
  }

  const first = schools && schools.length === 0;

  const onCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    if (first && !await confirm(`建立第一間學校「${newName.trim()}」？\n\n現有的所有使用者（平台管理員除外）、作業、提交和題庫都會歸入這間學校，並移除不再使用的使用者欄位。`, { confirmText: '建立' })) return;
    setBusy('create');
    try {
      const r = await createSchool(newName.trim());
      const a = r.adopted;
      toast.show(a ? `已建立，並歸入 ${a.users || 0} 位使用者、${a.homeworkAssignments || 0} 份作業、${a.questionBank || 0} 條題目` : '已建立學校');
      setNewName('');
      await load();
    } catch (e2) {
      toast.show(e2.message || '建立失敗');
    } finally {
      setBusy('');
    }
  };

  const onRename = async (e) => {
    e.preventDefault();
    setBusy('rename');
    try {
      await renameSchool(editing.id, editing.name);
      toast.show('已更新名稱');
      setEditing({ id: '', name: '' });
      await load();
    } catch (e2) {
      toast.show(e2.message || '更新失敗');
    } finally {
      setBusy('');
    }
  };

  const unassigned = counts['']?.total || 0;

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 820 }}>
      <div className="qcCard">
        <h2 className="qcSectionTitle">學校</h2>
        <div style={{ color: '#6E6E73', fontSize: 14, marginTop: 4, lineHeight: 1.6 }}>
          每間學校的資料各自獨立。新用戶登入後選擇學校，由該校管理員批核及設定角色。
          要指定某校的管理員，請到 <Link to="/admin" className="qcLink">管理後台</Link> 選擇該校，把使用者的角色設為「管理員」。
        </div>
        {err ? <div style={{ marginTop: 10, color: '#D70015', fontWeight: 600 }}>{err}</div> : null}
      </div>

      <form className="qcCard" onSubmit={onCreate} style={{ display: 'grid', gap: 10 }}>
        <div style={{ fontWeight: 700 }}>{first ? '建立第一間學校' : '新增學校'}</div>
        {first ? (
          <div style={{ fontSize: 13, color: '#B25000', lineHeight: 1.6 }}>
            第一間學校會接收現有的全部資料（使用者、作業、提交、題庫和 AI Key）。你作為平台管理員不屬於任何學校。
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="學校名稱" aria-label="學校名稱" maxLength={80}
            style={{ flex: 1, minWidth: 200, padding: '11px 14px', borderRadius: 12, border: '1px solid #D2D2D7', fontSize: 15 }} />
          <button type="submit" className="qcBtn qcBtnPrimary" disabled={!newName.trim() || !!busy}>
            {busy === 'create' ? '建立中…' : '建立'}
          </button>
        </div>
      </form>

      <div className="qcCard" style={{ display: 'grid', gap: 10 }}>
        {schools === null ? (
          <div style={{ color: '#86868B' }}>載入中…</div>
        ) : schools.length === 0 ? (
          <div style={{ color: '#86868B' }}>尚未有學校。</div>
        ) : schools.map((s) => {
          const c = counts[s.id] || {};
          return (
            <div key={s.id} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '12px 14px', borderRadius: 14, background: '#F5F5F7' }}>
              {editing.id === s.id ? (
                <form onSubmit={onRename} style={{ display: 'flex', gap: 8, flex: 1, minWidth: 220 }}>
                  <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={80} aria-label="學校名稱"
                    style={{ flex: 1, padding: '8px 12px', borderRadius: 10, border: '1px solid #D2D2D7', fontSize: 15 }} />
                  <button type="submit" className="qcBtn qcBtnPrimary qcBtnSmall" disabled={!!busy}>儲存</button>
                  <button type="button" className="qcBtn qcBtnSecondary qcBtnSmall" onClick={() => setEditing({ id: '', name: '' })}>取消</button>
                </form>
              ) : (
                <>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>
                      {s.name}
                    </div>
                    <div style={{ fontSize: 12, color: '#6E6E73', marginTop: 3 }}>
                      {ROLE_ORDER.map((r) => `${ROLE_NAMES[r]} ${c[r] || 0}`).join(' · ')}
                      {c.review ? <span style={{ color: '#B25000' }}> · 待審核 {c.review}</span> : null}
                      {s.shareQuestionBank ? ' · 共享題庫' : ''}
                    </div>
                  </div>
                  <button type="button" className="qcLink" onClick={() => setEditing({ id: s.id, name: s.name || '' })}>改名</button>
                </>
              )}
            </div>
          );
        })}
        {unassigned ? (
          <div style={{ fontSize: 13, color: '#B25000' }}>
            {unassigned} 位使用者未加入任何學校，可在 <Link to="/admin" className="qcLink">管理後台</Link> 選擇「未分配」處理。
          </div>
        ) : null}
      </div>
    </div>
  );
}
