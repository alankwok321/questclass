# QuestClass

QuestClass is a product-style AI learning OS prototype for teachers and students.

## What it includes

- **Landing page** for product presentation
- **Student learning app** with quests, XP, badges, streaks, and leaderboard
- **AI tutor chat** with demo mode and live API mode
- **Teacher dashboard** with student cards, classroom metrics, and lesson loop output
- **Knowledge map / skill tree / weakness heatmap**
- **Unit and question bank structure** for curriculum content
- **Automated learning loop**: assign → answer → grade → analyze → regenerate
- **Local persistence** via browser localStorage
- **Vercel-ready deployment**

## Run locally

```bash
npm install
npm start
```

Default port: `18890`

## Optional live AI config

You can either fill these in the app UI or set them as env vars:

- `OPENROUTER_API_KEY` or `OPENAI_API_KEY`
- `OPENROUTER_BASE_URL` or `OPENAI_BASE_URL`
- `AI_MODEL`

Example:

```bash
OPENROUTER_API_KEY=...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=openai/gpt-4.1-mini
```

## Deploy

```bash
vercel --prod
```
