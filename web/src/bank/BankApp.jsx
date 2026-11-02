// 題庫 — the question bank as its own app (served at /bank).
// It signs in with the same Google accounts and reads/writes the same Firestore `questionBank`
// collection as QuestClass, so a question edited here is the same question in 出作業 and 題庫 there.
import React, { useEffect, useState } from 'react';
import { Library, ExternalLink } from 'lucide-react';

import '../style.css';
import TeacherQuestionBank from '../pages/TeacherQuestionBank.jsx';
import JoinSchool from '../pages/JoinSchool.jsx';
import Avatar from '../components/Avatar.jsx';
import { ToastProvider, useToast } from '../components/Toast.jsx';
import { ConfirmProvider } from '../components/Confirm.jsx';
import { firebaseEnabled, firebaseInit, getSchool, listSchools, signInWithGoogle, signOut } from '../services/firebase.js';
import { ROLE_LABELS, canAccess, isBlockedAccount, normalizeRole } from '../permissions.js';

const BANK_PATH = '/teacher-question-bank'; // same permission rule as the 題庫 page in QuestClass

function Notice({ title, body, action }) {
  return (
    <div className="qcCenter">
      <div className="qcCard" style={{ maxWidth: 440, textAlign: 'center', padding: '32px 28px' }}>
        <div className="brandMark" aria-hidden="true" style={{ margin: '0 auto 14px' }}><Library size={18} strokeWidth={2.2} /></div>
        <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700 }}>{title}</h1>
        <p style={{ margin: 0, color: '#6E6E73', fontSize: 15, lineHeight: 1.6 }}>{body}</p>
        {action ? <div style={{ marginTop: 18, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>{action}</div> : null}
      </div>
    </div>
  );
}

// Platform admin only: which school's question bank to edit. Switching reloads so everything
// loads that school's questions.
function SchoolPicker({ value, compact = false }) {
  const [schools, setSchools] = useState([]);
  useEffect(() => { listSchools().then((r) => setSchools(r?.schools || [])); }, []);
  const onChange = (e) => {
    window.QuestClassFirebase?.setActiveSchool?.(e.target.value);
    window.location.reload();
  };
  return (
    <select value={value} onChange={onChange} aria-label="學校" style={{
      padding: '7px 10px', borderRadius: 10, border: '1px solid #D2D2D7', background: '#FFFFFF',
      fontSize: 13, fontWeight: 500, maxWidth: compact ? 180 : '100%',
    }}>
      <option value="">選擇學校…</option>
      {schools.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
    </select>
  );
}

function BankShell({ user, schoolName, activeSchoolId, onLogout, children }) {
  const role = normalizeRole(user?.role);
  const displayName = String(user?.name || '').replace(/\s*\(.*\)\s*/, '');
  const roleLabel = user?.platformAdmin ? '平台管理員' : ROLE_LABELS[role];
  return (
    <div style={{ minHeight: '100vh', background: '#F5F5F7' }}>
      <header style={{
        position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '12px 20px', background: 'rgba(245,245,247,0.86)', backdropFilter: 'saturate(180%) blur(20px)',
        borderBottom: '1px solid #E5E5EA',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          <div className="brandMark" aria-hidden="true"><Library size={18} strokeWidth={2.2} /></div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 17, lineHeight: 1.2 }}>題庫</div>
            <div style={{ color: '#6E6E73', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {[schoolName, displayName, roleLabel].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>
        {user?.platformAdmin ? <SchoolPicker value={activeSchoolId} compact /> : null}
        <a href="/teacher-homework" className="qcBtn qcBtnSmall qcBtnSecondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
          QuestClass <ExternalLink size={13} />
        </a>
        <Avatar photoURL={user?.photoURL} name={user?.name} size={30} />
        <button type="button" onClick={onLogout} className="qcBtn qcBtnSmall"
          style={{ background: '#E3E3E8', color: '#1D1D1F' }}>
          登出
        </button>
      </header>
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 16px 48px' }}>{children}</main>
    </div>
  );
}

function BankBody() {
  const toast = useToast();
  const [user, setUser] = useState(null);
  const [fbReady, setFbReady] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [schoolName, setSchoolName] = useState('');
  const activeSchoolId = user?.platformAdmin ? (window.QuestClassFirebase?.getActiveSchool?.() || '') : (user?.schoolId || '');

  useEffect(() => {
    let live = true;
    setSchoolName('');
    if (activeSchoolId) getSchool(activeSchoolId).then((s) => { if (live) setSchoolName(s?.name || ''); });
    return () => { live = false; };
  }, [activeSchoolId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const on = firebaseEnabled();
        setFbReady(on);
        if (!on) return;
        const res = await firebaseInit();
        if (!mounted) return;
        setUser(res?.user || null);
        window.__qc_user = res?.user || null;
      } catch {
        // treated as signed out
      } finally {
        if (mounted) setAuthReady(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const onLogin = async () => {
    if (!fbReady) return toast.show('Firebase 未設定');
    setSigningIn(true);
    try {
      const res = await signInWithGoogle();
      if (res?.ok) {
        setUser(res.user || null);
        window.__qc_user = res.user || null;
      } else {
        toast.show(res?.error || '登入失敗');
      }
    } finally {
      setSigningIn(false);
    }
  };

  const onLogout = async () => {
    await signOut();
    setUser(null);
    window.__qc_user = null;
  };

  const logoutBtn = <button type="button" className="qcBtn qcBtnSecondary" onClick={onLogout}>登出</button>;

  if (!authReady && fbReady) {
    return <div className="qcCenter" aria-busy="true"><div className="qcEmpty">載入中…</div></div>;
  }

  if (!user) {
    return (
      <Notice
        title="題庫"
        body={fbReady ? '用學校的 Google 帳戶登入，編輯和 QuestClass 共用的題庫。' : 'Firebase 未設定，暫時無法登入。'}
        action={(
          <button type="button" className="qcBtn qcBtnPrimary" onClick={onLogin} disabled={!fbReady || signingIn}>
            {signingIn ? '登入中…' : '使用 Google 登入'}
          </button>
        )}
      />
    );
  }

  if (!user.schoolId && !user.platformAdmin) {
    return <JoinSchool user={user} onLogout={onLogout} onJoined={(u) => { if (u) { setUser(u); window.__qc_user = u; } }} />;
  }

  const blocked = isBlockedAccount(user);
  if (blocked) {
    return (
      <Notice
        title={blocked === 'suspended' ? '帳戶已停用' : '帳戶審核中'}
        body={blocked === 'suspended' ? '此帳戶已被學校管理員停用。如有疑問，請聯絡學校。' : `${schoolName || '學校'}的管理員確認你的帳戶後，便可以使用題庫。`}
        action={logoutBtn}
      />
    );
  }

  const role = normalizeRole(user.role);
  if (!canAccess(role, BANK_PATH)) {
    return (
      <Notice
        title="只限老師使用"
        body="題庫只供老師和管理員使用。"
        action={<>{logoutBtn}<a className="qcBtn qcBtnPrimary" href="/" style={{ textDecoration: 'none' }}>前往 QuestClass</a></>}
      />
    );
  }

  if (user.platformAdmin && !activeSchoolId) {
    return (
      <Notice
        title="選擇學校"
        body="平台管理員不屬於任何學校。請選擇要編輯哪一間學校的題庫。"
        action={<><SchoolPicker value="" />{logoutBtn}</>}
      />
    );
  }

  return (
    <BankShell user={user} schoolName={schoolName} activeSchoolId={activeSchoolId} onLogout={onLogout}>
      <TeacherQuestionBank />
    </BankShell>
  );
}

export default function BankApp() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <BankBody />
      </ConfirmProvider>
    </ToastProvider>
  );
}
