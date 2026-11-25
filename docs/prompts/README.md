# v1 prompts: run order

Paste these into Claude Code **one at a time, in this order**. Each file has:
- **PROMPT:** copy everything inside the box exactly.
- **Notes:** for you only. Do NOT paste them.

| # | File | Story | Owner | Commit message |
|---|---|---|---|---|
| 0 | `00-prompt-0-context-and-rules.md` | Context and rules | Jason | (no commit, no code change) |
| 1 | `01-prompt-0b-gym-v1-schema.md` | Separate `gym_v1` schema | Jason | `v1: switch to gym_v1 schema` |
| 2 | `02-SEC-01-brute-force.md` | Brute-force protection | Ben | `v1: SEC-01 brute-force protection (owner: Ben)` |
| 3 | `03-SEC-05-session-hardening.md` | Session hardening | Ben | `v1: SEC-05 session hardening (owner: Ben)` |
| 4 | `04-SEC-06-csrf.md` | CSRF protection | Jason | `v1: SEC-06 CSRF protection (owner: Jason)` |
| 5 | `05-SEC-12-audit-log.md` | Tamper-evident audit log | Jason | `v1: SEC-12 tamper-evident audit log (owner: Jason)` |
| 6 | `06-SEC-10-file-uploads.md` | Safe file uploads | Alex | `v1: SEC-10 safe file uploads (owner: Alex)` |
| 7 | `07-SEC-11-health-encryption.md` | Encrypt health data | Alex | `v1: SEC-11 encrypt health data (owner: Alex)` |

**Why this order:**
- SEC-05 (sessions) comes before SEC-06 (CSRF), because the CSRF token must change when the session is regenerated.
- SEC-12 (audit log) comes before SEC-10, so rejected uploads are written into the new hash chain.

## Routine for every prompt
1. Paste the prompt, then **screenshot it**.
2. Wait for the reply. **Screenshot it, including the AI SECURITY CLAIMS table.**
3. Claude runs any commands (npm install, migrations) and shows the output. Screenshot that too.
4. Quick check: `npm run dev`, log in as the relevant role, and click around. Screenshot the app working.
5. Say **"commit"**. Claude commits and gives you the hash. Paste it into the doc.
6. Say **"next"** and paste the next file.

## At the end (after SEC-11)
- Ask Claude to tag `v1.0` and push the `v1` branch and tag to GitHub.
- Screenshot GitHub → Pull requests → New pull request → compare `v0...v1`.
- Tell Ben and Alex that v1 is ready to test (`git fetch && git checkout v1 && npm run install:all`,
  then add `HEALTH_DATA_KEY` to their `.env.local`, then `npm run db:migrate && npm run db:seed`).
