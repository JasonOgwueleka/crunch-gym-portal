# AI usage record: Prompt used to build v0

- **Date:** 25 November 2026 (2026-11-25T12:13:19.058Z)
- **AI tool:** Claude Code (CLI), model Claude Opus 5.5 (`claude-opus-5-5`)
- **Result:** v0 functional baseline. Commit `95ba943`, tag `v0.0`, branch `v0`
- **Follow-up prompts:** setup and troubleshooting only (generate `.env.local`, fix the Supabase connection string, run the migration and seed, smoke-test, create the GitHub repo with branches v0, v1, v2). No feature prompts after this one.

## Prompt (verbatim)

```text
We're building an application for Crunch Gym Portal. It's a web app for a fictional gym, with a React (Vite) frontend and a Node.js/Express backend API, connected to our existing Supabase PostgreSQL database through a DATABASE_URL in a .env file that is never committed. Don't use Docker or any other local services. Put all tables in a Postgres schema called gym_v0, not public. Write the schema as SQL migration files we can run in the Supabase SQL editor, plus a seed script that loads synthetic data and one test account per role. Don't use Supabase Auth. Handle email/password login in the Express API, with sessions stored in Postgres. There are five roles: Visitor (sees plans and the class timetable, can register), Member (buys/renews/cancels a membership through a simulated payment step, books and cancels group classes and personal training sessions, sees workout plans from their trainer, logs progress and uploads progress photos, fills in a health questionnaire, messages their assigned trainer), Personal Trainer (sets availability, sees only clients assigned to them, writes workout plans and session notes, runs classes, uploads certification documents), Front Desk (checks members in and sees whether their membership is active), and Admin (manages membership plans, users and roles, assigns trainers to members, approves certifications, issues refunds, and sees an audit log and CSV reports). Every main entity needs full create, read, update and delete through both the API and the UI. Payments must be simulated in the app, with no real payment provider. Emails such as password resets should just be logged to the console. Uploaded files go in a server folder outside any public directory. This is the functional baseline: build it with ordinary, sensible practices, but don't add dedicated security hardening yet, because that comes in a later version. 


Here is the path to the brief so you have context on what we are building /Users/jasonogwueleka/Downloads/CA3\ Project\ Brief\ 2026.docx
```
