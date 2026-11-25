# SEC-12: Tamper-evident audit log

**Owner:** Jason. **Commit:** `v1: SEC-12 tamper-evident audit log (owner: Jason)`

## PROMPT
```text
Implement security requirement SEC-12: Tamper-evident audit log.

User story: As an admin, I want the audit log protected so that any change to
it can be detected.

Acceptance criteria:
1. Security events are logged: login success, login failure, lockout, logout,
   access denied (403), role change, refund, password change/reset, file
   upload rejected.
2. Each new audit log entry stores a SHA-256 hash of (its own content + the
   previous entry's hash), forming a hash chain.
3. An admin-only endpoint GET /api/admin/audit-logs/verify checks the whole
   chain and reports whether it is intact, and the ID of the first broken
   entry if not.
4. Audit log rows cannot be updated or deleted through the app (enforce with
   a database trigger in a migration).
5. No passwords, tokens or health data are ever written to the log.
6. Show the verify result on the admin audit log page.

Make sure two requests at the same time cannot break the chain.

Deleting a user must still work. Old audit rows must not be changed when a
user is deleted (keep actor_email in the row; the foreign key must not
modify audit rows).
```

## Notes (don't paste)
- **Changed from the original:** the last paragraph was added. In v0 the audit log is linked to users in a way that edits old log rows when a user is deleted. With the new block on edits, deleting a user would fail and the chain would break.
- **"File upload rejected"** can only be fully tested after SEC-10. Re-check it then.
- **Expected limitation:** the trigger blocks editing and deleting individual rows, but not wiping the whole table at once (the seed script relies on that). Discuss this in the report, because a database admin could still wipe the log.
- For T-12c (tampering on purpose), you'll need the SQL to switch the trigger off and on. Claude can give it to you in the reply.
