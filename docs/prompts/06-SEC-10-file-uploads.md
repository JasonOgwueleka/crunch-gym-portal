# SEC-10: Safe file uploads

**Owner:** Alex. **Commit:** `v1: SEC-10 safe file uploads (owner: Alex)`

## PROMPT
```text
Implement security requirement SEC-10: Safe file uploads.

User story: As an admin, I want uploaded files checked so that nobody can
upload malware or scripts.

Acceptance criteria:
1. Certificates (/api/certifications) accept only PDF, JPG and PNG. Progress
   photos (/api/progress) accept only JPG and PNG.
2. The type is checked by the real file content (magic bytes), not the
   extension or the Content-Type sent by the client.
3. Max file size 5 MB.
4. Stored filenames are random and the extension is set from the detected
   type. The original filename is sanitised before being stored in the
   database.
5. Files are returned with Content-Disposition: attachment (inline for images
   only), the correct Content-Type, and X-Content-Type-Options: nosniff.
6. A rejected file is deleted from disk immediately, returns HTTP 400 with a
   clear message, and is written to the audit log.

Upload handling is in server/src/utils/uploads.js (multer).
```

## Notes (don't paste)
- **Best demo test:** upload an HTML file renamed to `photo.png` as a progress photo, then open it as the trainer.
  - On **v0** it opens as a web page inside the app. That's stored XSS, a real attack.
  - On **v1** it's rejected with 400.
- Test files to prepare for Alex: a real PDF, a real JPG, a 6 MB file (`mkfile 6m big.pdf` on a Mac), and an HTML file renamed to `.pdf`.
- Re-check SEC-12 here: the rejected upload should appear in the audit log, and verify should still say "intact".
