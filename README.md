# QuestClass v2.1 Firebase Edition

QuestClass v2.1 is a Firebase-ready product skeleton for an AI learning OS.

## Included

- **Landing page** with product positioning
- **Auth skeleton** with demo/login tabs
- **Role-based app shell** for teacher and student views
- **Firebase-ready structure**
- **Firestore security rules**
- **Firebase hosting config**
- **Teacher dashboard** with classroom and student management structure
- **Student home** with progression and task framing
- **AI tutor chat** with demo mode and live API mode
- **Lesson loop API** for assign → answer → grade → analyze → regenerate
- **Local persistence** for demo state
- **Vercel-ready deployment**

## Firebase files included

- `firebase.json`
- `.firebaserc`
- `firestore.rules`
- `firestore.indexes.json`
- `public/js/firebase-config.example.js`
- `public/js/firebase-bridge.js`
- `public/js/firebase-auth.example.js`

## Firebase setup

1. Create a Firebase project
2. Copy `public/js/firebase-config.example.js` to your actual runtime config flow
3. Replace the placeholder values with your Firebase web app config
4. Run Firebase login locally:

```bash
npx firebase-tools login
```

5. Set your project id in `.firebaserc`
6. Deploy rules / hosting if desired:

```bash
npx firebase-tools deploy
```

## Firestore model direction

Suggested collections:

- `users`
- `classrooms`
- `classrooms/{classroomId}/members`
- `units`
- `assignments`
- `submissions`
- `aiRuns`

## Run locally

```bash
npm install
npm start
```

Default port: `18890`

## Optional live AI config

- `OPENROUTER_API_KEY` or `OPENAI_API_KEY`
- `OPENROUTER_BASE_URL` or `OPENAI_BASE_URL`
- `AI_MODEL`

## Deploy

For Vercel:

```bash
vercel --prod
```

For Firebase:

```bash
npx firebase-tools deploy
```
