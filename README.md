# QuestClass v2.3 Student Database v1

QuestClass now has a real Firestore-backed student data layer for the main teacher/student flows, while keeping the existing Express + Vercel shape and the current auth/admin path.

## What changed in v1

### Real Firestore data model added
Collections now used/documented for v1:
- `users`
- `students`
- `classrooms`
- `submissions`
- `progressSummaries`

Schema reference:
- `docs/firestore-schema-v1.md`

### Teacher page now reads Firestore data
When a signed-in `teacher` or `admin` has matching classroom/student documents:
- classroom switcher reads from `classrooms`
- student cards read from `students`
- summary/mastery data reads from `progressSummaries`
- recent submission context reads from `submissions`
- top metrics are calculated from Firestore data

If Firebase is missing or no matching Firestore data exists, the page still falls back to demo mode.

### Student page now reads Firestore data
When a signed-in `student` has a `students` doc linked by `userUid`:
- hero/progress stats read from `students` + `progressSummaries`
- recent tasks read from `submissions`
- classroom list reads from visible `classrooms`

### Auth/admin flow kept working
Still supported:
- runtime Firebase config via `/js/firebase-config.js`
- Google sign-in
- Firestore-backed user profiles in `users`
- admin account listing + role/status updates

### Firestore rules updated
Rules now explicitly cover:
- `users`
- `students`
- `classrooms`
- `submissions`
- `progressSummaries`

## Required Firebase env vars

Set these in Vercel or your server environment:
- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `FIREBASE_MEASUREMENT_ID` (optional)

## Local run

```bash
npm install
npm start
```

Default port: `18890`

## Firestore rules deploy

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules
```

## Seed sample data

A sample Firestore dataset is included:
- `seeds/sample-firestore-data.json`

Seed script:
- `scripts/seed-firestore.js`

Run it with Google Application Default Credentials available:

```bash
export FIREBASE_PROJECT_ID=your-project-id
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
npm run seed:firestore
```

You can also pass a custom JSON path:

```bash
node scripts/seed-firestore.js ./seeds/sample-firestore-data.json
```

## How to map real users to the sample model

The sample seed uses placeholder UIDs like:
- `teacher_demo_uid`
- `student_ada_uid`

For real testing, replace those with actual Firebase Auth user UIDs in:
- `users`
- `students.userUid`
- `classrooms.teacherUid`
- `classrooms.teacherUids[]`
- `classrooms.studentUids[]`
- `submissions.studentUid`
- `progressSummaries.userUid`

## What remains demo in v1

Still demo/static:
- analytics page visualizations
- AI chat content unless you provide an LLM API key
- lesson-loop content unless you provide an LLM API key
- landing-page roadmap/marketing copy
- no teacher-side create/edit UI yet for classrooms/students/submissions
- no server-side admin API; data access is still client-side Firebase SDK + Firestore rules

## Notes / limitations

- First admin bootstrap still requires manually setting one `users/{uid}.role = admin`.
- Teacher/student Firestore loading assumes a simple v1 model:
  - teacher dashboards find classrooms by `teacherUid` / `teacherUids`
  - student dashboards find the learner via `students.userUid == auth.uid`
  - progress summary doc id matches `studentId`
- Queries are intentionally simple to preserve browser-only Firebase compatibility and avoid extra backend work for this v1.

## Deploy

For Vercel:

```bash
vercel --prod
```

For Firestore rules:

```bash
npx firebase-tools deploy --only firestore:rules
```
