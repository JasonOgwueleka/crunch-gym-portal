# SEC-05: Session hardening

**Owner:** Ben. **Commit:** `v1: SEC-05 session hardening (owner: Ben)`

## PROMPT
```text
Implement security requirement SEC-05: Session hardening.

User story: As a member, I want my session to be protected so that someone
can't hijack or reuse it.

Acceptance criteria:
1. The session ID is regenerated on successful login (prevent session
   fixation).
2. Idle timeout: a session with no activity for 15 minutes is invalid.
3. Absolute timeout: a session is invalid 8 hours after login, even if active.
4. Logout, password change and password reset destroy the session
   server-side. Password change and reset also destroy ALL other sessions
   for that user.
5. Cookie flags: HttpOnly, SameSite=Strict, and Secure when
   NODE_ENV=production.
6. After the session expires, the React app sends the user to the login page
   with a clear message.

Make the idle and absolute timeouts configurable through environment
variables (defaults 15 minutes and 8 hours) so they can be shortened for
testing or lengthened for automated scans.
```

## Notes (don't paste)
- **Changed from the original:** the last paragraph was added. It lets Ben test the idle timeout with a 1-minute setting instead of waiting 16 minutes. It also lets ZAP and Strix scans run longer without being logged out.
- In the report, say the defaults are 15 minutes and 8 hours, and say which value you used during each test.
- After this commit you get logged out after 15 idle minutes while working. That's expected.
