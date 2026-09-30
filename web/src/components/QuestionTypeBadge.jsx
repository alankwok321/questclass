import React from 'react';
import {
  CheckCircle2,
  HelpCircle,
  AlignLeft,
  List as ListIcon,
  ToggleLeft,
  ArrowRightLeft,
  BookOpen,
  Circle,
} from 'lucide-react';

export function getTypeIcon(type) {
  switch (String(type || '').toUpperCase()) {
    case 'TRUE_FALSE':
      return <ToggleLeft className="w-4 h-4" />;
    case 'MULTIPLE_CHOICE':
      return <ListIcon className="w-4 h-4" />;
    case 'FILL_IN_BLANK':
      return <HelpCircle className="w-4 h-4" />;
    case 'MATCHING':
      return <ArrowRightLeft className="w-4 h-4" />;
    case 'SHORT_ANSWER':
      return <AlignLeft className="w-4 h-4" />;
    case 'LONG_ANSWER':
      return <BookOpen className="w-4 h-4" />;
    default:
      return <Circle className="w-4 h-4" />;
  }
}

export function formatTypeLabel(type) {
  const t = String(type || '').toUpperCase();
  const labels = {
    TRUE_FALSE: '是非題',
    MULTIPLE_CHOICE: '選擇題',
    FILL_IN_BLANK: '填空題',
    MATCHING: '配對題',
    SHORT_ANSWER: '簡答題',
    LONG_ANSWER: '申論題',
  };
  return labels[t] || t || '—';
}

// Tinted badge colours per question type (text colours meet 4.5:1 on their tint).
const TYPE_COLORS = {
  MULTIPLE_CHOICE: { bg: '#E8F0FC', fg: '#0058B0' },
  TRUE_FALSE: { bg: '#E3F5E8', fg: '#1E7B34' },
  FILL_IN_BLANK: { bg: '#FFF1E0', fg: '#A45200' },
  SHORT_ANSWER: { bg: '#EFEAFD', fg: '#5B3FC4' },
  LONG_ANSWER: { bg: '#FCE8F1', fg: '#A3245E' },
  MATCHING: { bg: '#E0F4F5', fg: '#0B6E75' },
};

export function getTypeColors(type) {
  return TYPE_COLORS[String(type || '').toUpperCase()] || { bg: '#F2F2F5', fg: '#3A3A3C' };
}

export default function QuestionTypeBadge({ type }) {
  const c = getTypeColors(type);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 9px',
        borderRadius: 6,
        background: c.bg,
        color: c.fg,
        fontWeight: 600,
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      {getTypeIcon(type)}
      {formatTypeLabel(type)}
    </span>
  );
}

export { CheckCircle2 };
