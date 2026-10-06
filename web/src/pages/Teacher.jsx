import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, BookOpenCheck, ClipboardCheck, Layers, ListChecks, Mail, MessageSquareText, Shuffle, Target, Timer, Users,
} from 'lucide-react';
import LessonPlan from './teacher-tools/LessonPlan.jsx';
import Reteach from './teacher-tools/Reteach.jsx';
import Comments from './teacher-tools/Comments.jsx';
import ParentMessage from './teacher-tools/ParentMessage.jsx';
import Differentiate from './teacher-tools/Differentiate.jsx';
import { ClassTimer, GroupMaker, RandomPicker } from './teacher-tools/ClassTools.jsx';

// 教師工具: everyday tools for preparing lessons, following up students and running the class.
// AI tools use the school's AI (set by the admin); classroom tools work without it.
const GROUPS = [
  {
    label: '備課',
    tools: [
      { key: 'lesson', title: '教案設計', desc: '輸入課題，產生有時間分配、活動和照顧差異的一節課教案。', icon: BookOpenCheck, ai: true, el: LessonPlan },
      { key: 'differentiate', title: '分層改寫', desc: '把文章或題目改成基礎／標準／挑戰版本，或出理解問題、詞彙表。', icon: Layers, ai: true, el: Differentiate },
      { key: 'questions', title: '出題及題庫', desc: '用 AI 出選擇題、填充題等，儲存到題庫再派發作業。', icon: ListChecks, href: '/teacher-question-bank' },
    ],
  },
  {
    label: '跟進學生',
    tools: [
      { key: 'reteach', title: '針對弱項重教', desc: '從作業數據找出全班最弱的課題和需要幫助的學生，設計 15 分鐘重教環節。', icon: Target, ai: true, data: true, el: Reteach },
      { key: 'comments', title: '成績表評語', desc: '按每位學生的作業紀錄，一次過起草全班評語，可逐段修改。', icon: MessageSquareText, ai: true, data: true, el: Comments },
      { key: 'parent', title: '家長訊息', desc: '欠交提醒、表揚、約見家長等訊息或信件，可用學生的實際紀錄。', icon: Mail, ai: true, data: true, el: ParentMessage },
      { key: 'marking', title: '作業批改', desc: '批改文字題，確認 AI 評分。', icon: ClipboardCheck, href: '/assignments' },
    ],
  },
  {
    label: '課堂',
    tools: [
      { key: 'picker', title: '隨機抽學生', desc: '公平抽人回答問題，每人抽中一次後才再輪到。', icon: Shuffle, el: RandomPicker },
      { key: 'groups', title: '分組', desc: '隨機、能力混合或能力相近分組，可剔除缺席學生。', icon: Users, data: true, el: GroupMaker },
      { key: 'timer', title: '課堂計時器', desc: '大字倒數計時，時間到會響，可全螢幕投影。', icon: Timer, el: ClassTimer },
    ],
  },
];
const ALL = GROUPS.flatMap((g) => g.tools);

function Tag({ children, tone }) {
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: tone === 'ai' ? '#EEF0FF' : '#F2F2F5', color: tone === 'ai' ? '#3634A3' : '#6E6E73' }}>{children}</span>;
}

export default function Teacher() {
  const [params, setParams] = useSearchParams();
  const tool = ALL.find((t) => t.key === params.get('tool') && t.el);

  if (tool) {
    const El = tool.el;
    const Icon = tool.icon;
    return (
      <div style={{ display: 'grid', gap: 16 }}>
        <div className="qcNoPrint" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="qcBtn qcBtnSecondary qcBtnSmall" onClick={() => setParams({})}><ArrowLeft size={15} aria-hidden="true" /> 所有工具</button>
          <Icon size={20} color="#0071E3" aria-hidden="true" />
          <div style={{ fontSize: 18, fontWeight: 700 }}>{tool.title}</div>
          {tool.ai ? <Tag tone="ai">AI</Tag> : null}
        </div>
        <El />
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div style={{ color: '#6E6E73', fontSize: 15, marginTop: -4 }}>
        備課、跟進學生和上課用的工具。標有 <Tag tone="ai">AI</Tag> 的工具使用學校在「AI 設定」中設定的模型；標有 <Tag>用作業數據</Tag> 的會讀取你班別的真實作業紀錄。
      </div>
      {GROUPS.map((g) => (
        <section key={g.label} aria-labelledby={`tg-${g.label}`} style={{ display: 'grid', gap: 12 }}>
          <h2 id={`tg-${g.label}`} className="qcSectionTitle">{g.label}</h2>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {g.tools.map((t) => {
              const Icon = t.icon;
              const inner = (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 36, height: 36, borderRadius: 10, background: '#EEF5FF', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      <Icon size={19} color="#0071E3" aria-hidden="true" />
                    </span>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{t.title}</span>
                  </div>
                  <span style={{ fontSize: 13, color: '#6E6E73', lineHeight: 1.5 }}>{t.desc}</span>
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {t.ai ? <Tag tone="ai">AI</Tag> : null}
                    {t.data ? <Tag>用作業數據</Tag> : null}
                    {t.href ? <Tag>開啟頁面 →</Tag> : null}
                  </span>
                </>
              );
              const style = { display: 'grid', gap: 10, alignContent: 'start', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: '#1D1D1F', textDecoration: 'none', border: 0, width: '100%' };
              return t.href
                ? <Link key={t.key} to={t.href} className="qcCard" style={style}>{inner}</Link>
                : <button key={t.key} type="button" className="qcCard" style={style} onClick={() => setParams({ tool: t.key })}>{inner}</button>;
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
