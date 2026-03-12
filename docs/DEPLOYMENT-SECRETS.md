# QuestClass secrets & deployment notes

## What goes where

### Browser/runtime Firebase config
These values are **public web app config**, not admin secrets:
- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `FIREBASE_MEASUREMENT_ID`

The server exposes them through `/api/runtime-config` and `/js/firebase-config.js` so the browser can initialize Firebase.

### Private admin credentials
For seeding Firestore or other admin scripts, use a **service account JSON** only on trusted machines.

Required env for admin seed:
- `FIREBASE_PROJECT_ID=questclass-8462a`
- `GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json`

Run:

```bash
cd /home/node/.openclaw/workspace/teaching-app
npm run seed:firestore
```

## Security rules

- Never paste service account JSON into chat again unless absolutely necessary.
- Never commit service account files to git.
- Keep service account files outside the repo when possible.
- If a key was exposed in chat or logs, rotate it in Google Cloud IAM immediately.

## Vercel setup

Set these as project environment variables in Vercel:
- all `FIREBASE_*` web config values
- optional AI provider values (`OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `AI_MODEL`)

Do **not** put admin service account JSON into browser-exposed env vars.

## Recommended operational model

- Browser app uses Firebase Web SDK + Firestore rules
- Admin scripts use a service account locally/CI only
- Seed data lives in `seeds/sample-firestore-data.json`
- One-off seeding should delete any temporary credential file after use
