import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  TrendingUp,
  FileText,
  MessageSquare,
  Bell,
  Search,
  Sparkles,
  Library,
  Settings,
  House,
  ClipboardCheck,
  CirclePlus,
  Wrench,
  Star,
} from 'lucide-react';

import TeacherHomework from './pages/TeacherHomework.jsx';
import TeacherHomeworkLayout from './pages/TeacherHomeworkLayout.jsx';
import TeacherHomeworkList from './pages/TeacherHomeworkList.jsx';
import TeacherHomeworkDetail from './pages/TeacherHomeworkDetail.jsx';
import TeacherHomeworkEditor from './pages/TeacherHomeworkEditor.jsx';
import TeacherHomeworkPage from './pages/TeacherHomeworkPage.jsx';
import TeacherQuestionBank from './pages/TeacherQuestionBank.jsx';
import StudentHomework from './pages/StudentHomework.jsx';

import './style.css';
import Teacher from './pages/Teacher.jsx';
import ChatPage from './pages/Chat.jsx';
import AdminPage from './pages/Admin.jsx';
import Dashboard from './pages/Dashboard.jsx';
import PlaceholderTab from './pages/PlaceholderTab.jsx';
import { ToastProvider, useToast } from './components/Toast.jsx';
import { firebaseEnabled, firebaseInit, signInWithGoogle, signOut } from './services/firebase.js';

const ROLE_LABELS = { admin: '管理員', teacher: '教師', student: '學生' };

function NavItem({ to, label, icon: Icon, badge }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `navItem ${isActive ? 'navItemActive' : ''}`}
      end={to === '/'}
    >
      <Icon size={18} strokeWidth={1.8} />
      <span>{label}</span>
      {badge ? <span style={{ marginLeft: 'auto', fontSize: 13, opacity: 0.75 }}>{badge}</span> : null}
    </NavLink>
  );
}

function NavGroup({ label, items }) {
  if (!items.length) return null;
  return (
    <div className="navGroup">
      <div className="navGroupLabel">{label}</div>
      {items.map((item) => <NavItem key={item.to} {...item} />)}
    </div>
  );
}

function Shell({ user, setUser, fbReady, setFbReady, children }) {
  const location = useLocation();
  const toast = useToast();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setFbReady(firebaseEnabled());
        if (!firebaseEnabled()) return;
        const res = await firebaseInit();
        if (!mounted) return;
        setUser(res?.user || null);
        window.__qc_user = res?.user || null;
      } catch {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, []);

  const title = useMemo(() => {
    const p = location.pathname;
    if (p.startsWith('/teacher-homework')) return '出作業';
    if (p.startsWith('/teacher-question-bank')) return '題庫';
    if (p.startsWith('/teacher')) return '教師工具';
    if (p.startsWith('/student-homework')) return '我的作業';
    if (p.startsWith('/student')) return '學生首頁';
    if (p.startsWith('/admin')) return '管理後台';
    if (p.startsWith('/chat')) return 'AI 助教';
    if (p.startsWith('/analytics')) return '分析';
    if (p.startsWith('/classroom')) return '班級管理';
    if (p.startsWith('/assignments')) return '作業批改';
    if (p.startsWith('/progress')) return '進度追蹤';
    if (p.startsWith('/reports')) return '學習報告';
    if (p.startsWith('/parents')) return '家長通知';
    if (p === '/' || p.startsWith('/dashboard')) return '儀表板';
    return 'QuestClass';
  }, [location.pathname]);

  const role = user?.role || '';

  const teachingItems = [
    { to: '/dashboard', label: '儀表板', icon: LayoutDashboard },
    { to: '/classroom', label: '班級管理', icon: Users },
    { to: '/assignments', label: '作業批改', icon: ClipboardCheck },
    { to: '/progress', label: '進度追蹤', icon: TrendingUp },
    { to: '/reports', label: '學習報告', icon: FileText },
    { to: '/parents', label: '家長通知', icon: MessageSquare },
  ];

  const learningItems = [
    ...(role === 'student' ? [{ to: '/student-homework', label: '我的作業', icon: Star }] : []),
    ...(role === 'admin' ? [{ to: '/student-homework', label: '學生作業', icon: Star }] : []),
  ];

  const prepItems = (role === 'teacher' || role === 'admin') ? [
    { to: '/teacher-homework', label: '出作業', icon: CirclePlus },
    { to: '/teacher-question-bank', label: '題庫', icon: Library },
    { to: '/teacher', label: '教師工具', icon: Wrench },
  ] : [];

  const moreItems = [
    { to: '/chat', label: 'AI 助教', icon: Sparkles },
    { to: '/analytics', label: '分析', icon: TrendingUp },
    ...(role === 'admin' ? [{ to: '/admin', label: '管理後台', icon: Settings }] : []),
    { to: '/', label: '首頁', icon: House },
  ];

  const onLogin = async () => {
    if (!fbReady) return toast.show('Firebase 未設定');
    const res = await signInWithGoogle();
    if (res?.ok) {
      setUser(res.user || null);
      window.__qc_user = res.user || null;
      toast.show('登入成功');
    } else {
      toast.show(res?.error || '登入失敗');
    }
  };

  const onLogout = async () => {
    await signOut();
    setUser(null);
    window.__qc_user = null;
    toast.show('已登出');
  };

  const initials = String(user?.name || '')
    .replace(/\(.*\)/, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const eyebrow = user?.name
    ? `${user.name.replace(/\s*\(.*\)\s*/, '')}${ROLE_LABELS[role] ? ` · ${ROLE_LABELS[role]}` : ''}`
    : 'QuestClass';

  return (
    <div className="appShell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark" aria-hidden="true">
            <Star size={18} strokeWidth={2.2} />
          </div>
          QuestClass
        </div>

        <nav className="nav noScrollbar" aria-label="主選單">
          <NavGroup label="教學" items={teachingItems} />
          <NavGroup label="學習" items={learningItems} />
          <NavGroup label="備課" items={prepItems} />
          <NavGroup label="更多" items={moreItems} />
        </nav>

        <div className="sidebarFooter">
          <div className="profileCard">
            <div
              aria-hidden="true"
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                flexShrink: 0,
                overflow: 'hidden',
                background: user ? '#0071E3' : '#8E8E93',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt=""
                  width={34}
                  height={34}
                  style={{ width: 34, height: 34, objectFit: 'cover' }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              ) : (initials || '?')}
            </div>

            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.name || '未登入'}
              </div>
              <div style={{ color: '#6E6E73', fontSize: 12, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.role ? (ROLE_LABELS[user.role] || user.role) : (fbReady ? '尚未登入' : 'Firebase 未設定')}
              </div>
            </div>

            <button
              type="button"
              onClick={user ? onLogout : onLogin}
              disabled={!fbReady}
              title={user ? '登出' : '登入'}
              className="qcBtn qcBtnSmall"
              style={{
                height: 30,
                padding: '0 12px',
                background: user ? '#E3E3E8' : '#0071E3',
                color: user ? '#1D1D1F' : '#fff',
                fontSize: 12,
                opacity: fbReady ? 1 : 0.5,
              }}
            >
              {user ? '登出' : '登入'}
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
              <span
                style={{
                  position: 'absolute',
                  right: 9,
                  top: 9,
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: '#FF3B30',
                  border: '1.5px solid #fff',
                }}
              />
            </button>
          </div>
        </header>

        <div className="content">{children}</div>
      </main>
    </div>
  );
}

function Placeholder({ name }) {
  return (
    <div className="card" style={{ height: 360, display: 'grid', placeItems: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>{name}</div>
        <div style={{ marginTop: 8, color: '#6B7280', fontWeight: 700 }}>功能開發中</div>
      </div>
    </div>
  );
}

function AppRoutes({ user }) {
  // Students can't read class-wide data, so their home is their own homework.
  const home = user?.role === 'student' ? <StudentHomework /> : <Dashboard />;
  return (
    <Routes>
      <Route path="/" element={home} />
      <Route path="/dashboard" element={home} />
      <Route path="/classroom" element={<PlaceholderTab title="班級管理" />} />
      <Route path="/assignments" element={<PlaceholderTab title="作業批改" />} />
      <Route path="/progress" element={<PlaceholderTab title="進度追蹤" />} />
      <Route path="/reports" element={<PlaceholderTab title="學習報告" />} />
      <Route path="/parents" element={<PlaceholderTab title="家長通知" />} />

      {/* Homework – simplified teacher UI */}
      <Route path="/teacher-homework" element={<TeacherHomeworkPage />} />

      {/* Teacher question bank */}
      <Route path="/teacher-question-bank" element={<TeacherQuestionBank />} />

      {/* Student homework */}
      <Route path="/student-homework" element={<StudentHomework />} />

      {/* Legacy pages (kept for reference) */}
      <Route path="/teacher-homework-legacy" element={<TeacherHomework />} />
      <Route path="/teacher-homework-old/*" element={<TeacherHomeworkLayout />} />

      {/* Existing core tools */}
      <Route path="/teacher" element={<Teacher />} />
      <Route path="/chat" element={<ChatPage />} />
      <Route path="/admin" element={<AdminPage user={user} />} />
      <Route path="/analytics" element={<PlaceholderTab title="分析" />} />

      <Route path="*" element={<PlaceholderTab title="找不到頁面" />} />
    </Routes>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [fbReady, setFbReady] = useState(false);

  return (
    <ToastProvider>
      <BrowserRouter>
        <Shell user={user} setUser={setUser} fbReady={fbReady} setFbReady={setFbReady}>
          <AppRoutes user={user} />
        </Shell>
      </BrowserRouter>
    </ToastProvider>
  );
}
