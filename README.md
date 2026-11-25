# Crunch Gym Portal (v0, functional baseline)

A web portal for a fictional gym, built for the DFCS H4013 Application Security CA3 project.

- **Frontend:** React 18 + Vite + React Router (`client/`)
- **Backend:** Node.js + Express 5 REST API (`server/`)
- **Database:** existing Supabase PostgreSQL, all tables in the **`gym_v1`** schema (`database/`)
- **Auth:** email and password handled by Express (bcrypt hashes), sessions stored in Postgres (`gym_v1.user_sessions`). Supabase Auth is not used.
- **Payments:** simulated in the app. No payment provider is contacted.
- **Email:** printed to the API server console (welcome, receipts, password resets, refunds, certification decisions).
- **Uploads:** saved to `server/uploads/gym_v1/` (one folder per version), which is never served statically. Files are only returned through API routes that check permissions.

> This is **v0**: the functional baseline built with ordinary practices *before* dedicated security
> hardening. Hardening is planned for v1. See [Not yet hardened](#not-yet-hardened-v0-scope).

---

## 1. Setup

Requirements: Node.js 20+ and access to the Supabase project. No Docker and no local database.

```bash
# 1. Install dependencies (root, server and client)
npm run install:all

# 2. Configure environment
#    Edit .env.local and set DATABASE_URL (Supabase > Connect > Session pooler URI).
#    SESSION_SECRET is pre-generated. .env.local is git-ignored and takes priority over .env.
#    (If .env.local is missing, copy .env.example to .env.local.)
```

### Create the schema

**Option A: Supabase SQL editor (recommended).** Open the SQL editor, paste
`database/migrations/001_create_schema.sql` and run it. Re-running it is safe.

**Option B: from the terminal.**
```bash
npm run db:migrate
```

To start over, run `database/reset.sql` (drops **only** the `gym_v1` schema), then run the migration again.

### Load synthetic data

```bash
npm run db:seed
```

The seed **truncates every table in `gym_v1`** and clears `server/uploads/gym_v1/`, then loads plans, about 30 users, memberships,
payments (including failed ones and a refund), trainer assignments, availability, PT sessions, a three-week
class timetable with bookings, workout plans, session notes, progress logs, placeholder progress photos and
certificate PDFs, health questionnaires, messages, check-ins and audit entries. All of this data is synthetic.

### Run

```bash
npm run dev          # API on http://localhost:4000 and React app on http://localhost:5173
```

Open **http://localhost:5173**. Vite proxies `/api` to the API, so the session cookie stays same-origin.

For a production-style run: `npm run build && npm start`. Express then serves `client/dist` on port 4000.

---

## 2. Test accounts

| Role | Email | Password |
|---|---|---|
| Admin | `admin@crunchgym.test` | `Admin123!` |
| Front Desk | `frontdesk@crunchgym.test` | `FrontDesk123!` |
| Personal Trainer | `trainer@crunchgym.test` | `Trainer123!` |
| Member | `member@crunchgym.test` | `Member123!` |
| Visitor | no account, browse while logged out | n/a |

All other synthetic users (e.g. `jordan.lift@crunchgym.test`, `…@example.test`) use `Password123!`.
The test member is assigned to the test trainer, has an active membership, and has bookings, plans,
progress data and messages.

**Simulated card numbers:** any 12 to 19 digit number with a future expiry (MM/YY) and a 3 or 4 digit CVC is approved,
e.g. `4242 4242 4242 4242`. Numbers ending in `0002` are **declined**, and numbers ending in `9995` fail with
**insufficient funds**. Only the brand and last four digits are stored.

**Password reset:** use *Forgot password* and the reset link appears in the API console output.

---

## 3. Roles and features

| Role | What they can do |
|---|---|
| **Visitor** | View plans, the class timetable and trainers; register (creates a Member account) |
| **Member** | Buy, renew or switch a membership via the simulated checkout; cancel it; toggle auto-renew; see payment history. Book and cancel group classes. Book, edit and cancel PT sessions from their assigned trainer's availability. View workout plans. Create, edit and delete progress logs; upload, edit and delete progress photos. Create, edit and delete the health questionnaire. Message their assigned trainer. Edit their profile, change their password, delete their account |
| **Personal Trainer** | Create, edit and delete availability slots. See **only assigned clients**, including their health questionnaire, progress and photos. Write workout plans and session notes (full CRUD). Manage PT sessions (complete, no-show, cancel). Create and run their own classes and mark attendance. Upload, replace and delete certification documents. Message clients. Edit their trainer bio |
| **Front Desk** | Search members, see whether their membership is active, check them in (with an override for inactive members), edit check-in notes, delete check-ins |
| **Admin** | Full CRUD for users and roles, plans, memberships, trainer assignments, classes and rosters, PT sessions, payments and refunds (issue, edit, void). Approve or reject certifications. View the audit log with filters. Download CSV reports. View the dashboard |

## 4. Project structure

```
database/
  migrations/001_create_schema.sql   all tables, indexes and triggers in schema gym_v1
  reset.sql                          drops schema gym_v1 (dev only)
server/
  src/index.js                       Express app, session store and route mounting
  src/config.js  src/db.js           env loading and pg pool (SSL for Supabase)
  src/middleware/auth.js             loadUser / requireAuth / requireRole
  src/routes/*.js                    one router per resource (see below)
  src/utils/                         audit log, simulated payments, console mailer, uploads, CSV
  scripts/migrate.js  scripts/seed.js
  uploads/                           uploaded files (git-ignored, never served statically)
client/
  src/App.jsx                        routes and role guards
  src/components/                    Layout, CrudPage (generic CRUD), EntityForm, UI kit
  src/pages/{public,member,trainer,desk,admin,shared}/
```

## 5. API overview (all under `/api`)

| Resource | Endpoints |
|---|---|
| Auth | `POST /auth/register` `POST /auth/login` `POST /auth/logout` `GET/PUT/DELETE /auth/me` `POST /auth/change-password` `POST /auth/forgot-password` `POST /auth/reset-password` |
| Plans | `GET /plans` `GET /plans/:id` `POST /plans` `PUT /plans/:id` `DELETE /plans/:id` |
| Users (admin) | `GET /users` `GET /users/:id` `POST /users` `PUT /users/:id` `DELETE /users/:id` |
| Trainers | `GET /trainers` `GET /trainers/:id` `GET/PUT /trainers/me/profile` |
| Memberships | `GET /memberships/mine` `POST /memberships/checkout` `POST /memberships/:id/cancel` `PATCH /memberships/:id/auto-renew` and admin `GET/POST /memberships` `GET/PUT/DELETE /memberships/:id` |
| Payments | `GET /payments/mine` `GET /payments` `GET/PUT/DELETE /payments/:id` `POST /payments/:id/refund` `GET /payments/refunds` `PUT/DELETE /payments/refunds/:id` |
| Classes | `GET /classes` `GET /classes/:id` `POST /classes` `PUT/DELETE /classes/:id` `POST/DELETE /classes/:id/book` `GET /classes/bookings/mine` `GET /classes/:id/bookings` `PATCH/DELETE /classes/:id/bookings/:bookingId` |
| Availability | `GET /availability` `GET/PUT/DELETE /availability/:id` `POST /availability` |
| PT sessions | `GET /pt-sessions` `POST /pt-sessions` `POST /pt-sessions/admin` `GET/PUT/DELETE /pt-sessions/:id` `POST /pt-sessions/:id/cancel` |
| Clients (trainer) | `GET /clients` `GET /clients/:memberId` |
| Workout plans | `GET /workout-plans` `POST /workout-plans` `GET/PUT/DELETE /workout-plans/:id` |
| Session notes | `GET /session-notes` `POST /session-notes` `GET/PUT/DELETE /session-notes/:id` |
| Progress | `GET/POST /progress/logs` `GET/PUT/DELETE /progress/logs/:id` `GET/POST /progress/photos` `PUT/DELETE /progress/photos/:id` `GET /progress/photos/:id/file` |
| Health questionnaire | `GET/POST/PUT/DELETE /health-questionnaire/mine` `GET /health-questionnaire/member/:memberId` `GET /health-questionnaire` |
| Messages | `GET /messages/contacts` `GET /messages/unread-count` `GET /messages/thread/:userId` `POST /messages` `PUT/DELETE /messages/:id` |
| Certifications | `GET /certifications` `POST /certifications` (multipart) `GET/PUT/DELETE /certifications/:id` `GET /certifications/:id/file` `PATCH /certifications/:id/review` |
| Check-ins | `GET /checkins/mine` `GET /checkins/members?q=` `GET /checkins?date=` `POST /checkins` `PUT/DELETE /checkins/:id` |
| Assignments | `GET /assignments/mine` and admin `GET/POST /assignments` `GET/PUT/DELETE /assignments/:id` |
| Admin | `GET /admin/summary` `GET /admin/audit-logs` `GET /admin/reports` `GET /admin/reports/:name.csv` |

## 6. Not yet hardened (v0 scope)

v0 uses ordinary practices: parameterized SQL, bcrypt password hashes, server-side role checks,
HttpOnly session cookies, uploads stored outside any public folder under random names, and an audit log.
It **does not yet** include dedicated hardening. These are candidate areas for the v1 security requirements:

- No rate limiting or account lockout on login, registration or password reset
- No CSRF tokens (relies on the `SameSite=Lax` cookie default)
- Session ID not regenerated on login; no idle or absolute timeout beyond the 8-hour rolling cookie
- No `secure` cookie flag (local HTTP); no security headers (CSP, HSTS, etc.)
- Minimal password policy (6+ characters), no MFA
- Upload validation limited to a 10 MB size cap (no MIME or magic-byte checks, no malware scanning)
- Input validation is basic (required fields and database constraints), with no schema validation library
- Error responses are generic, but stack traces are logged to the console
- Health and progress data are not encrypted at the application level
- Audit log is append-only by convention only (no tamper protection)
- Database connection uses `rejectUnauthorized: false` for Supabase's TLS certificate
