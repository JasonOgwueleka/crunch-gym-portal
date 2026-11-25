Create a Word document (.docx) for our university Application Security group project. It is a working document that I will fill in step by step as I go, NOT a finished report. Keep it simple and clean.

FORMATTING
- Calibri 11 pt, single line spacing, normal margins. Headings: Heading 1 / Heading 2 / Heading 3 so a table of contents works.
- Every place I need to add something must be a placeholder in square brackets, bold, highlighted yellow, e.g. **[ADD SCREENSHOT: …]**. Each placeholder must say exactly what to capture or paste, so I can work down the document in order.
- Use simple bordered tables. No colours other than the yellow placeholders. No filler text, no marketing tone.
- Where I give you facts below, write them in as normal text (not placeholders).
- Add a table of contents after the title page.

====================================================================
FACTS ABOUT THE PROJECT (use these, do not invent anything else)
====================================================================
Module: DFCS H4013 Application Security, CA3 project (TU Dublin). Report due Sun 6 Dec 2026 23:59; live demo from Tue 8 Dec 2026.
Group members: Jason Ogwueleka, Ben, Alex. Group number: [placeholder].
Application: Crunch Gym Portal, a web portal for a fictional gym. All data is synthetic; the app runs locally only.
Repository: https://github.com/JasonOgwueleka/crunch-gym-portal (private)
Branches: v0 = AI-developed baseline, v1 = AI-secured, v2 = verified/remediated. Each version uses its own Postgres schema in the same Supabase database (gym_v0, gym_v1, gym_v2) so all versions can run and be compared.
v0: built 25 Nov 2026 with Claude Code (CLI), model Claude Opus 5.5 (claude-opus-5-5). Commit 95ba943, tag v0.0.

Tech stack:
- Frontend: React 18.3.1 + Vite 5.4.21 + React Router 6.30.6
- Backend: Node.js (v24) + Express 5.3.0 REST API under /api
- Database: Supabase PostgreSQL, schema gym_v0, 21 tables, SQL migration files + seed script with synthetic data
- Auth: email/password handled by Express, bcrypt password hashes (bcryptjs), sessions stored in Postgres (express-session + connect-pg-simple). Supabase Auth NOT used.
- Payments: simulated in the app (no real provider). Emails: printed to the server console.
- File uploads: multer, stored in server/uploads (outside any public folder), only served through permission-checked API routes.

Roles and what they can do:
- Visitor (not logged in): view membership plans, class timetable and trainers; register as a member.
- Member: buy/renew/cancel a membership via simulated checkout; book/cancel group classes and PT sessions; view workout plans from their trainer; log progress and upload progress photos; fill in a health questionnaire; message their assigned trainer.
- Personal Trainer: set availability; sees ONLY clients assigned to them; writes workout plans and session notes; runs classes and marks attendance; uploads certification documents.
- Front Desk: search members, see whether their membership is active, check them in.
- Admin: manage plans, users and roles, trainer assignments, classes, PT sessions; approve certifications; issue refunds; view audit log; download CSV reports.

Critical flows (security-relevant): login/registration/password reset; membership checkout with simulated card payment; trainer access to a client's health and progress data (assigned clients only); file uploads (progress photos, certifications); admin refunds and role changes; audit logging.

Seed data (synthetic): 32 users, 5 plans, 22 memberships, 25 payments, 82 classes, 441 bookings, 17 PT sessions, 80 check-ins, 9 certifications. One test account per role (e.g. member@crunchgym.test).

v0 was intentionally built WITHOUT dedicated security hardening. Known gaps in v0 (from the README):
- No rate limiting or account lockout on login, registration or password reset
- No CSRF tokens (relies on SameSite=Lax cookie)
- Session ID not regenerated on login; only an 8-hour rolling cookie timeout
- No Secure cookie flag; no security headers (CSP, HSTS etc.)
- Minimal password policy (6+ characters), no MFA
- Upload validation limited to a 10 MB size cap (no file-type / magic-byte checks)
- Basic input validation only
- Health and progress data not encrypted at the application level
- Audit log append-only by convention only (no tamper protection)
- Database TLS uses rejectUnauthorized: false

Libraries in v0 (name, version, licence):
express 5.3.0 MIT; express-session 1.19.0 MIT; connect-pg-simple 10.0.0 MIT; pg 8.23.1 MIT; bcryptjs 2.4.3 MIT; multer 2.5.0 MIT; morgan 1.12.1 MIT; dotenv 16.6.1 BSD-2-Clause; react 18.3.1 MIT; react-dom 18.3.1 MIT; react-router-dom 6.30.6 MIT; vite 5.4.21 MIT; @vitejs/plugin-react 4.7.0 MIT; concurrently 9.2.5 MIT.

Security user stories for v1 (owner in brackets):
- SEC-01 Brute-force protection (Ben): As a member, I want repeated failed logins to be blocked so that attackers can't guess my password.
- SEC-05 Session hardening (Ben): As a member, I want my session to be protected so that someone can't hijack or reuse it.
- SEC-06 CSRF protection (Jason): As a member, I want my account protected from forged requests so that a malicious website can't perform actions as me.
- SEC-12 Tamper-evident audit log (Jason): As an admin, I want the audit log protected so that any change to it can be detected.
- SEC-10 Safe file uploads (Alex): As an admin, I want uploaded files checked so that nobody can upload malware or scripts.
- SEC-11 Encrypt health data (Alex): As a member, I want my health questionnaire encrypted in the database so that a database leak does not expose my medical information.

v1 prompts are sent to the AI in this order: Prompt 0 (context and rules), Prompt 0b (separate gym_v1 schema), then SEC-01, SEC-05, SEC-06, SEC-12, SEC-10, SEC-11. One git commit per prompt.

====================================================================
DOCUMENT STRUCTURE
====================================================================

TITLE PAGE
"Crunch Gym Portal – v0 Baseline and v1 AI Security Implementation Log", module name, group number placeholder, member names, date placeholder, repo URL.

1. CONTEXT AND SCOPE
1.1 Application overview – short paragraph from the facts (business context: what the gym portal does and who uses it).
1.2 Roles – table: Role | What they can do | Sensitive data they can access.
1.3 Critical flows – bullet list from the facts, one line each on why it is security-relevant.
1.4 Technology stack – table: Layer | Technology | Version.
1.5 Architecture – short paragraph (browser → React app → Express API → Supabase Postgres, plus uploads folder), then placeholder: [ADD ARCHITECTURE DIAGRAM]
1.6 Scope – In scope / Out of scope bullet lists (in: the app, its API, database schema, uploads; out: Supabase platform itself, third-party services, real payments). Note: synthetic data, local hosting, only our own accounts tested.
1.7 Repository and versions – table: Branch | Purpose | Database schema | Tag | Commit (v0 row filled in, v1 and v2 rows with placeholders). Placeholder: [ADD SCREENSHOT: GitHub repo page showing the v0, v1, v2 branches]

2. VERSION 0 – AI-DEVELOPED BASELINE
2.1 AI tool and approach – tool, model, date, commit, tag (from facts). One paragraph on how the AI was used (one main build prompt, then setup/troubleshooting prompts only).
2.2 The v0 build prompt –
   [PASTE PROMPT: copy from docs/ai-usage/00-v0-build-prompt.md in the repo]
   [ADD SCREENSHOT: the v0 prompt as sent to Claude Code]
   [WRITE 1 PARAGRAPH: what the prompt asked for and why we deliberately said "no security hardening yet"]
2.3 Follow-up prompts – table: # | Prompt (short) | Purpose | Outcome, with 4 placeholder rows (e.g. .env.local setup, Supabase connection fix, migration + seed, smoke test + GitHub repo).
2.4 v0 running – placeholders for screenshots: [ADD SCREENSHOT: public plans/timetable page as Visitor], [ADD SCREENSHOT: Member dashboard], [ADD SCREENSHOT: Trainer clients page], [ADD SCREENSHOT: Front desk check-in], [ADD SCREENSHOT: Admin dashboard / audit log], [ADD SCREENSHOT: terminal showing migrate + seed output].
2.5 Initial attack surface – table: Entry point | Who can reach it | Data involved | Known v0 weakness. Pre-fill rows for: login, registration, forgot/reset password, session cookie, state-changing API requests, file uploads (photos, certifications), health questionnaire, audit log, admin role/refund actions. Use the known gaps list for the last column.
   [ADD: v0 baseline scan results summary – Semgrep / ZAP / Strix alert counts, if run]
2.6 Library provenance and licences – table pre-filled from the v0 library list (Library | Version | Licence | Used for).

3. VERSION 1 – AI-SECURED: IMPLEMENTATION LOG
3.1 Approach – one paragraph: requirements given one at a time, AI asked to return an "AI SECURITY CLAIMS" table per requirement, each change reviewed and committed separately.

3.2 Prompt 0 – Context and rules
   [ADD SCREENSHOT: Prompt 0 as sent]
   [PASTE PROMPT: Prompt 0]
   [ADD SCREENSHOT: AI's reply]
   [WRITE 2–3 SENTENCES: why we set these rules (one requirement at a time, new migrations only, claims table, no unverified claims)]

3.3 Prompt 0b – Separate gym_v1 schema
   [ADD SCREENSHOT: Prompt 0b as sent]
   [PASTE PROMPT: Prompt 0b]
   [ADD SCREENSHOT: AI's reply]
   [ADD: commands run + SCREENSHOT of migrate/seed output]
   Commit: [commit hash]
   [WRITE 1–2 SENTENCES: why each version has its own schema]

3.4 to 3.9 – one section per security story, in order SEC-01, SEC-05, SEC-06, SEC-12, SEC-10, SEC-11. Each section has EXACTLY this layout:
   Heading: "SEC-xx – <name> (Owner: <name>)"
   User story: (fill in from the facts)
   Acceptance criteria: [PASTE: acceptance criteria from the prompt]
   Prompt:
     [ADD SCREENSHOT: SEC-xx prompt as sent]
     [PASTE PROMPT: full SEC-xx prompt text]
   AI response:
     [ADD SCREENSHOT: AI's reply, including the AI SECURITY CLAIMS table]
     Files changed – table: File | What changed  (with 3 empty rows)
     AI SECURITY CLAIMS – table with columns: Claim ID | Criterion | What the AI says it implemented | File/line | How we can test it  (with 5 empty rows; Claim IDs pre-filled like SEC-01-C1, SEC-01-C2 …)
     New libraries added – table: Package | Version | Licence  (2 empty rows)
     Limitations the AI reported: [PASTE]
   Commands run: [PASTE commands, e.g. npm install, npm run db:migrate]
   Commit: [commit hash and message]
   Before / after code: [ADD: short v0 code snippet] and [ADD: short v1 code snippet] with [WRITE 2–3 SENTENCES: what changed and which threat it addresses]
   Owner review: [WRITE: did the code do what the AI claimed? anything missing, surprising or over-claimed? first impressions only – full testing comes later]
   Quick check: [ADD SCREENSHOT: app still working after this change]

3.10 v1 summary
   Table: Story | Owner | Commit | Claims count | New libraries  (6 rows, pre-fill Story and Owner)
   [ADD: v1 tag (v1.0) and final commit hash]
   [ADD SCREENSHOT: GitHub "Compare v0...v1" page]
   Updated library list – table: Library | Version | Licence | Added for (SEC-xx)  (empty rows)

4. HANDOVER TO TESTING
Short table: Story | Owner/tester | Test IDs (T-01a–d, T-05a–e, T-06a–d, T-12a–d, T-10a–e, T-11a–e) | Testing tool (Ben: OWASP ZAP; Jason: AI-assisted DAST / Strix; Alex: Semgrep + npm audit).
One sentence: testing results are recorded in the separate verification document.

APPENDIX A – Evidence checklist
A tick-box checklist (☐) of everything to capture tonight in order: each prompt screenshot, each reply screenshot, each claims table, each commit hash, each before/after snippet, migrate/seed output, GitHub branches screenshot, Compare v0...v1 screenshot, v1.0 tag.

Give me the .docx file.
