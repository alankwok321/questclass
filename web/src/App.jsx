import React, { useMemo, useState } from 'react';
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

function Shell({ children }) {
  const location = useLocation();

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

  return (
    <div className="appShell">
      <aside className="sidebar">
        <div className="brand">QuestClass</div>
        <nav className="nav">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `navItem ${isActive ? 'navItemActive' : ''}`
              }
              end={to === '/'}
            >
              <Icon size={20} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebarFooter">
          <div className="profileCard">
            <div className="avatar">陳</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>陳老師</div>
              <div style={{ color: '#6B7280', fontWeight: 700, fontSize: 12, marginTop: 2 }}>
                五年三班 導師
              </div>
            </div>
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

function Stat({ title, value, subtitle }) {
  return (
    <div className="card" style={{ borderRadius: 28 }}>
      <div className="statLabel">{title}</div>
      <div className="statValue">{value}</div>
      {subtitle ? (
        <div style={{ color: '#9CA3AF', fontWeight: 700, marginTop: 6, fontSize: 13 }}>{subtitle}</div>
      ) : null}
    </div>
  );
}

function DashboardMock() {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="grid4">
        <Stat title="今日出席率" value="96%" subtitle="27/28 人已到" />
        <Stat title="待批改作業" value="12" subtitle="3 份即將逾期" />
        <Stat title="學習預警" value="2" subtitle="名學生需關注" />
        <Stat title="班級平均" value="86.5" subtitle="數學小測驗" />
      </div>

      <div className="card">
        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>Prototype</div>
        <div style={{ color: '#6B7280', fontWeight: 600, lineHeight: 1.6 }}>
          這是新版 iPadOS 風格的 React Shell。下一步我會把原本 public/*.html 的內容逐頁搬進來，
          並保留 server.js API（/api/*）與 Firebase runtime-config。
        </div>
      </div>
    </div>
  );
}

function Placeholder({ name }) {
  return (
    <div className="card" style={{ height: 360, display: 'grid', placeItems: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>{name}</div>
        <div style={{ marginTop: 8, color: '#6B7280', fontWeight: 700 }}>UI shell ready</div>
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<DashboardMock />} />
      <Route path="/teacher" element={<DashboardMock />} />
      <Route path="/student" element={<Placeholder name="Student" />} />
      <Route path="/admin" element={<Placeholder name="Admin" />} />
      <Route path="/chat" element={<Placeholder name="Chat" />} />
      <Route path="/analytics" element={<Placeholder name="Analytics" />} />
      <Route path="*" element={<Placeholder name="Not Found" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell>
        <AppRoutes />
      </Shell>
    </BrowserRouter>
  );
}
