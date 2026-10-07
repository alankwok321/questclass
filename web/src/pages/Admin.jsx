import AddUser from '../components/AddUser.jsx';
import RosterImport from '../components/RosterImport.jsx';
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/Toast.jsx';
import Avatar from '../components/Avatar.jsx';
import { listSchools } from '../services/firebase.js';
import { saveSchoolSettings } from '../services/api.js';
import { useConfirm } from '../components/Confirm.jsx';

function isAdmin(user) {
  return String(user?.role || '').toLowerCase() === 'admin';
}

const UNASSIGNED = '__none__';

export default function AdminPage({ user }) {
  const confirm = useConfirm();
  const toast = useToast();
  const platform = user?.platformAdmin === true;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [schools, setSchools] = useState([]);
  // Which school's members are shown. School admins: always their own. The platform admin belongs
  // to no school and picks one (starting with the first school once the list has loaded).
  const [viewSchool, setViewSchool] = useState(platform ? (window.QuestClassFirebase?.getActiveSchool?.() || '') : (user?.schoolId || ''));
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState('all');

  const [selectedUid, setSelectedUid] = useState('');
  const selectedUser = useMemo(() => users.find((u) => u.uid === selectedUid) || null, [users, selectedUid]);
  const [form, setForm] = useState({ name: '', email: '', role: 'student', accountStatus: 'active', class: '', childUids: [], schoolId: '', teacherClasses: null });
  const [newClass, setNewClass] = useState('');
  const [childSearch, setChildSearch] = useState('');

  // The school whose settings (question-bank sharing) are shown.
  const settingsSchool = schools.find((s) => s.id === viewSchool) || null;

  const refresh = async (schoolKey = viewSchool) => {
    setErr('');
    setLoading(true);
    try {
      const fb = window.QuestClassFirebase;
      if (!fb?.enabled?.()) { setErr('Firebase 未設定'); return; }
      await fb.init?.();
      const sRes = await listSchools();
      const schoolList = sRes?.schools || [];
      setSchools(schoolList);
      if (platform && !schoolKey) {
        setViewSchool(schoolList[0]?.id || UNASSIGNED); // the effect below loads that school
        return;
      }
      const opts = platform ? { schoolId: schoolKey === UNASSIGNED ? '' : schoolKey } : {};
      const uRes = await fb.listUsers?.(1000, opts);
      if (!uRes?.ok) throw new Error(uRes?.error || '載入使用者失敗');
      const list = (uRes.users || []).sort((a, b) => String(a.name || a.email || '').localeCompare(String(b.name || b.email || ''), 'zh-Hant'));
      setUsers(list);
      setSelectedUid((cur) => (list.some((u) => u.uid === cur) ? cur : (list[0]?.uid || '')));
    } catch (e) {
      setErr(e.message || '載入失敗');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh(viewSchool);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewSchool]);

  useEffect(() => {
    if (!selectedUser) return;
    setForm({
      name: selectedUser.name || '',
      email: selectedUser.email || '',
      // Roles are stored case-insensitively elsewhere ("Teacher" works in the rules), so match the dropdown.
      role: String(selectedUser.role || 'student').trim().toLowerCase(),
      accountStatus: selectedUser.accountStatus || 'active',
      class: selectedUser.class || '',
      childUids: Array.isArray(selectedUser.childUids) ? selectedUser.childUids : [],
      schoolId: selectedUser.schoolId || '',
      // null = the teacher may see every class
      teacherClasses: Array.isArray(selectedUser.teacherClasses) ? selectedUser.teacherClasses : null,
    });
    setNewClass('');
    setChildSearch('');
  }, [selectedUser]);

  const onSave = async () => {
    if (!selectedUid) return toast.show('請先選擇使用者');
    if (selectedUid === user?.uid && (form.role !== 'admin' || form.accountStatus !== 'active')) {
      return toast.show('不能移除自己的管理員權限或停用自己的帳戶，以免失去管理權限。');
    }
    setSaving(true);
    try {
      const input = {
        role: form.role,
        accountStatus: form.accountStatus,
        class: form.role === 'student' ? form.class : '',
        // Only parents keep child links; changing the role away from parent clears them.
        childUids: form.role === 'parent' ? form.childUids : [],
      };
      if (form.role === 'teacher') input.teacherClasses = form.teacherClasses;
      if (form.name.trim() !== (selectedUser?.name || '')) input.name = form.name.trim();
      if (form.email.trim().toLowerCase() !== String(selectedUser?.email || '').toLowerCase()) input.email = form.email.trim();
      if (platform && form.schoolId !== (selectedUser?.schoolId || '')) input.schoolId = form.schoolId;
      const res = await window.QuestClassFirebase?.adminUpdateUserAccount?.(selectedUid, input);
      if (!res?.ok) throw new Error(res?.error || '儲存失敗');
      toast.show(input.schoolId !== undefined ? '已儲存並轉校' : '已儲存');
      await refresh();
    } catch (e) {
      toast.show(e.message || '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const onToggleShare = async () => {
    if (!settingsSchool) return;
    const next = !settingsSchool.shareQuestionBank;
    if (next && !await confirm(`開啟後，其他學校的老師可以查看及使用「${settingsSchool.name}」題庫的題目（不能修改）。確定？`, { confirmText: '開啟共享' })) return;
    setSaving(true);
    try {
      await saveSchoolSettings({ shareQuestionBank: next, ...(platform ? { schoolId: settingsSchool.id } : {}) });
      toast.show(next ? '已與其他學校共享題庫' : '已停止共享題庫');
      await refresh();
    } catch (e) {
      toast.show(e.message || '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  if (!user) return <div className="qcCard">請先登入。</div>;
  if (!isAdmin(user)) return <div className="qcCard" style={{ color: '#D70015', fontWeight: 600 }}>只有管理員可使用此頁面。</div>;
  if (!user.schoolId && !platform) return <div className="qcCard">你的帳戶尚未加入學校。</div>;

  const reviewCount = users.filter((u) => u.accountStatus === 'review').length;
  const shown = filter === 'review' ? users.filter((u) => u.accountStatus === 'review') : users;
  const students = users.filter((u) => String(u.role || '').toLowerCase() === 'student');
  const classNames = [...new Set([
    ...students.map((u) => String(u.class || '').trim()),
    ...users.flatMap((u) => (Array.isArray(u.teacherClasses) ? u.teacherClasses : [])),
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hant', { numeric: true }));
  const pickedClasses = Array.isArray(form.teacherClasses) ? form.teacherClasses : [];
  const toggleTeacherClass = (c) => setForm((f) => {
    const list = Array.isArray(f.teacherClasses) ? f.teacherClasses : [];
    return { ...f, teacherClasses: list.includes(c) ? list.filter((x) => x !== c) : [...list, c] };
  });
  const viewName = viewSchool === UNASSIGNED ? '未分配學校' : (schools.find((s) => s.id === viewSchool)?.name || '');

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="qcCard">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 className="qcSectionTitle">{viewName || '管理後台'}</h2>
            <div style={{ color: '#6E6E73', fontSize: 13, marginTop: 4 }}>
              {users.length} 位使用者{reviewCount ? ` · ${reviewCount} 位待審核` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {platform ? (
              <select value={viewSchool} onChange={(e) => setViewSchool(e.target.value)} aria-label="查看學校" style={{ ...selectStyle, width: 'auto' }}>
                {!viewSchool ? <option value="">載入中…</option> : null}
                {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                <option value={UNASSIGNED}>未分配學校</option>
              </select>
            ) : null}
            {platform ? <Link to="/admin/schools" className="qcBtn qcBtnSecondary qcBtnSmall" style={{ textDecoration: 'none' }}>學校管理</Link> : null}
            <Link to="/admin/ai-settings" className="qcBtn qcBtnSecondary qcBtnSmall" style={{ textDecoration: 'none' }}>AI 設定</Link>
            <button type="button" className="qcBtn qcBtnSecondary qcBtnSmall" onClick={() => refresh()} disabled={loading}>
              {loading ? '載入中…' : '重新整理'}
            </button>
          </div>
        </div>
        {err ? <div style={{ marginTop: 10, color: '#D70015', fontWeight: 600 }}>{err}</div> : null}
      </div>

      {settingsSchool ? (
        <div className="qcCard" style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 700 }}>與其他學校共享題庫</div>
            <div style={{ fontSize: 13, color: '#6E6E73', marginTop: 4, lineHeight: 1.5 }}>
              開啟後，其他學校的老師可以查看及使用這間學校題庫的題目，但不能修改。這間學校的老師一直可以看到其他已共享學校的題目。
            </div>
          </div>
          <button type="button" role="switch" aria-checked={!!settingsSchool.shareQuestionBank} aria-label="與其他學校共享題庫" onClick={onToggleShare} disabled={saving}
            style={{ width: 51, height: 31, borderRadius: 999, border: 0, padding: 2, cursor: 'pointer', flexShrink: 0,
              background: settingsSchool.shareQuestionBank ? '#34C759' : '#E3E3E8', transition: 'background .2s' }}>
            <span style={{ display: 'block', width: 27, height: 27, borderRadius: 999, background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              transform: settingsSchool.shareQuestionBank ? 'translateX(20px)' : 'none', transition: 'transform .2s' }} />
          </button>
        </div>
      ) : null}

      {viewSchool && viewSchool !== UNASSIGNED ? (
        <AddUser schoolId={platform ? viewSchool : undefined} schoolName={viewName} classes={[...new Set(users.map((u) => u.class).filter(Boolean))].sort()} onDone={() => refresh()} />
      ) : null}
      {viewSchool && viewSchool !== UNASSIGNED ? (
        <RosterImport schoolId={platform ? viewSchool : undefined} onDone={() => refresh()} />
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 320px) minmax(0, 1fr)', gap: 14 }}>
        <div className="qcCard" style={{ padding: 12, overflow: 'hidden' }}>
          <div role="tablist" aria-label="篩選" style={{ display: 'inline-flex', padding: 2, borderRadius: 9, background: '#E3E3E8', marginBottom: 10 }}>
            {[['all', `全部 ${users.length}`], ['review', `待審核 ${reviewCount}`]].map(([k, text]) => (
              <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} style={{
                height: 28, padding: '0 12px', border: 0, borderRadius: 7, cursor: 'pointer', fontSize: 12,
                fontWeight: filter === k ? 600 : 500, background: filter === k ? '#FFFFFF' : 'transparent',
              }}>{text}</button>
            ))}
          </div>
          <div style={{ maxHeight: 560, overflow: 'auto', display: 'grid', gap: 8 }}>
            {shown.length === 0 ? <div style={{ color: '#86868B', fontSize: 13, padding: 8 }}>沒有使用者</div> : null}
            {shown.map((u) => (
              <button key={u.uid} type="button" onClick={() => setSelectedUid(u.uid)} style={{
                textAlign: 'left', border: 0, borderRadius: 14, padding: 10, cursor: 'pointer',
                background: u.uid === selectedUid ? 'rgba(0,113,227,0.10)' : '#F2F2F7',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <Avatar photoURL={u.photoURL} name={u.name || u.email} size={32} />
                <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name || u.email || u.uid}</div>
                <div style={{ marginTop: 2, color: '#6E6E73', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ROLE_NAMES[String(u.role || '').toLowerCase()] || '—'}
                  {u.class ? ` · ${u.class}` : ''}
                  {String(u.role || '').toLowerCase() === 'teacher' && Array.isArray(u.teacherClasses) ? ` · ${u.teacherClasses.join('、') || '未指定班別'}` : ''}
                  {(u.accountStatus || 'active') !== 'active' ? <span style={{ color: u.accountStatus === 'review' ? '#B25000' : '#D70015' }}> · {STATUS_NAMES[u.accountStatus] || u.accountStatus}</span> : null}
                </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="qcCard">
          {!selectedUser ? (
            <div style={{ color: '#6E6E73' }}>尚未選擇使用者</div>
          ) : (
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar photoURL={selectedUser.photoURL} name={selectedUser.name || selectedUser.email} size={48} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 17 }}>{selectedUser.name || '—'}</div>
                  <div style={{ color: '#6E6E73', fontSize: 13, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedUser.email || selectedUser.uid}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <div style={labelStyle}>姓名</div>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} maxLength={60} />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <div style={labelStyle}>電郵</div>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} />
                </label>
              </div>
              {form.email.trim().toLowerCase() !== String(selectedUser.email || '').toLowerCase() ? (
                <div style={{ fontSize: 12, color: '#B25000', marginTop: -6, lineHeight: 1.5 }}>
                  只會更改 QuestClass 顯示和匯入時配對用的電郵。這個人仍然要用原本的 Google 帳戶登入；如要改用另一個 Google 帳戶，請用「新增使用者」加入新電郵。
                </div>
              ) : null}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <div style={labelStyle}>角色</div>
                  <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={selectStyle}>
                    <option value="student">學生</option>
                    <option value="teacher">老師</option>
                    <option value="parent">家長</option>
                    <option value="admin">管理員</option>
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <div style={labelStyle}>狀態</div>
                  <select value={form.accountStatus} onChange={(e) => setForm({ ...form, accountStatus: e.target.value })} style={selectStyle}>
                    <option value="active">啟用</option>
                    <option value="review">待審核</option>
                    <option value="suspended">停用</option>
                  </select>
                </label>
                {platform ? (
                  <label style={{ display: 'grid', gap: 6 }}>
                    <div style={labelStyle}>學校</div>
                    <select value={form.schoolId} onChange={(e) => setForm({ ...form, schoolId: e.target.value })} style={selectStyle}>
                      <option value="">未分配</option>
                      {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </label>
                ) : null}
              </div>

              {form.role === 'student' ? (
                <label style={{ display: 'grid', gap: 6 }}>
                  <div style={labelStyle}>班別</div>
                  <input value={form.class} onChange={(e) => setForm({ ...form, class: e.target.value })} list="qc-class-names"
                    style={inputStyle} placeholder="例如 5A" maxLength={40} />
                  <datalist id="qc-class-names">{classNames.map((c) => <option key={c} value={c} />)}</datalist>
                </label>
              ) : null}

              {form.role === 'teacher' ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={labelStyle}>可存取的班別</div>
                  <div role="radiogroup" aria-label="可存取的班別" style={{ display: 'inline-flex', padding: 2, borderRadius: 9, background: '#E3E3E8', justifySelf: 'start' }}>
                    {[['all', '全部班別'], ['some', '指定班別']].map(([k, text]) => {
                      const on = k === 'all' ? form.teacherClasses === null : form.teacherClasses !== null;
                      return (
                        <button key={k} type="button" role="radio" aria-checked={on}
                          onClick={() => setForm((f) => ({ ...f, teacherClasses: k === 'all' ? null : (Array.isArray(f.teacherClasses) ? f.teacherClasses : []) }))}
                          style={{ height: 30, padding: '0 14px', border: 0, borderRadius: 7, cursor: 'pointer', fontSize: 13,
                            fontWeight: on ? 600 : 500, background: on ? '#FFFFFF' : 'transparent', boxShadow: on ? '0 1px 3px rgba(0,0,0,0.12)' : 'none' }}>
                          {text}
                        </button>
                      );
                    })}
                  </div>
                  {form.teacherClasses === null ? (
                    <div style={{ fontSize: 12, color: '#6E6E73' }}>這位老師可以查看全校所有班別的學生、作業和提交。</div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {[...new Set([...classNames, ...pickedClasses])].map((c) => {
                          const on = pickedClasses.includes(c);
                          return (
                            <button key={c} type="button" onClick={() => toggleTeacherClass(c)} aria-pressed={on} style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 999, cursor: 'pointer',
                              border: on ? '1px solid #0071E3' : '1px solid #D2D2D7', background: on ? '#E8F0FC' : '#FFFFFF',
                              color: on ? '#0071E3' : '#1D1D1F', fontSize: 13, fontWeight: 600,
                            }}>{on ? '✓ ' : ''}{c}</button>
                          );
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input value={newClass} onChange={(e) => setNewClass(e.target.value)} placeholder="加入其他班別，例如 5B" maxLength={40} style={inputStyle}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const c = newClass.trim(); if (c && !pickedClasses.includes(c)) toggleTeacherClass(c); setNewClass(''); } }} />
                        <button type="button" className="qcBtn qcBtnSecondary qcBtnSmall" style={{ height: 40 }}
                          onClick={() => { const c = newClass.trim(); if (c && !pickedClasses.includes(c)) toggleTeacherClass(c); setNewClass(''); }}>加入</button>
                      </div>
                      <div style={{ fontSize: 12, color: pickedClasses.length ? '#6E6E73' : '#B25000' }}>
                        {pickedClasses.length ? `只可查看 ${pickedClasses.join('、')} 的學生、作業和提交。` : '未選擇任何班別：這位老師將看不到任何學生。'}
                      </div>
                    </>
                  )}
                </div>
              ) : null}

              {form.role === 'parent' ? (
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={labelStyle}>連結子女（家長只可查看已連結子女的作業和成績）</div>
                  <input value={childSearch} onChange={(e) => setChildSearch(e.target.value)} style={inputStyle} placeholder="搜尋學生姓名或電郵" aria-label="搜尋學生" />
                  <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid #E8E8ED', borderRadius: 10 }}>
                    {students
                      .filter((u) => {
                        const q = childSearch.trim().toLowerCase();
                        return !q || String(u.name || '').toLowerCase().includes(q) || String(u.email || '').toLowerCase().includes(q);
                      })
                      .map((u) => {
                        const on = form.childUids.includes(u.uid);
                        return (
                          <label key={u.uid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid #F0F0F3', cursor: 'pointer', background: on ? 'rgba(0,113,227,0.06)' : 'transparent' }}>
                            <input type="checkbox" checked={on} onChange={() => setForm((f) => ({ ...f, childUids: on ? f.childUids.filter((x) => x !== u.uid) : [...f.childUids, u.uid] }))} />
                            <Avatar photoURL={u.photoURL} name={u.name || u.email} size={24} />
                            <span style={{ fontSize: 14, fontWeight: 500 }}>{u.name || u.email || u.uid}</span>
                            <span style={{ fontSize: 12, color: '#6E6E73', marginLeft: 'auto' }}>{u.class || u.email || ''}</span>
                          </label>
                        );
                      })}
                  </div>
                  <div style={{ fontSize: 12, color: '#6E6E73' }}>已連結 {form.childUids.length} 位子女</div>
                </div>
              ) : null}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="qcBtn qcBtnPrimary" onClick={onSave} disabled={saving}>
                  {saving ? '儲存中…' : '儲存'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const labelStyle = { fontWeight: 600, fontSize: 13, color: '#6E6E73' };
const ROLE_NAMES = { admin: '管理員', teacher: '老師', student: '學生', parent: '家長' };
const STATUS_NAMES = { active: '啟用', review: '待審核', suspended: '停用' };

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #D2D2D7',
  background: '#FFFFFF',
  outline: 'none',
  fontSize: 15,
  fontWeight: 500,
};

const selectStyle = { ...inputStyle };
