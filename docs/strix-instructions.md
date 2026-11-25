# Strix instructions: Crunch Gym Portal

This is an authorised security test of our own university project (TU Dublin, Application Security CA3).
All data is synthetic.

## Scope
- IN SCOPE: the web app at http://host.docker.internal:4000 (React frontend and Express REST API under /api),
  plus the source code provided as the local directory target.
- OUT OF SCOPE: anything else. Do NOT connect directly to any *.supabase.co host, and do not scan other
  hosts or ports. Do not run denial-of-service or high-volume flooding tests (short bursts of up to 50
  requests to check for rate limiting are fine).

## App summary
Gym management portal. Roles: visitor (not logged in), member, trainer, front_desk, admin.
Session cookie auth (cookie name `crunch.sid`). Log in with POST /api/auth/login and a JSON body {"email","password"}.
The API route list is in README.md, section 5.

## Test accounts
| Role | Email | Password |
|---|---|---|
| Admin | admin@crunchgym.test | Admin123! |
| Front desk | frontdesk@crunchgym.test | FrontDesk123! |
| Trainer | trainer@crunchgym.test | Trainer123! |
| Member A | member@crunchgym.test | Member123! |
| Member B | leah.moore@example.test | Password123! |
| Trainer 2 | riley.pace@crunchgym.test | Password123! |

Member A is assigned to Trainer (trainer@crunchgym.test). Member B is assigned to Trainer 2, NOT to the
first trainer. Use Member A and Member B to test cross-account access, and the first trainer against
Member B to test the assigned-clients-only rule.
Simulated payment cards: 4242424242424242 with any future expiry and CVC 123.

## Focus areas (in priority order)
1. Broken access control / IDOR: can a member read or change another member's progress logs, photos,
   health questionnaire, messages, workout plans or PT sessions by changing IDs? Can a trainer see clients
   who are not assigned to them? Can front_desk or member reach admin endpoints?
2. Mass assignment and privilege escalation, e.g. setting `role` through PUT /api/auth/me or registration.
3. Authentication: brute force and rate limiting, account enumeration (login, register, forgot-password),
   password policy, password reset token handling.
4. Session management: session fixation, logout and expiry, and whether sessions survive a password change. Check cookie flags.
5. CSRF on state-changing endpoints; missing security headers (CSP, X-Frame-Options, etc.).
6. File uploads: POST /api/progress/photos (field `photo`) and POST /api/certifications (field `document`):
   file type validation, stored XSS through HTML or SVG, path traversal.
7. Injection: SQL injection in search and filter parameters, stored XSS in text fields (messages, notes, bios).

## Reporting
For every finding give: the affected endpoint, the exact request(s) to reproduce, the observed response,
severity, and the affected role. Clearly separate confirmed and exploited issues from suspected ones.
