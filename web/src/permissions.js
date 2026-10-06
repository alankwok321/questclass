// Which roles may open which page. This is the single source of truth for
// the sidebar, the route guards and the 角色權限 chart in the design canvas.
// Data access is enforced separately by firestore.rules.

export const ROLES = ['admin', 'teacher', 'student', 'parent'];

export const ROLE_LABELS = {
  admin: '管理員',
  teacher: '老師',
  student: '學生',
  parent: '家長',
};

const STAFF = ['admin', 'teacher'];

// Longest matching prefix wins, so '/teacher-homework' is checked before '/teacher'.
export const PAGE_ACCESS = [
  { path: '/dashboard', roles: STAFF },
  { path: '/classroom', roles: STAFF },
  { path: '/assignments', roles: STAFF },
  { path: '/progress', roles: STAFF },
  { path: '/reports', roles: STAFF },
  { path: '/parents', roles: STAFF },
  { path: '/teacher-homework', roles: STAFF },
  { path: '/teacher-question-bank', roles: STAFF },
  { path: '/teacher', roles: STAFF },
  { path: '/analytics', roles: ['admin'] },
  { path: '/student-homework', roles: ['admin', 'student'] },
  { path: '/parent', roles: ['admin', 'parent'] },
  { path: '/chat', roles: ['admin', 'teacher', 'student'] },
  { path: '/admin', roles: ['admin'] },
];

export function normalizeRole(role) {
  const r = String(role || '').trim().toLowerCase();
  return ROLES.includes(r) ? r : '';
}

function ruleFor(pathname) {
  const p = String(pathname || '/').replace(/\/+$/, '') || '/';
  return PAGE_ACCESS
    .filter((r) => p === r.path || p.startsWith(r.path + '/') || (r.path === '/teacher-homework' && p.startsWith('/teacher-homework')))
    .sort((a, b) => b.path.length - a.path.length)[0] || null;
}

export function canAccess(role, pathname) {
  const r = normalizeRole(role);
  if (!r) return false;
  const rule = ruleFor(pathname);
  if (!rule) return false; // unknown pages are closed by default
  return rule.roles.includes(r);
}

// Where each role lands after signing in (and where a blocked page sends them).
export function homePathFor(role) {
  switch (normalizeRole(role)) {
    case 'admin':
    case 'teacher':
      return '/dashboard';
    case 'student':
      return '/student-homework';
    case 'parent':
      return '/parent';
    default:
      return '/';
  }
}

export function isBlockedAccount(user) {
  const status = String(user?.accountStatus || user?.profile?.accountStatus || 'active').toLowerCase();
  return status === 'review' || status === 'suspended' ? status : '';
}
