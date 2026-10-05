import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  TrendingUp,
  FileText,
  MessageSquare,
  Bell,
  Search,
  Library,
  Settings,
  ClipboardCheck,
  CirclePlus,
  Wrench,
  Star,
  Activity,
  Heart,
  KeyRound,
  Building2,
} from 'lucide-react';

import TeacherHomeworkPage from './pages/TeacherHomeworkPage.jsx';
import TeacherQuestionBank from './pages/TeacherQuestionBank.jsx';
import StudentHomework from './pages/StudentHomework.jsx';

import './style.css';
import Teacher from './pages/Teacher.jsx';
import AdminPage from './pages/Admin.jsx';
import AiSettingsPage from './pages/AiSettings.jsx';
import SchoolsPage from './pages/Schools.jsx';
import JoinSchool from './pages/JoinSchool.jsx';
import Dashboard from './pages/Dashboard.jsx';
import PlaceholderTab from './pages/PlaceholderTab.jsx';
import Landing from './pages/Landing.jsx';
import ParentPage from './pages/Parent.jsx';
import AssistantBubble from './components/AssistantBubble.jsx';
import { ToastProvider, useToast } from './components/Toast.jsx';
import { firebaseEnabled, firebaseInit, getSchool, signInWithGoogle, signOut } from './services/firebase.js';
import { ROLE_LABELS, canAccess, homePathFor, isBlockedAccount, normalizeRole } from './permissions.js';

// Every sidebar entry; each one is shown only to roles that may open it (see permissions.js).
const NAV_GROUPS = [
  {
    label: '教學',
    items: [
      { to: '/dashboard', label: '儀表板', icon: LayoutDashboard },
      { to: '/classroom', label: '班級管理', icon: Users },
      { to: '/assignments', label: '作業批改', icon: ClipboardCheck },
      { to: '/progress', label: '進度追蹤', icon: TrendingUp },
      { to: '/reports', label: '學習報告', icon: FileText },
      { to: '/parents', label: '家長通知', icon: MessageSquare },
    ],
  },
  { label: '學習', items: [{ to: '/student-homework', label: '我的作業', icon: Star }] },
  { label: '家長', items: [{ to: '/parent', label: '我的孩子', icon: Heart }] },
  {
    label: '備課',
    items: [
      { to: '/teacher-homework', label: '出作業', icon: CirclePlus },
      { to: '/teacher-question-bank', label: '題庫', icon: Library },
      { to: '/teacher', label: '教師工具', icon: Wrench },
    ],
  },
  {
    label: '更多',
    items: [
      { to: '/analytics', label: '分析', icon: Activity },
      { to: '/admin', label: '管理後台', icon: Settings, end: true },
      { to: '/admin/ai-settings', label: 'AI 設定', icon: KeyRound },
      { to: '/admin/schools', label: '學校管理', icon: Building2, platformOnly: true },
    ],
  },
];

const TITLES = [
  ['/teacher-homework', '出作業'],
  ['/teacher-question-bank', '題庫'],
  ['/teacher', '教師工具'],
  ['/student-homework', '我的作業'],
  ['/parents', '家長通知'],
  ['/parent', '我的孩子'],
  ['/admin/ai-settings', 'AI 設定'],
  ['/admin/schools', '學校管理'],
  ['/admin', '管理後台'],
  ['/analytics', '分析'],
  ['/classroom', '班級管理'],
  ['/assignments', '作業批改'],
  ['/progress', '進度追蹤'],
  ['/reports', '學習報告'],
  ['/dashboard', '儀表板'],
];

function NavItem({ to, label, icon: Icon, end = false }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `navItem ${isActive ? 'navItemActive' : ''}`}>
      <Icon size={18} strokeWidth={1.8} />
      <span>{label}</span>
    </NavLink>
  );
}

function FullScreenNotice({ title, body, action }) {
  return (
    <div className="qcCenter">
      <div className="qcCard" style={{ maxWidth: 440, textAlign: 'center', padding: '32px 28px' }}>
        <div className="brandMark" aria-hidden="true" style={{ margin: '0 auto 14px' }}><Star size={18} strokeWidth={2.2} /></div>
        <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700 }}>{title}</h1>
        <p style={{ margin: 0, color: '#6E6E73', fontSize: 15, lineHeight: 1.6 }}>{body}</p>
        {action ? <div style={{ marginTop: 18 }}>{action}</div> : null}
      </div>
    </div>
  );
}

// Sends "/" to the role's home and any page the role may not open back to that home.
function RoleGate({ role, platformOnly = false, children }) {
  const { pathname } = useLocation();
  // The platform admin belongs to no school, so only the admin pages apply to them.
  const home = platformOnly ? '/admin/schools' : homePathFor(role);
  const p = pathname.replace(/\/+$/, '') || '/';
  if (platformOnly && p !== '/admin' && !p.startsWith('/admin/')) return <Navigate to={home} replace />;
  if (p === '/') return <Navigate to={home} replace />;
  if (!canAccess(role, p)) return <Navigate to={home} replace />;
  return children;
}

// The AI assistant is now the floating bubble; old /chat links open it and go home.
function OpenAssistant({ role }) {
  useEffect(() => {
    window.__qc_openAssistant = true; // read by the bubble if it mounts after this effect
    window.dispatchEvent(new Event('qc:open-assistant'));
  }, []);
  return <Navigate to={homePathFor(role)} replace />;
}

function Shell({ user, schoolName, platformOnly = false, onLogout, children }) {
  const location = useLocation();
  const role = normalizeRole(user?.role);

  const title = useMemo(() => {
    const p = location.pathname;
    const hit = TITLES.find(([prefix]) => p === prefix || p.startsWith(prefix + '/') || (prefix === '/teacher-homework' && p.startsWith(prefix)));
    return hit ? hit[1] : 'QuestClass';
  }, [location.pathname]);

  const groups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((it) => canAccess(role, it.to) && (!it.platformOnly || user?.platformAdmin)
      && (!platformOnly || it.to.startsWith('/admin'))) }))
    .filter((g) => g.items.length);

  const initials = String(user?.name || '')
    .replace(/\(.*\)/, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const displayName = String(user?.name || '').replace(/\s*\(.*\)\s*/, '');
  const roleLabel = platformOnly ? '平台管理員' : ROLE_LABELS[role];
  const eyebrow = `${schoolName ? `${schoolName} · ` : ''}${displayName}${roleLabel ? ` · ${roleLabel}` : ''}${user?.demo ? ' · 示範模式' : ''}`;

  return (
    <div className="appShell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark" aria-hidden="true"><Star size={18} strokeWidth={2.2} /></div>
          QuestClass
        </div>

        <nav className="nav noScrollbar" aria-label="主選單">
          {groups.map((g) => (
            <div key={g.label} className="navGroup">
              <div className="navGroupLabel">{g.label}</div>
              {g.items.map((item) => <NavItem key={item.to} {...item} />)}
            </div>
          ))}
        </nav>

        <div className="sidebarFooter">
          <div className="profileCard">
            <div
              aria-hidden="true"
              style={{
                width: 34, height: 34, borderRadius: 999, flexShrink: 0, overflow: 'hidden',
                background: role === 'parent' ? '#248A3D' : '#0071E3', color: '#fff',
                display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 600,
              }}
            >
              {user?.photoURL ? (
                <img src={user.photoURL} alt="" width={34} height={34} style={{ width: 34, height: 34, objectFit: 'cover' }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              ) : (initials || '?')}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayName || '—'}
              </div>
              <div style={{ color: '#6E6E73', fontSize: 12, marginTop: 1 }}>{roleLabel || '—'}</div>
            </div>
            <button type="button" onClick={onLogout} className="qcBtn qcBtnSmall"
              style={{ height: 30, padding: '0 12px', background: '#E3E3E8', color: '#1D1D1F', fontSize: 12 }}>
              登出
            </button>
          </div>
        </div>
      </aside>

      <main className="canvas">
        <header className="header">
          <div style={{ minWidth: 0 }}>
            <div className="hEyebrow">{eyebrow}</div>
            <h1 className="hTitle">{title}</h1>
          </div>
          <div className="headerRight">
            <div className="searchWrap">
              <Search size={16} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#86868B' }} aria-hidden="true" />
              <input className="search" placeholder="搜尋" aria-label="搜尋" />
            </div>
            <button type="button" aria-label="通知" className="iconButton">
              <Bell size={18} strokeWidth={1.8} />
            </button>
          </div>
        </header>

        <div className="content">{children}</div>
      </main>

      {canAccess(role, '/chat') && !platformOnly ? <AssistantBubble user={user} pageTitle={title} /> : null}
    </div>
  );
}

function AppRoutes({ user }) {
  return (
    <Routes>
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/classroom" element={<PlaceholderTab title="班級管理" />} />
      <Route path="/assignments" element={<PlaceholderTab title="作業批改" />} />
      <Route path="/progress" element={<PlaceholderTab title="進度追蹤" />} />
      <Route path="/reports" element={<PlaceholderTab title="學習報告" />} />
      <Route path="/parents" element={<PlaceholderTab title="家長通知" />} />

      <Route path="/teacher-homework" element={<TeacherHomeworkPage />} />
      <Route path="/teacher-question-bank" element={<TeacherQuestionBank />} />
      <Route path="/student-homework" element={<StudentHomework />} />
      <Route path="/parent" element={<ParentPage />} />

      {/* The old homework editors were replaced by 出作業; their addresses now lead there. */}
      <Route path="/teacher-homework-legacy" element={<Navigate to="/teacher-homework" replace />} />
      <Route path="/teacher-homework-old/*" element={<Navigate to="/teacher-homework" replace />} />

      <Route path="/teacher" element={<Teacher />} />
      <Route path="/chat" element={<OpenAssistant role={normalizeRole(user?.role)} />} />
      <Route path="/admin" element={<AdminPage user={user} />} />
      <Route path="/admin/ai-settings" element={<AiSettingsPage user={user} />} />
      <Route path="/admin/schools" element={<SchoolsPage user={user} />} />
      <Route path="/analytics" element={<PlaceholderTab title="分析" />} />

      <Route path="*" element={<PlaceholderTab title="找不到頁面" />} />
    </Routes>
  );
}

function AppBody() {
  const toast = useToast();
  const [user, setUser] = useState(null);
  const [fbReady, setFbReady] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [schoolName, setSchoolName] = useState('');

  useEffect(() => {
    let live = true;
    setSchoolName('');
    if (user?.schoolId && !user?.demo) getSchool(user.schoolId).then((s) => { if (live) setSchoolName(s?.name || ''); });
    return () => { live = false; };
  }, [user?.schoolId, user?.demo]);

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
        // ignore; treated as signed out
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
    if (!user?.demo) await signOut();
    setUser(null);
    window.__qc_user = null;
    window.history.replaceState(null, '', '/');
  };

  const onDemo = (role) => {
    const demo = { uid: `demo-${role}`, name: `示範${ROLE_LABELS[role]}`, role, demo: true };
    setUser(demo);
    window.__qc_user = demo;
  };

  if (!authReady && fbReady) {
    return <div className="qcCenter" aria-busy="true"><div className="qcEmpty">載入中…</div></div>;
  }

  if (!user) {
    return <Landing fbReady={fbReady} signingIn={signingIn} onLogin={onLogin} onDemo={onDemo} />;
  }

  // New accounts first choose a school (the platform admin can work without one).
  if (!user.demo && !user.schoolId && !user.platformAdmin) {
    return <JoinSchool user={user} onLogout={onLogout} onJoined={(u) => { if (u) { setUser(u); window.__qc_user = u; } }} />;
  }

  const blocked = isBlockedAccount(user);
  if (blocked) {
    return (
      <FullScreenNotice
        title={blocked === 'suspended' ? '帳戶已停用' : '帳戶審核中'}
        body={blocked === 'suspended' ? '此帳戶已被學校管理員停用。如有疑問，請聯絡學校。' : `${schoolName || '學校'}的管理員確認你的帳戶並設定角色後，便可以開始使用。`}
        action={<button type="button" className="qcBtn qcBtnSecondary" onClick={onLogout}>登出</button>}
      />
    );
  }

  const role = normalizeRole(user.role);
  const platformOnly = user.platformAdmin === true && !user.schoolId;
  if (!role) {
    return (
      <FullScreenNotice
        title="尚未分配角色"
        body="你的帳戶還沒有角色。請聯絡學校管理員設定為老師、學生或家長。"
        action={<button type="button" className="qcBtn qcBtnSecondary" onClick={onLogout}>登出</button>}
      />
    );
  }

  return (
    <Shell user={user} schoolName={schoolName} platformOnly={platformOnly} onLogout={onLogout}>
      <RoleGate role={role} platformOnly={platformOnly}>
        <AppRoutes user={user} />
      </RoleGate>
    </Shell>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AppBody />
      </BrowserRouter>
    </ToastProvider>
  );
}
