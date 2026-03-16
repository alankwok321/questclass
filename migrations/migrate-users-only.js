// Admin SDK migration: merge students/* + progressSummaries/* into users/{uid}.studentProfile
// Usage (locally):
//   node migrations/migrate-users-only.js
// Env:
//   FIREBASE_SERVICE_ACCOUNT_JSON (stringified JSON)
//   FIREBASE_PROJECT_ID

import admin from 'firebase-admin';

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function init() {
  const sa = JSON.parse(requireEnv('FIREBASE_SERVICE_ACCOUNT_JSON'));
  admin.initializeApp({ credential: admin.credential.cert(sa) });
  return admin.firestore();
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && obj[k] !== undefined) out[k] = obj[k];
  return out;
}

async function main() {
  const db = init();

  const studentsSnap = await db.collection('students').get();
  let merged = 0;
  let skipped = 0;

  for (const doc of studentsSnap.docs) {
    const s = doc.data() || {};
    const uid = String(s.userUid || '').trim();
    if (!uid) { skipped++; continue; }

    const sumSnap = await db.collection('progressSummaries').doc(doc.id).get();
    const summary = sumSnap.exists ? (sumSnap.data() || {}) : {};

    const studentProfile = {
      ...pick(s, [
        'gradeLevel','status','currentLevel','xp','nextLevelXp','streak','mastery',
        'weaknessLabel','weaknessScore','focusSkills'
      ]),
      ...pick(summary, ['focusAreas','recentQuestTitles']),
      migratedFrom: { studentId: doc.id, at: new Date().toISOString() }
    };

    await db.collection('users').doc(uid).set({
      role: 'student',
      classroomIds: Array.isArray(s.classroomIds) ? s.classroomIds : [],
      studentProfile,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    merged++;
  }

  console.log(JSON.stringify({ ok: true, merged, skipped }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
