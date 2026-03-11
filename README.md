# QuestClass v2

QuestClass v2 is a product-grade skeleton for an AI learning OS.

## Included in v2

- **Landing page** with product positioning
- **Auth skeleton** with demo/login tabs
- **Role-based app shell** for teacher and student views
- **Database-ready schema** in `db/schema.sql`
- **Teacher dashboard** with classroom and student management structure
- **Student home** with progression and task framing
- **AI tutor chat** with demo mode and live API mode
- **Lesson loop API** for assign → answer → grade → analyze → regenerate
- **Local persistence** for demo state
- **Vercel-ready deployment**

## Database

A Postgres / Supabase-ready schema is included:

- `profiles`
- `classrooms`
- `classroom_members`
- `units`
- `questions`
- `assignments`
- `assignment_questions`
- `submissions`
- `skill_snapshots`
- `ai_runs`

## Auth direction

Current build includes a UI/auth skeleton with demo mode and fake login routing.
This is designed to be connected later to:

- Supabase Auth
- Clerk
- Auth.js / NextAuth-style provider
- custom session APIs

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

```bash
vercel --prod
```
