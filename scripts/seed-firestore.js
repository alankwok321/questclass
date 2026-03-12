const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const projectId = process.env.FIREBASE_PROJECT_ID;
const dataPath = process.argv[2] || path.join(__dirname, '..', 'seeds', 'sample-firestore-data.json');

if (!projectId) {
  console.error('Missing FIREBASE_PROJECT_ID');
  process.exit(1);
}

if (!fs.existsSync(dataPath)) {
  console.error(`Seed file not found: ${dataPath}`);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId
});

const db = admin.firestore();
const seed = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

function convertSpecialValues(value) {
  if (Array.isArray(value)) return value.map(convertSpecialValues);
  if (value && typeof value === 'object') {
    if (value.__type === 'serverTimestamp') return admin.firestore.FieldValue.serverTimestamp();
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, convertSpecialValues(entry)]));
  }
  return value;
}

async function writeCollection(collectionName, docs = {}) {
  const entries = Object.entries(docs);
  for (const [docId, payload] of entries) {
    await db.collection(collectionName).doc(docId).set(convertSpecialValues(payload), { merge: true });
    console.log(`seeded ${collectionName}/${docId}`);
  }
}

async function main() {
  await writeCollection('classrooms', seed.classrooms);
  await writeCollection('students', seed.students);
  await writeCollection('progressSummaries', seed.progressSummaries);
  await writeCollection('submissions', seed.submissions);
  await writeCollection('users', seed.users || {});
  console.log('✅ Firestore seed complete');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
