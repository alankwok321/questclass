# QuestClass v2.2 Firebase / Vercel Productization

QuestClass is now a more production-shaped Firebase-ready skeleton for an AI learning OS, while still staying compatible with the existing Express + Vercel deployment model.

## What changed

- **Firebase config is no longer hardcoded in a public file**
  - `/js/firebase-config.js` is now served dynamically by `server.js`
  - `/api/runtime-config` exposes the same runtime config as JSON
  - The browser reads Firebase config from **server env vars** instead of a committed public config blob
- **Visible auth UI added across pages**
  - Google login button
  - logout button
  - optional email/password login form (if enabled in Firebase Auth)
- **Firestore-backed profile flow improved**
  - signed-in users get a profile form
  - current Firestore role is shown clearly
  - users can update display name, learner stage, role note, and `requestedRole`
- **Basic admin role management path added**
  - if a signed-in user's Firestore profile has `role = admin`, they can list users and update another user's role in-app
- **Firestore rules tightened**
  - users can read their own profile docs
  - admins can read / manage all user profiles
  - normal users cannot self-promote their `role`
  - submission reads are narrowed to teacher/admin or the owning student
- **Express/Vercel compatibility kept**
  - same `server.js` app entry
  - same `/api/chat` and `/api/teacher/lesson-loop`
  - static public assets still work as before

## Required Firebase env vars

Set these in Vercel or your server environment:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `FIREBASE_MEASUREMENT_ID` (optional)

## Included app surfaces

- Landing page
- Teacher dashboard
- Student home
- AI tutor chat
- Analytics page
- Shared auth/profile/admin panels

## Firestore model direction

Suggested collections:

- `users`
- `classrooms`
- `classrooms/{classroomId}/members`
- `units`
- `assignments`
- `submissions`
- `aiRuns`

## User profile shape

`users/{uid}` can now contain fields like:

- `name`
- `email`
- `role`
- `requestedRole`
- `learnerStage`
- `roleNote`
- `photoURL`
- `createdAt`
- `updatedAt`
- `lastLoginAt`

### Role flow

- New sign-ins default to `student` unless the email suggests `teacher`
- Users can set `requestedRole` in the app
- **Only admins** should directly change `role` to `teacher` / `admin`
- To bootstrap the first admin, set one user doc's `role` to `admin` manually in Firestore console

## Firebase setup

1. Create a Firebase project
2. Enable Authentication providers you want (Google, optionally Email/Password)
3. Set the `FIREBASE_*` env vars locally / in Vercel
4. Deploy Firestore rules:

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules
```

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

For Firebase rules:

```bash
npx firebase-tools deploy --only firestore:rules
```

## Known limitations

- The app still uses client-side Firebase SDK only; there is **no server-side admin API** yet
- Bootstrapping the very first admin still requires a manual Firestore console edit
- Email/password login UI is present, but the provider must be enabled in Firebase Auth to work
