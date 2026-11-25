# SEC-06: CSRF protection

**Owner:** Jason. **Commit:** `v1: SEC-06 CSRF protection (owner: Jason)`

## PROMPT
```text
Implement security requirement SEC-06: CSRF protection.

User story: As a member, I want my account protected from forged requests so
that a malicious website can't perform actions as me.

Acceptance criteria:
1. Every state-changing request (POST, PUT, PATCH, DELETE) under /api
   requires a valid CSRF token.
2. A missing or invalid token returns HTTP 403 and the action is not
   performed.
3. The token is bound to the user's session and changes when the session is
   regenerated.
4. GET requests never change data (check all routes and list any that do).
5. The React app (client/src/lib/api.js) fetches the token and sends it
   automatically in a header, so all existing forms still work, including
   file uploads (multipart).
6. CSRF failures are written to the audit log.

Use the synchronizer token pattern or double-submit cookie. Tell me which and
why. Do not use the deprecated csurf package.
```

## Notes (don't paste)
- **T-06d (your demo test):** make a page on another port that auto-submits a form to
  `POST http://localhost:5173/api/classes/<id>/book` (or `/api/memberships/<id>/cancel`).
  These endpoints need no request body, so a plain HTML form works.
  - **Run it on v0 first. It will succeed there**, because a page on another localhost port counts as the "same site", so SameSite cookies don't stop it.
  - On v1 it should return 403. That's a strong before-and-after for the demo.
- After this, ZAP's POST attacks will mostly get 403. That's expected, and the testing guide covers it.
- Check that a file upload still works, since multipart forms are easy to break.
