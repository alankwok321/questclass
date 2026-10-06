// Excel → rows for /api/school/roster/import. Accepts Chinese or English column names.
const HEADERS = {
  email: ['電郵', '電子郵件', '電郵地址', 'email', 'e-mail', 'gmail', 'google 帳戶'],
  name: ['姓名', '名稱', '名字', 'name'],
  role: ['身分', '身份', '角色', 'role'],
  class: ['班別', '班級', '可教班別', '任教班別', 'class', 'classes'],
  children: ['子女電郵', '子女', 'children', 'child email', 'child emails'],
};
const ROLES = { student: 'student', teacher: 'teacher', parent: 'parent', admin: 'admin', '學生': 'student', '老師': 'teacher', '教師': 'teacher', '家長': 'parent', '管理員': 'admin' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const ROLE_LABEL = { student: '學生', teacher: '老師', parent: '家長', admin: '管理員' };

const key = (h) => {
  const k = String(h || '').trim().toLowerCase().replace(/[（(].*?[)）]/g, '').trim();
  return Object.keys(HEADERS).find((f) => HEADERS[f].includes(k)) || null;
};

/** json: rows from XLSX.utils.sheet_to_json(ws, { defval: '' }). Returns [{ line, email, name, role, class, children, error }] */
export function parseRosterRows(json) {
  return (Array.isArray(json) ? json : []).map((raw, i) => {
    const r = { line: i + 2 };
    Object.entries(raw || {}).forEach(([h, v]) => { const f = key(h); if (f && r[f] == null) r[f] = String(v ?? '').trim(); });
    return r;
  }).filter((r) => r.email || r.name).map((r) => {
    const email = String(r.email || '').toLowerCase();
    const roleKey = String(r.role || '學生').trim();
    const role = ROLES[roleKey.toLowerCase()] || ROLES[roleKey] || null;
    let error = '';
    if (!EMAIL_RE.test(email)) error = '電郵格式不正確';
    else if (!role) error = '身分必須是 學生／老師／家長／管理員';
    return { line: r.line, email, name: r.name || '', role: role || roleKey, class: r.class || '', children: r.children || '', error };
  }).map((r, i, all) => (!r.error && all.findIndex((x) => x.email === r.email) !== i ? { ...r, error: '重複的電郵' } : r));
}

export const TEMPLATE = [
  ['電郵', '姓名', '身分', '班別', '子女電郵'],
  ['chan.taiman@gmail.com', '陳大文', '學生', '5A', ''],
  ['wong.siuming@gmail.com', '黃小明', '學生', '5B', ''],
  ['teacher.lee@gmail.com', '李老師', '老師', '5A, 5B', ''],
  ['parent.chan@gmail.com', '陳太', '家長', '', 'chan.taiman@gmail.com'],
];
