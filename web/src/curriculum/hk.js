// Hong Kong school curriculum, for tagging questions by subject and curriculum unit (課題).
// Mathematics units follow the CDC Mathematics curricula (2017): Primary strands, Secondary 1–3
// learning units, Senior Secondary Compulsory Part, Extended Part Module 1 and Module 2.
// Other subjects: DSE compulsory/elective topics where useful; the rest are subject-only.
//
// Stored on a question as tags: "subj:MATH" and "unit:MATH.J25" (a question may have neither).

// stage: P = P1–P6, J = S1–S3, S = S4–S6
export const LEVELS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'];
export const stageOf = (level) => {
  const l = String(level || '').toUpperCase();
  if (/^P[1-6]$/.test(l)) return 'P';
  if (/^S[1-3]$/.test(l)) return 'J';
  if (/^S[4-6]$/.test(l)) return 'S';
  return '';
};

export const SUBJECTS = [
  { key: 'MATH', zh: '數學', en: 'Mathematics', stages: 'PJS' },
  { key: 'CHI', zh: '中國語文', en: 'Chinese Language', stages: 'PJS' },
  { key: 'ENG', zh: '英國語文', en: 'English Language', stages: 'PJS' },
  { key: 'GS', zh: '常識', en: 'General Studies', stages: 'P' },
  { key: 'HUMP', zh: '人文科', en: 'Humanities (Primary)', stages: 'P' },
  { key: 'SCIP', zh: '科學科（小學）', en: 'Science (Primary)', stages: 'P' },
  { key: 'SCI', zh: '科學', en: 'Science (S1–S3)', stages: 'J' },
  { key: 'CHIST', zh: '中國歷史', en: 'Chinese History', stages: 'JS' },
  { key: 'HIST', zh: '歷史', en: 'History', stages: 'JS' },
  { key: 'GEOG', zh: '地理', en: 'Geography', stages: 'JS' },
  { key: 'LIFE', zh: '生活與社會', en: 'Life and Society', stages: 'J' },
  { key: 'CSD', zh: '公民與社會發展', en: 'Citizenship and Social Development', stages: 'S' },
  { key: 'PHY', zh: '物理', en: 'Physics', stages: 'S' },
  { key: 'CHEM', zh: '化學', en: 'Chemistry', stages: 'S' },
  { key: 'BIO', zh: '生物', en: 'Biology', stages: 'S' },
  { key: 'ICT', zh: '資訊及通訊科技', en: 'ICT', stages: 'JS' },
  { key: 'ECON', zh: '經濟', en: 'Economics', stages: 'S' },
  { key: 'BAFS', zh: '企業、會計與財務概論', en: 'BAFS', stages: 'S' },
  { key: 'VA', zh: '視覺藝術', en: 'Visual Arts', stages: 'PJS' },
  { key: 'MUS', zh: '音樂', en: 'Music', stages: 'PJS' },
  { key: 'PE', zh: '體育', en: 'Physical Education', stages: 'PJS' },
  { key: 'OTHER', zh: '其他', en: 'Other', stages: 'PJS' },
];

const U = (key, stage, group, zh, en) => ({ key, stage, group, zh, en });

// ── Mathematics ───────────────────────────────────────────────────────────────
const MATH = [
  U('MATH.PN', 'P', '小學', '數', 'Number'),
  U('MATH.PM', 'P', '小學', '度量', 'Measures'),
  U('MATH.PS', 'P', '小學', '圖形與空間', 'Shape and Space'),
  U('MATH.PD', 'P', '小學', '數據處理', 'Data Handling'),
  U('MATH.PA', 'P', '小學', '代數', 'Algebra'),

  ...[
    ['基礎計算', 'Basic computation'], ['有向數', 'Directed numbers'], ['近似值與數值估算', 'Approximate values and numerical estimation'],
    ['有理數和無理數', 'Rational and irrational numbers'], ['百分數的應用', 'Using percentages'], ['率、比和比例', 'Rates, ratios and proportions'],
    ['代數式', 'Algebraic expressions'], ['一元一次方程', 'Linear equations in one unknown'], ['二元一次方程', 'Linear equations in two unknowns'],
    ['整數指數律', 'Laws of integral indices'], ['多項式', 'Polynomials'], ['恆等式', 'Identities'], ['公式', 'Formulae'],
    ['一元一次不等式', 'Linear inequalities in one unknown'],
  ].map(([zh, en], i) => U(`MATH.J${i + 1}`, 'J', '初中：數與代數', zh, en)),
  ...[
    ['度量的誤差', 'Errors in measurement'], ['弧長和扇形面積', 'Arc lengths and areas of sectors'], ['立體圖形', '3-D figures'],
    ['求積法', 'Mensuration'], ['角和平行線', 'Angles and parallel lines'], ['多邊形', 'Polygons'], ['全等三角形', 'Congruent triangles'],
    ['相似三角形', 'Similar triangles'], ['四邊形', 'Quadrilaterals'], ['三角形的心', 'Centres of triangles'], ['畢氏定理', "Pythagoras' theorem"],
    ['直角坐標系統', 'Rectangular coordinate system'], ['三角學', 'Trigonometry'],
  ].map(([zh, en], i) => U(`MATH.J${i + 15}`, 'J', '初中：度量、圖形與空間', zh, en)),
  ...[
    ['數據的整理', 'Organisation of data'], ['數據的表達', 'Presentation of data'], ['集中趨勢的量度', 'Measures of central tendency'], ['概率', 'Probability'],
  ].map(([zh, en], i) => U(`MATH.J${i + 28}`, 'J', '初中：數據處理', zh, en)),
  U('MATH.J32', 'J', '初中：數據處理', '探究及研習', 'Inquiry and investigation'),

  ...[
    ['一元二次方程', 'Quadratic equations in one unknown'], ['函數及其圖像', 'Functions and graphs'], ['指數函數與對數函數', 'Exponential and logarithmic functions'],
    ['續多項式', 'More about polynomials'], ['續方程', 'More about equations'], ['變分', 'Variations'],
    ['等差數列與等比數列及其求和法', 'Arithmetic and geometric sequences and their summations'], ['不等式及線性規劃', 'Inequalities and linear programming'],
    ['續函數圖像', 'More about graphs of functions'],
  ].map(([zh, en], i) => U(`MATH.S${i + 1}`, 'S', '必修部分：數與代數', zh, en)),
  ...[
    ['直線的方程', 'Equations of straight lines'], ['圓的基本性質', 'Basic properties of circles'], ['軌跡', 'Loci'], ['圓的方程', 'Equations of circles'], ['續三角學', 'More about trigonometry'],
  ].map(([zh, en], i) => U(`MATH.S${i + 10}`, 'S', '必修部分：度量、圖形與空間', zh, en)),
  ...[
    ['排列與組合', 'Permutations and combinations'], ['續概率', 'More about probability'], ['離差的量度', 'Measures of dispersion'], ['統計的應用及誤用', 'Uses and abuses of statistics'],
  ].map(([zh, en], i) => U(`MATH.S${i + 15}`, 'S', '必修部分：數據處理', zh, en)),
  U('MATH.S19', 'S', '必修部分：數據處理', '進一步應用', 'Further applications'),

  ...[
    ['二項展開式', 'Binomial expansion'], ['指數函數與對數函數', 'Exponential and logarithmic functions'],
    ['函數的導數', 'Derivative of a function'], ['函數的求導法', 'Differentiation of a function'], ['二階導數', 'Second derivative'],
    ['求導法的應用', 'Applications of differentiation'], ['不定積分法及其應用', 'Indefinite integration and its applications'],
    ['定積分法及其應用', 'Definite integration and its applications'], ['以梯形法則求定積分的近似值', 'Approximation of definite integrals using the trapezoidal rule'],
    ['條件概率與貝葉斯定理', "Conditional probability and Bayes' theorem"], ['離散隨機變量', 'Discrete random variables'],
    ['概率分佈、期望值與方差', 'Probability distribution, expectation and variance'], ['二項分佈', 'The binomial distribution'], ['泊松分佈', 'The Poisson distribution'],
    ['二項分佈及泊松分佈的應用', 'Applications of the binomial and the Poisson distributions'], ['正態分佈的基本定義及性質', 'Basic definition and properties of the normal distribution'],
    ['正態變量的標準化及標準正態分佈表', 'Standardisation of a normal variable and use of the standard normal table'], ['正態分佈的應用', 'Applications of the normal distribution'],
    ['抽樣分佈及點估計', 'Sampling distribution and point estimates'], ['總體平均值的置信區間', 'Confidence interval for a population mean'],
  ].map(([zh, en], i) => U(`MATH.M1-${i + 1}`, 'S', '延伸部分 M1（微積分與統計）', zh, en)),
  ...[
    ['奇函數與偶函數', 'Odd and even functions'], ['數學歸納法', 'Mathematical induction'], ['二項式定理', 'The binomial theorem'],
    ['續三角函數', 'More about trigonometric functions'], ['e 的簡介', 'Introduction to e'], ['極限', 'Limits'], ['求導法', 'Differentiation'],
    ['求導法的應用', 'Applications of differentiation'], ['不定積分法及其應用', 'Indefinite integration and its applications'], ['定積分法', 'Definite integration'],
    ['定積分法的應用', 'Applications of definite integration'], ['行列式', 'Determinants'], ['矩陣', 'Matrices'], ['線性方程組', 'Systems of linear equations'],
    ['向量的簡介', 'Introduction to vectors'], ['純量積與向量積', 'Scalar product and vector product'], ['向量的應用', 'Applications of vectors'],
  ].map(([zh, en], i) => U(`MATH.M2-${i + 1}`, 'S', '延伸部分 M2（代數與微積分）', zh, en)),
];

// ── Languages: skill strands ──────────────────────────────────────────────────
const CHI = [['READ', '閱讀', 'Reading'], ['WRITE', '寫作', 'Writing'], ['LISTEN', '聆聽', 'Listening'], ['SPEAK', '說話', 'Speaking'],
  ['LIT', '文學', 'Literature'], ['CULT', '中華文化', 'Chinese culture'], ['LANG', '語文知識', 'Language knowledge']]
  .map(([k, zh, en]) => U(`CHI.${k}`, 'PJS', '範疇', zh, en));
const ENG = [['READ', '閱讀', 'Reading'], ['WRITE', '寫作', 'Writing'], ['LISTEN', '聆聽', 'Listening'], ['SPEAK', '說話', 'Speaking'],
  ['GRAM', '語法', 'Grammar'], ['VOCAB', '詞彙', 'Vocabulary']]
  .map(([k, zh, en]) => U(`ENG.${k}`, 'PJS', 'Strands', zh, en));

// ── Senior secondary electives (DSE) ──────────────────────────────────────────
const topics = (subj, rows) => rows.map(([zh, en, group = '必修部分'], i) => U(`${subj}.${i + 1}`, 'S', group, zh, en));
const PHY = topics('PHY', [
  ['熱和氣體', 'Heat and Gases'], ['力和運動', 'Force and Motion'], ['波動', 'Wave Motion'], ['電和磁', 'Electricity and Magnetism'],
  ['放射現象和核能', 'Radioactivity and Nuclear Energy'],
  ['天文學和航天科學', 'Astronomy and Space Science', '選修部分'], ['原子世界', 'Atomic World', '選修部分'],
  ['能量和能源的使用', 'Energy and Use of Energy', '選修部分'], ['醫學物理學', 'Medical Physics', '選修部分'],
]);
const CHEM = topics('CHEM', [
  ['地球', 'Planet Earth'], ['微觀世界 I', 'Microscopic World I'], ['金屬', 'Metals'], ['酸和鹽基', 'Acids and Bases'],
  ['化石燃料和碳化合物', 'Fossil Fuels and Carbon Compounds'], ['微觀世界 II', 'Microscopic World II'],
  ['氧化還原反應、化學電池和電解', 'Redox Reactions, Chemical Cells and Electrolysis'], ['化學反應和能量', 'Chemical Reactions and Energy'],
  ['反應速率', 'Rate of Reaction'], ['化學平衡', 'Chemical Equilibrium'], ['碳化合物的化學', 'Chemistry of Carbon Compounds'],
  ['化學世界中的規律', 'Patterns in the Chemical World'],
  ['工業化學', 'Industrial Chemistry', '選修部分'], ['物料化學', 'Materials Chemistry', '選修部分'], ['分析化學', 'Analytical Chemistry', '選修部分'],
]);
const BIO = topics('BIO', [
  ['細胞與生命分子', 'Cells and Molecules of Life'], ['遺傳與進化', 'Genetics and Evolution'], ['生物與環境', 'Organisms and Environment'],
  ['健康與疾病', 'Health and Diseases'],
  ['人體生理學：調節與控制', 'Human Physiology: Regulation and Control', '選修部分'], ['應用生態學', 'Applied Ecology', '選修部分'],
  ['微生物與人類', 'Microorganisms and Humans', '選修部分'], ['生物工程', 'Biotechnology', '選修部分'],
]);
const ICT = topics('ICT', [
  ['資訊處理', 'Information Processing'], ['電腦系統基礎', 'Computer System Fundamentals'], ['互聯網及其應用', 'Internet and its Applications'],
  ['計算思維與程式編寫', 'Computational Thinking and Programming'], ['資訊及通訊科技對社會的影響', 'Social Implications'],
  ['數據庫', 'Databases', '選修部分'], ['數據通訊及建網', 'Data Communications and Networking', '選修部分'],
  ['多媒體製作及網站建構', 'Multimedia Production and Website Development', '選修部分'], ['軟件開發', 'Software Development', '選修部分'],
]);
const CSD = topics('CSD', [
  ['「一國兩制」下的香港', 'Hong Kong under "One Country, Two Systems"'], ['改革開放以來的國家', 'Our Country since Reform and Opening-up'],
  ['互聯相依的當代世界', 'Interconnectedness and Interdependence of the Contemporary World'],
]);
const ECON = topics('ECON', [
  ['基本經濟概念', 'Basic Economic Concepts'], ['廠商與生產', 'Firms and Production'], ['市場與價格', 'Market and Price'],
  ['競爭與市場結構', 'Competition and Market Structures'], ['效率、公平和政府的角色', 'Efficiency, Equity and the Role of Government'],
  ['經濟表現的量度', 'Measurement of Economic Performance'], ['國民收入決定及價格水平', 'National Income Determination and Price Level'],
  ['貨幣與銀行', 'Money and Banking'], ['宏觀經濟問題和政策', 'Macroeconomic Problems and Policies'], ['國際貿易和金融', 'International Trade and Finance'],
]);

const UNITS = { MATH, CHI, ENG, PHY, CHEM, BIO, ICT, CSD, ECON };
const ALL_UNITS = Object.values(UNITS).flat();
const UNIT_BY_KEY = new Map(ALL_UNITS.map((u) => [u.key, u]));

export const subjectInfo = (key) => SUBJECTS.find((s) => s.key === key) || null;
export const unitInfo = (key) => UNIT_BY_KEY.get(key) || null;

/** Units of a subject for a level ('' = every stage), in curriculum order. */
export function unitsFor(subject, level = '') {
  const list = UNITS[subject] || [];
  const st = stageOf(level);
  return st ? list.filter((u) => u.stage.includes(st)) : list;
}

/** Subjects offered at a level ('' = all). */
export function subjectsFor(level = '') {
  const st = stageOf(level);
  return st ? SUBJECTS.filter((s) => s.stages.includes(st)) : SUBJECTS;
}

export const unitLabel = (u, lang = 'zh') => {
  if (!u) return '';
  const n = /^MATH\.[JS]\d+$/.test(u.key) ? `${u.key.split('.')[1].slice(1)}. ` : /^MATH\.M[12]-/.test(u.key) ? `${u.key.slice(5, 7)}-${u.key.split('-')[1]}. ` : '';
  return lang === 'en' ? `${n}${u.en}` : `${n}${u.zh}`;
};

// ── tags on a question ────────────────────────────────────────────────────────
const tagsOf = (q) => (Array.isArray(q?.tags) ? q.tags.filter((t) => typeof t === 'string') : []);
export const questionSubject = (q) => (tagsOf(q).find((t) => t.startsWith('subj:')) || '').slice(5);
export const questionUnit = (q) => (tagsOf(q).find((t) => t.startsWith('unit:')) || '').slice(5);

/** Question with its subject / unit tags replaced (other tags kept). Empty = untagged. */
export function withCurriculum(q, { subject, unit } = {}) {
  const keep = tagsOf(q).filter((t) => !t.startsWith('subj:') && !t.startsWith('unit:'));
  const subj = subject ?? questionSubject(q);
  let u = unit ?? questionUnit(q);
  if (u && !u.startsWith(`${subj}.`)) u = ''; // a unit always belongs to the chosen subject
  return { ...q, tags: [...keep, ...(subj ? [`subj:${subj}`] : []), ...(u ? [`unit:${u}`] : [])] };
}

/** Find a subject from a key or a name (Excel import / AI output). */
export function matchSubject(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return '';
  const s = SUBJECTS.find((x) => x.key.toLowerCase() === t || x.zh === text.trim() || x.en.toLowerCase() === t
    || (t === 'maths' && x.key === 'MATH') || (t === 'math' && x.key === 'MATH'));
  return s ? s.key : '';
}

/** Find a unit from a key ("MATH.J25"), a number ("25"), or a name, within a subject. */
export function matchUnit(text, subject, level = '') {
  const raw = String(text || '').trim();
  if (!raw) return '';
  if (UNIT_BY_KEY.has(raw)) return raw;
  const list = subject ? unitsFor(subject, level) : ALL_UNITS;
  const t = raw.toLowerCase().replace(/^\d+[.、\s]*/, '').replace(/^m[12]-\d+[.\s]*/, '');
  const byName = list.find((u) => u.zh === t || u.en.toLowerCase() === t)
    || list.find((u) => t && (u.zh.includes(t) || t.includes(u.zh) || u.en.toLowerCase().includes(t)));
  if (byName) return byName.key;
  const num = raw.match(/^(\d+)/)?.[1];
  if (num && subject === 'MATH') {
    const st = stageOf(level) || 'J';
    const k = `MATH.${st === 'P' ? 'J' : st}${num}`;
    if (UNIT_BY_KEY.has(k)) return k;
  }
  return '';
}

// ── for the AI question generator ─────────────────────────────────────────────
export function loadLastSubject() {
  try { return window.localStorage?.getItem('qc_question_subject') || ''; } catch { return ''; }
}
export function saveLastSubject(subject) {
  try { window.localStorage?.setItem('qc_question_subject', subject || ''); } catch { /* not available */ }
}

/** Prompt lines telling the AI which subject/unit to write for, or to classify each question. */
export function curriculumPromptLines(subject, unit, level) {
  const s = subjectInfo(subject); const u = unitInfo(unit);
  if (s && u) return [`課程：所有題目都必須屬於香港${s.zh}課程的課題「${unitLabel(u)}」（${u.en}），內容和難度符合 ${level || ''} 程度。`];
  if (s) {
    const list = unitsFor(subject, level);
    if (!list.length) return [`科目：香港${s.zh}（${s.en}）課程。`];
    return [
      `科目：香港${s.zh}（${s.en}）課程。每題加上 "unit": 該題所屬課題的代號，只可從以下選擇；不屬於任何一個就寫 ""：`,
      list.map((x) => `${x.key}=${x.zh}`).join('；'),
    ];
  }
  return [`每題加上 "subject": 科目代號，只可從以下選擇；不確定就寫 ""：${SUBJECTS.map((x) => `${x.key}=${x.zh}`).join('；')}`];
}

/** Tag an AI-generated question: the teacher's choice wins, else what the AI said (if valid). */
export function tagAiQuestion(q, { subject = '', unit = '', level = '' } = {}) {
  const subj = subject || matchSubject(q.subject) || (unit ? unit.split('.')[0] : '') || (matchUnit(q.unit) ? matchUnit(q.unit).split('.')[0] : '');
  const un = unit || matchUnit(q.unit, subj, level) || matchUnit(q.unit, subj);
  const { subject: _s, unit: _u, ...rest } = q;
  return withCurriculum(rest, { subject: subj, unit: un });
}

// ── AI classification (used by the server) ────────────────────────────────────
// A question the AI has looked at carries this tag, even if it fitted no subject/unit,
// so the one-off pass over existing questions never repeats.
export const CLASSIFIED_TAG = 'cls:ai';
export const isClassified = (q) => (Array.isArray(q?.tags) ? q.tags : []).includes(CLASSIFIED_TAG);

/** Subject list + unit catalogue for the stages present (P/J/S), for the classifier prompt. */
export function classificationCatalogue(stages = 'PJS') {
  const lines = [`科目代號：${SUBJECTS.map((s) => `${s.key}=${s.zh}/${s.en}`).join('；')}`];
  const STAGE = { P: '小學 P1–P6', J: '初中 S1–S3', S: '高中 S4–S6' };
  for (const [subj, list] of Object.entries(UNITS)) {
    for (const st of 'PJS') {
      if (!stages.includes(st)) continue;
      const us = list.filter((u) => u.stage.includes(st));
      if (!us.length) continue;
      lines.push(`${subj} 課題（${STAGE[st]}）：${us.map((u) => `${u.key}=${u.zh}`).join('；')}`);
    }
  }
  return lines.join('\n');
}

/** Keep only a valid answer: a known subject, and a unit of that subject that fits the level. */
export function validClassification(subject, unit, level = '') {
  const s = matchSubject(subject) || (SUBJECTS.some((x) => x.key === subject) ? subject : '');
  let u = UNIT_BY_KEY.has(unit) ? unit : '';
  const subj = s || (u ? u.split('.')[0] : '');
  if (u && !u.startsWith(`${subj}.`)) u = '';
  const st = stageOf(level);
  if (u && st && !UNIT_BY_KEY.get(u).stage.includes(st)) u = '';
  return { subject: subj, unit: u };
}

/** Tags after classification: subject/unit replaced, marked as classified, other tags kept. */
export function classifiedTags(q, { subject, unit }) {
  const keep = (Array.isArray(q?.tags) ? q.tags : []).filter((t) => typeof t === 'string' && !t.startsWith('subj:') && !t.startsWith('unit:') && t !== CLASSIFIED_TAG);
  return [...keep, ...(subject ? [`subj:${subject}`] : []), ...(unit ? [`unit:${unit}`] : []), CLASSIFIED_TAG];
}
