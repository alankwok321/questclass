import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  TrendingUp,
  FileText,
  MessageSquare,
  Bell,
  Search,
} from 'lucide-react';

import TeacherHomework from './pages/TeacherHomework.jsx';
import TeacherHomeworkLayout from './pages/TeacherHomeworkLayout.jsx';
import TeacherHomeworkList from './pages/TeacherHomeworkList.jsx';
import TeacherHomeworkDetail from './pages/TeacherHomeworkDetail.jsx';
import TeacherHomeworkEditor from './pages/TeacherHomeworkEditor.jsx';
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
    if (p.startsWith('/teacher')) return '教師儀表板';
    if (p.startsWith('/student')) return '學生首頁';
    if (p.startsWith('/admin')) return '管理後台';
    if (p.startsWith('/chat')) return 'AI 聊天';
    if (p.startsWith('/analytics')) return '分析';
    return 'QuestClass';
  }, [location.pathname]);

  const items = [
    { to: '/dashboard', label: '儀表板', icon: LayoutDashboard },
    { to: '/classroom', label: '班級管理', icon: Users },
    { to: '/assignments', label: '作業批改', icon: BookOpen },
    { to: '/progress', label: '進度追蹤', icon: TrendingUp },
    { to: '/reports', label: '學習報告', icon: FileText },
    { to: '/parents', label: '家長通知', icon: MessageSquare },
  ];

  const extraItems = [
    { to: '/teacher-homework', label: '出作業', icon: BookOpen },
    { to: '/teacher-question-bank', label: '題庫', icon: BookOpen },
    { to: '/student-homework', label: '我的作業', icon: FileText },
    { to: '/teacher', label: '教師工具', icon: LayoutDashboard },
    { to: '/chat', label: 'AI 聊天', icon: MessageSquare },
    { to: '/admin', label: '系統管理', icon: FileText },
    { to: '/analytics', label: '分析', icon: TrendingUp },
    { to: '/', label: '首頁', icon: BookOpen },
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

  return (
    <div className="appShell">
      <aside className="sidebar">
        <div className="brand">QuestClass</div>
        <nav className="nav noScrollbar">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `navItem ${isActive ? 'navItemActive' : ''}`}
              end={to === '/'}
            >
              <Icon size={20} />
              <span>{label}</span>
            </NavLink>
          ))}

          <div className="sidebarDivider" />

          {extraItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `navItem ${isActive ? 'navItemActive' : ''}`}
              end={to === '/'}
            >
              <Icon size={20} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebarFooter">
          <div className="profileCard" style={{ justifyContent: 'space-between', padding: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0, flex: 1 }}>
              <img
                src={user?.photoURL || '/web/user.svg'}
                alt="user"
                width={38}
                height={38}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 999,
                  objectFit: 'cover',
                  border: '1px solid rgba(17,24,39,0.10)',
                  background: 'linear-gradient(135deg, #007AFF, #60A5FA)'
                }}
                onError={(e) => { e.currentTarget.src = '/web/user.svg'; }}
              />

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 900, fontSize: 14, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.name || '未登入'}
                </div>
                <div style={{ color: '#6B7280', fontWeight: 800, fontSize: 11, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.role ? `角色：${user.role}` : (fbReady ? '點右側登入' : 'Firebase 未設定')}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={user ? onLogout : onLogin}
              disabled={!fbReady}
              title={user ? '登出' : '登入'}
              style={{
                border: '1px solid rgba(17,24,39,0.10)',
                background: '#F2F2F7',
                borderRadius: 999,
                padding: '6px 10px',
                fontWeight: 900,
                fontSize: 11,
                color: user ? '#111827' : '#007AFF',
                cursor: fbReady ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap',
                opacity: fbReady ? 1 : 0.6
              }}
            >
              {user ? '登出' : '登入'}
            </button>
          </div>
        </div>
      </aside>

      <main className="canvas">
        <header className="header">
          <h1 className="hTitle">{title}</h1>
          <div className="headerRight">
            <div className="searchWrap">
              <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
              <input className="search" placeholder="搜尋..." />
            </div>


            <button
              type="button"
              aria-label="notifications"
              style={{
                border: 0,
                background: '#F2F2F7',
                borderRadius: 999,
                width: 38,
                height: 38,
                display: 'grid',
                placeItems: 'center',
                color: '#6B7280',
                position: 'relative',
              }}
            >
              <Bell size={18} />
              <span
                style={{
                  position: 'absolute',
                  right: 7,
                  top: 7,
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: '#FF3B30',
                  border: '2px solid #F2F2F7',
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
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/classroom" element={<PlaceholderTab title="班級管理" />} />
      <Route path="/assignments" element={<PlaceholderTab title="作業批改" />} />
      <Route path="/progress" element={<PlaceholderTab title="進度追蹤" />} />
      <Route path="/reports" element={<PlaceholderTab title="學習報告" />} />
      <Route path="/parents" element={<PlaceholderTab title="家長通知" />} />

      {/* Homework (Teams-style teacher UI) */}
      <Route path="/teacher-homework" element={<TeacherHomeworkLayout />}>
        {/* Default to Assigned */}
        <Route index element={<TeacherHomeworkDetail />} />
        <Route path="drafts" element={<TeacherHomeworkDetail />} />
        <Route path="assigned" element={<TeacherHomeworkDetail />} />
        <Route path="archived" element={<TeacherHomeworkDetail />} />
        <Route path="new" element={<TeacherHomeworkEditor mode="new" />} />
        <Route path=":id" element={<TeacherHomeworkDetail />} />
        <Route path=":id/edit" element={<TeacherHomeworkEditor mode="edit" />} />
      </Route>

      {/* Teacher question bank */}
      <Route path="/teacher-question-bank" element={<TeacherQuestionBank />} />

      {/* Student homework */}
      <Route path="/student-homework" element={<StudentHomework />} />

      {/* Legacy teacher-homework page (kept for now; can delete later) */}
      <Route path="/teacher-homework-legacy" element={<TeacherHomework />} />

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
