# SEC-11: Encrypt health data at rest

**Owner:** Alex. **Commit:** `v1: SEC-11 encrypt health data (owner: Alex)`

## PROMPT
```text
Implement security requirement SEC-11: Encrypt health data at rest.

User story: As a member, I want my health questionnaire encrypted in the
database so that a database leak does not expose my medical information.

Acceptance criteria:
1. The text fields in health_questionnaires (medications,
   medical_conditions, injuries, emergency_contact_name,
   emergency_contact_phone) are encrypted with AES-256-GCM before being
   saved.
2. Each value uses a unique random IV and stores the auth tag, so tampering
   is detected.
3. The key comes from an environment variable (HEALTH_DATA_KEY), never
   hard-coded or stored in the database. The app refuses to start if the
   key is missing or the wrong length.
4. Data is only decrypted for users allowed to view it (the member, their
   assigned trainer, admin) using the existing checks in
   server/src/routes/health.js.
5. Update the seed script so seeded health data is encrypted.
6. Looking at the table directly in Supabase shows unreadable ciphertext for
   these fields.

Explain how the key could be rotated in future.
```

## Notes (don't paste)
- The trainer's client detail page (`server/src/routes/clients.js`) also returns the questionnaire. It must decrypt there too. Check that the reply mentions it.
- A new `HEALTH_DATA_KEY` goes in **`.env.local`** (Claude generates it). Each teammate needs the **same key** in their own `.env.local` to read the seeded data. Share it privately, never in GitHub.
- **T-11e** (front desk gets 403) already passes on v0, so it shows nothing broke rather than proving the encryption. Use T-11b and T-11d as the main evidence.
- **Demo:** show the table in Supabase. `gym_v0.health_questionnaires` is readable text, `gym_v1.health_questionnaires` is ciphertext.
