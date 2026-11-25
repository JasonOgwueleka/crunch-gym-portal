# AI usage record: Prompt 0 (context and rules)

- **Date:** 2026-11-25
- **AI tool:** Claude Code (CLI), model Claude Opus 5.5 (`claude-opus-5-5`)
- **Branch:** v1
- **Code changes:** none

## Prompt (verbatim)

```text
You are helping us harden a web app for a university Application Security project.

App: Crunch Gym Portal (v0 baseline).
- Backend: Node.js + Express 5 REST API in server/ (express-session with
  connect-pg-simple, pg, bcryptjs, multer). Routes in server/src/routes,
  middleware in server/src/middleware/auth.js, helpers in server/src/utils.
- Frontend: React 18 + Vite in client/. All API calls go through
  client/src/lib/api.js. Vite proxies /api to the API on port 4000.
- Database: Supabase Postgres. Migrations in database/migrations.
- Roles: visitor, member, trainer, front_desk, admin.

Rules for every change:
1. Only implement the requirement I give you. Do not change unrelated features.
2. Keep all existing features working for every role.
3. Any database change goes in a NEW migration file. Never edit old migrations.
4. Use well-known libraries where sensible and tell me the package name,
   version and licence.
5. Never put secrets in code. New secrets go in .env.example as placeholders.
6. After each requirement, reply with:
   a) A list of files changed and what changed in each.
   b) An "AI SECURITY CLAIMS" table: one row per acceptance criterion with
      columns: Criterion | What you implemented | File/line | How we can test it.
   c) Any limitations, assumptions or criteria you could NOT fully meet.
   d) Any commands I need to run (npm install, migrations).

Do not claim something is secure unless the code you wrote does it.

I will give you the requirements ONE AT A TIME. After each one, stop and wait
for me to say "next" so I can review and commit it.
```

## AI response (summary)

Confirmed the rules: one requirement at a time; no unrelated changes; existing features kept working for every role; database changes only in new migration files; libraries reported with name, version and licence; no secrets in code; each reply gives files changed, an AI SECURITY CLAIMS table, limitations and commands; nothing claimed secure unless the code does it; stop and wait for "next" after each requirement.
