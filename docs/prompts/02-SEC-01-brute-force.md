# SEC-01: Brute-force protection

**Owner:** Ben. **Commit:** `v1: SEC-01 brute-force protection (owner: Ben)`

## PROMPT
```text
Implement security requirement SEC-01: Brute-force protection.

User story: As a member, I want repeated failed logins to be blocked so that
attackers can't guess my password.

Acceptance criteria:
1. After 5 failed login attempts for the same account within 15 minutes, that
   account is locked for 15 minutes, even if the correct password is then
   entered.
2. Rate limit per IP on POST /api/auth/login, /api/auth/register and
   /api/auth/forgot-password (max 10 requests per minute per IP). Return
   HTTP 429 when exceeded.
3. The login error message and response time must be the same whether the
   email exists or not (no user enumeration).
4. Lockouts and rate-limit hits are written to the audit log
   (server/src/utils/audit.js).
5. A successful login resets the failed-attempt counter.

Store lockout state in the database (not memory) so it survives a server
restart.
```

## Notes (don't paste)
- Expect a new migration (e.g. `002_...sql`) adding lockout columns or a table, plus a rate-limit library (probably `express-rate-limit`).
- **Test tweaks for Ben:**
  - **T-01c:** use 11 *different or made-up* emails. With the same account, the lockout triggers at attempt 6, before the rate limit is reached.
  - **Add T-01e:** repeat T-01c sending a different fake `X-Forwarded-For` header each time. Expected: still 429. This checks that the IP can't be spoofed to get around the limit.
- Afterwards, lock yourself out on purpose once, to check the lockout message in the UI.
