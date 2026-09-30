import React from 'react';
import { BookOpen, Star, Users, Settings, Check } from 'lucide-react';

const ROLE_CARDS = [
  { key: 'teacher', title: '老師', icon: BookOpen, tint: ['#E8F0FC', '#0058B0'], body: '出作業、管理題庫，一眼看到全班進度。', points: ['出作業與題庫', 'AI 產生題目', '班級儀表板'] },
  { key: 'student', title: '學生', icon: Star, tint: ['#FFF1E0', '#A45200'], body: '完成作業、累積經驗值、保持連續學習。', points: ['我的作業', '等級與經驗值', 'AI 學習助教'] },
  { key: 'parent', title: '家長', icon: Users, tint: ['#E3F5E8', '#1E7B34'], body: '查看子女的作業、成績和老師回饋。', points: ['子女的作業', '成績與回饋', '截止提醒'] },
  { key: 'admin', title: '管理員', icon: Settings, tint: ['#EFEAFD', '#5B3FC4'], body: '登記帳戶、分配角色，連結家長與子女。', points: ['帳戶與角色', '家長連結', 'AI 設定'] },
];

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#FFFFFF" />
      <path d="M17.6 12.2c0-.4 0-.8-.1-1.2H12v2.3h3.2a2.7 2.7 0 0 1-1.2 1.8v1.5h1.9c1.1-1 1.7-2.5 1.7-4.4z" fill="#4285F4" />
      <path d="M12 18c1.6 0 2.9-.5 3.9-1.4L14 15.1c-.5.4-1.2.6-2 .6-1.5 0-2.8-1-3.3-2.4H6.8v1.5A6 6 0 0 0 12 18z" fill="#34A853" />
      <path d="M8.7 13.3a3.6 3.6 0 0 1 0-2.3V9.5H6.8a6 6 0 0 0 0 5.3z" fill="#FBBC05" />
      <path d="M12 8.4c.9 0 1.6.3 2.2.9l1.7-1.7A6 6 0 0 0 6.8 9.5L8.7 11C9.2 9.5 10.5 8.4 12 8.4z" fill="#EA4335" />
    </svg>
  );
}

// Public main page shown to anyone who is not signed in.
// In demo mode (Firebase not configured) it offers a role picker for previewing.
export default function Landing({ fbReady, signingIn, onLogin, onDemo }) {
  return (
    <div className="landing">
      <header className="landingBar">
        <div className="brand" style={{ padding: 0 }}>
          <div className="brandMark" aria-hidden="true"><Star size={18} strokeWidth={2.2} /></div>
          QuestClass
        </div>
        {fbReady ? (
          <button type="button" className="qcBtn qcBtnSmall" style={{ background: '#1D1D1F', color: '#fff', height: 36 }} onClick={onLogin} disabled={signingIn}>
            登入
          </button>
        ) : null}
      </header>

      <main className="landingMain">
        <section className="landingHero">
          <div className="landingKicker">為香港學校而設的功課平台</div>
          <h1 className="landingTitle">每份功課，<br />都是一次小冒險。</h1>
          <p className="landingLead">老師出作業、學生升級闖關、家長隨時掌握進度。<br />全部用學校的 Google 帳戶登入。</p>

          {fbReady ? (
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', marginTop: 10 }}>
              <button type="button" className="qcBtn qcBtnPrimary" style={{ height: 52, padding: '0 26px', fontSize: 17 }} onClick={onLogin} disabled={signingIn}>
                <GoogleMark />
                {signingIn ? '登入中…' : '以 Google 帳戶登入'}
              </button>
              <a href="#roles" className="qcLink" style={{ fontSize: 17 }}>了解各角色 ›</a>
            </div>
          ) : (
            <div className="qcCard" style={{ marginTop: 12, maxWidth: 560, textAlign: 'left' }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>示範模式</div>
              <div style={{ fontSize: 14, color: '#6E6E73', marginBottom: 12 }}>Firebase 尚未設定。選擇一個角色預覽介面（沒有真實資料）。</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {ROLE_CARDS.map((r) => (
                  <button key={r.key} type="button" className="qcBtn qcBtnSmall qcBtnTinted" onClick={() => onDemo(r.key)}>{r.title}</button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section id="roles" aria-label="四種角色" className="landingRoles">
          {ROLE_CARDS.map(({ key, title, icon: Icon, tint, body, points }) => (
            <article key={key} className="qcCard" style={{ padding: '26px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div aria-hidden="true" style={{ width: 48, height: 48, borderRadius: 14, display: 'grid', placeItems: 'center', background: tint[0], color: tint[1] }}>
                <Icon size={24} strokeWidth={1.8} />
              </div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>{title}</h2>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: '#6E6E73' }}>{body}</p>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {points.map((p) => (
                  <li key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                    <Check size={16} color="#248A3D" strokeWidth={2.4} aria-hidden="true" />{p}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      </main>

      <footer className="landingFooter">帳戶由學校管理員登記。如未能登入，請聯絡學校。</footer>
    </div>
  );
}
