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

import './style.css';
import Teacher from './pages/Teacher.jsx';
import ChatPage from './pages/Chat.jsx';
import AdminPage from './pages/Admin.jsx';
import { ToastProvider, useToast } from './components/Toast.jsx';
import { firebaseEnabled, firebaseInit, signInWithGoogle, signOut } from './services/firebase.js';

function Shell({ children }) {
  const location = useLocation();
  const toast = useToast();

  const [user, setUser] = useState(null);
  const [fbReady, setFbReady] = useState(false);

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
    { to: '/teacher', label: 'Teacher', icon: LayoutDashboard },
    { to: '/student', label: 'Student', icon: Users },
    { to: '/admin', label: 'Admin', icon: FileText },
    { to: '/chat', label: 'Chat', icon: MessageSquare },
    { to: '/analytics', label: 'Analytics', icon: TrendingUp },
    { to: '/', label: 'Landing', icon: BookOpen },
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
        <nav className="nav">
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
              title={user ? 'Logout' : 'Login'}
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
              {user ? 'Logout' : 'Login'}
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
        <div style={{ marginTop: 8, color: '#6B7280', fontWeight: 700 }}>待搬遷</div>
      </div>
    </div>
  );
}

function AppRoutes({ user }) {
  return (
    <Routes>
      <Route path="/" element={<Placeholder name="Landing" />} />
      <Route path="/teacher" element={<Teacher />} />
      <Route path="/chat" element={<ChatPage />} />
      <Route path="/student" element={<Placeholder name="Student" />} />
      <Route path="/admin" element={<AdminPage user={user} />} />
      <Route path="/analytics" element={<Placeholder name="Analytics" />} />
      <Route path="*" element={<Placeholder name="Not Found" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Shell>
          <AppRoutes user={window.__qc_user || null} />
        </Shell>
      </BrowserRouter>
    </ToastProvider>
  );
}
