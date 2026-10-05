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
- optional fallback AI provider values (`OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `AI_MODEL`), used only
  when no key has been saved on the 「AI 設定」 page
- `FIREBASE_SERVICE_ACCOUNT_JSON`: the service-account JSON on one line. The server needs it to
  store the school AI key and run the admin tools. It is a server-only variable, never sent to the browser.
- `ADMIN_EMAILS`: comma-separated Google accounts that become admin when they sign in
  (e.g. `danielkwok.ai@gmail.com`). Needs `FIREBASE_SERVICE_ACCOUNT_JSON`.
- `AI_CONFIG_ENCRYPTION_KEY`: any long random string; encrypts the AI key saved on the 「AI 設定」 page.
  Without it the page cannot save a key. Changing it later makes the saved key unreadable (save it again).

### AI key
There is one AI key for the whole school. Only an admin sets it, on **管理後台 → AI 設定**
(`/admin/ai-settings`). It is stored encrypted in Firestore at `appSettings/ai`, which browsers
cannot read (Firestore rules deny it by default); the server reads it with the Admin SDK.
Teachers, students and parents have no key settings, and any key a browser sends is ignored.
If no key is saved, the server falls back to `OPENROUTER_API_KEY`. When Firebase is configured,
only signed-in, active users can use AI.

### Firestore rules
`firestore.rules` is not deployed by Vercel. After changing it run
`firebase deploy --only firestore:rules`, or paste it into Firebase console → Firestore → Rules.

Do **not** put admin service account JSON into browser-exposed env vars.

## Recommended operational model

- Browser app uses Firebase Web SDK + Firestore rules
- Admin scripts use a service account locally/CI only
- Seed data lives in `seeds/sample-firestore-data.json`
- One-off seeding should delete any temporary credential file after use
