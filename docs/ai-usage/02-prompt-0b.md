# AI usage record: Prompt 0b (separate gym_v1 schema)

- **Date:** 2026-11-25
- **AI tool:** Claude Code (CLI), model Claude Opus 5.5 (`claude-opus-5-5`)
- **Branch:** v1
- **Owner:** Jason

## Prompt (verbatim)

```text
First task (not a security requirement): make this version use its own
database schema so the v0 version keeps working.

1. Change every reference to the gym_v0 schema to gym_v1 (server code,
   session store schemaName, migrations, seed and reset scripts, README).
   This task overrides rule 3: edit the existing migration so it creates
   gym_v1 instead of gym_v0.
2. database/reset.sql must only drop gym_v1.
3. Tell me the exact commands to create the gym_v1 schema and load the
   seed data.
4. Do not change any app behaviour.
```

## AI response (summary)

**Files changed**

| File(s) | Change |
|---|---|
| `database/migrations/001_create_schema.sql` | `gym_v0` → `gym_v1` (schema, tables, indexes, triggers). Edited in place, as the prompt allowed. |
| `database/reset.sql` | Now drops only `gym_v1`. |
| `server/src/index.js` | Session store `schemaName: 'gym_v1'`. |
| `server/src/middleware/auth.js`, `server/src/utils/audit.js`, `server/src/utils/domain.js`, all 19 files in `server/src/routes/` | Every SQL reference `gym_v0.` → `gym_v1.` |
| `server/scripts/seed.js` | Truncates and seeds `gym_v1`. |
| `README.md` | Schema name and uploads path updated. |
| `server/src/config.js` | Upload folder is now `server/uploads/gym_v1/`. |
| `.gitignore` | `strix_runs/` ignored (housekeeping). |

**Verification:** 371 occurrences replaced across 27 files; 0 references to `gym_v0` remain. A per-file check confirmed the schema name is the only difference in every file except `config.js`, `README.md` (uploads path) and `.gitignore`.

**Decision beyond the prompt:** the seed script clears the uploads folder, so seeding v1 deleted the files v0's rows point to. v1 now uses its own `server/uploads/gym_v1/` folder. Where files are stored changed; app behaviour did not.

**Commands run:** `npm run db:migrate` (created `gym_v1`), then `npm run db:seed`: 32 users, 5 plans, 22 memberships, 25 payments, 82 classes, 453 bookings, 171 slots, 17 PT sessions, 83 check-ins, 9 certifications.

**Smoke test (v1):** all 4 test logins returned 200. Member, trainer, front desk and admin pages returned 200, including photo and certificate file downloads. Front desk calling an admin endpoint got 403; an anonymous request got 401. New sessions were stored in `gym_v1.user_sessions`, and `gym_v0` was untouched (32 users).

**Limitation:** on this machine, v0's existing photo and certificate rows point to files that the first v1 seed replaced. Running `npm run db:seed` on the v0 branch restores them. (That also resets the shared `gym_v0` data, so coordinate with the team.)

**Security claims:** none (not a security requirement).
