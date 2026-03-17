/*
Reset Question Bank (DANGEROUS)

- Deletes ALL documents in Firestore collection: questionBank
- Inserts sample questions in the "new format" (UI-aligned schema)

Usage:
  1) Create a Firebase service account key JSON for project questclass-8462a
     Firebase Console -> Project settings -> Service accounts -> Generate new private key

  2) Export credentials path:
       export GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/serviceAccount.json"

  3) Install deps (if needed):
       npm install

  4) Dry run:
       node scripts/reset-questionbank.js --dry

  5) Execute:
       node scripts/reset-questionbank.js --yes

Options:
  --dry   : show what would happen, no writes/deletes
  --yes   : required to actually delete/write
  --limit : batch delete size (default 200)

Notes:
- This does NOT update homeworkAssignments.questionRefs; assignments may break.
- Consider archiving instead of deleting if you need auditability.
*/

const admin = require('firebase-admin');

const argv = process.argv.slice(2);
const isDry = argv.includes('--dry');
const isYes = argv.includes('--yes');
const limitArg = argv.find((a) => a.startsWith('--limit='));
const BATCH_LIMIT = limitArg ? Number(limitArg.split('=')[1]) : 200;

const SAMPLE_QUESTIONS = [
  {
    type: 'TRUE_FALSE',
    topic: '地理',
    points: 1.0,
    timeLimitSec: 20,
    question_text: '澳洲的首都是雪梨。',
    correct_answer: false,
  },
  {
    type: 'MULTIPLE_CHOICE',
    topic: '科學',
    points: 1.0,
    timeLimitSec: 20,
    question_text: '哪顆行星被稱為紅色星球？',
    options: [
      { id: 'A', text: '地球', is_correct: false },
      { id: 'B', text: '火星', is_correct: true },
      { id: 'C', text: '木星', is_correct: false },
      { id: 'D', text: '金星', is_correct: false },
    ],
  },
  {
    type: 'FILL_IN_BLANK',
    topic: '化學',
    points: 2.0,
    timeLimitSec: 60,
    question_text: '金的化學符號是 [____]，銀是 [____]。',
    blanks: [
      { position: 1, accepted: ['Au', 'au'] },
      { position: 2, accepted: ['Ag', 'ag'] },
    ],
  },
  {
    type: 'MATCHING',
    topic: '生物',
    points: 3.0,
    timeLimitSec: 90,
    question_text: '將細胞器與其主要功能配對。',
    pairs: [
      { prompt: '粒線體', match: '產生能量' },
      { prompt: '核糖體', match: '蛋白質合成' },
      { prompt: '細胞核', match: '儲存 DNA' },
    ],
  },
  {
    type: 'SHORT_ANSWER',
    topic: '歷史',
    points: 1.0,
    timeLimitSec: 30,
    question_text: '第二次世界大戰在哪一年結束？',
    ideal_answer: '1945',
    max_word_count: 10,
  },
  {
    type: 'LONG_ANSWER',
    topic: '文學',
    points: 5.0,
    timeLimitSec: 300,
    question_text: '分析《羅密歐與茱麗葉》的主題。',
    grading_rubric: '需提及：愛、衝突、命運。至少 2 個引用。',
    max_word_count: 500,
  },
];

function parseEnvOrDie() {
  // With GOOGLE_APPLICATION_CREDENTIALS set, initializeApp() works without args.
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credPath) {
    throw new Error('Missing GOOGLE_APPLICATION_CREDENTIALS env var (path to service account JSON).');
  }
}

async function init() {
  parseEnvOrDie();
  admin.initializeApp();
  return admin.firestore();
}

async function countCollection(db, colName) {
  // Cheap-ish count by paging.
  let count = 0;
  let last = null;
  while (true) {
    let q = db.collection(colName).orderBy(admin.firestore.FieldPath.documentId()).limit(1000);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    count += snap.size;
    if (snap.size < 1000) break;
    last = snap.docs[snap.docs.length - 1];
  }
  return count;
}

async function deleteAllDocs(db, colName) {
  let deleted = 0;
  while (true) {
    const snap = await db
      .collection(colName)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(BATCH_LIMIT)
      .get();

    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;
    process.stdout.write(`Deleted ${deleted}\n`);
  }
  return deleted;
}

async function insertSamples(db) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const uid = 'seed-script';

  let created = 0;
  const batch = db.batch();

  // IMPORTANT: Because user asked for "all classrooms", but sample questions need classroomId,
  // we insert them with classroomId = 'global'. If you want per-classroom samples, rerun with
  // edits to assign correct classroomIds.
  const classroomId = 'global';

  SAMPLE_QUESTIONS.forEach((q) => {
    const ref = db.collection('questionBank').doc();
    batch.set(ref, {
      id: ref.id,
      classroomId,
      ...q,
      media: q.media || {},
      tags: q.tags || [],
      difficulty: q.difficulty || 1,
      createdBy: uid,
      createdAt: now,
      updatedAt: now,

      // aliases for compatibility
      prompt: q.question_text,
      choices: q.options || [],
      correctChoiceIds: Array.isArray(q.options)
        ? q.options.filter((o) => o.is_correct).map((o) => o.id)
        : [],
    });
    created += 1;
  });

  await batch.commit();
  return created;
}

async function main() {
  const db = await init();

  const before = await countCollection(db, 'questionBank');
  console.log(`[questionBank] current docs: ${before}`);
  console.log(`Mode: ${isDry ? 'DRY' : 'LIVE'}  (use --yes to execute)`);

  if (!isYes) {
    console.log('Refusing to run without --yes');
    process.exit(2);
  }

  if (isDry) {
    console.log(`[DRY] Would delete all questionBank docs, then insert ${SAMPLE_QUESTIONS.length} samples.`);
    process.exit(0);
  }

  console.log('Deleting ALL questionBank docs...');
  const deleted = await deleteAllDocs(db, 'questionBank');
  console.log(`Deleted ${deleted}`);

  console.log('Inserting sample questions (classroomId="global")...');
  const created = await insertSamples(db);
  console.log(`Inserted ${created}`);

  const after = await countCollection(db, 'questionBank');
  console.log(`[questionBank] docs after: ${after}`);

  console.log('DONE');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
