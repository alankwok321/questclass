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

### Schools
Each school's data is separate: users, homework, answer keys, submissions and the question bank all
carry a `schoolId`, and `firestore.rules` only lets people see their own school's documents.
- **Platform admin** = the accounts in `ADMIN_EMAILS` (the server sets `platformAdmin` on sign-in and
  removes it if the email is taken off the list). They create and rename schools on
  **管理後台 → 學校管理** (`/admin/schools`), and can view any school and move users between schools.
- **School admin** = role `admin` in a school. Approves new accounts, sets roles, 班別 and parent links,
  and chooses whether to share the school's question bank with other schools.
- New accounts sign in, choose their school, and wait (`accountStatus: review`) for that school's admin.
- The **first school** created takes over everything that existed before schools (and the old AI key);
  old user fields (requestedRole, learnerStage, roleNote, adminNote, classroomIds, …) are removed then.

### AI key
Each school has its own AI key, set by that school's admin on **管理後台 → AI 設定**
(`/admin/ai-settings`). It is stored encrypted in Firestore at `schoolSecrets/{schoolId}`, which
browsers cannot read; the server reads it with the Admin SDK. Any key a browser sends is ignored.
If a school has no key, the server falls back to `OPENROUTER_API_KEY` when that is set.
Services on the page: OpenAI, Google Gemini and DeepSeek use an API key. **Codex** instead signs in
with a ChatGPT (Plus/Pro) account using the same device-code login as the pi coding agent / Codex CLI;
the encrypted tokens are stored in `schoolSecrets/{schoolId}.chatgpt` and refreshed automatically, and
requests go to `chatgpt.com/backend-api/codex/responses`. This is unofficial: OpenAI may change or block
it, and all of the school's AI use counts against that ChatGPT plan. The saved API key is kept, so the
school can switch back with one tap.
When Firebase is configured, only signed-in, active users can use AI.

### Firestore rules
`firestore.rules` is not deployed by Vercel. After changing it run
`firebase deploy --only firestore:rules`, or paste it into Firebase console → Firestore → Rules.

Do **not** put admin service account JSON into browser-exposed env vars.

## Recommended operational model

- Browser app uses Firebase Web SDK + Firestore rules
- Admin scripts use a service account locally/CI only
- Seed data lives in `seeds/sample-firestore-data.json`
- One-off seeding should delete any temporary credential file after use
