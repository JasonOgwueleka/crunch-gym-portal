/**
 * SEC-06: CSRF protection using the synchronizer token pattern.
 *
 * - A random 256-bit token is stored in the server-side session (gym_v1.user_sessions).
 * - The React app reads it from GET /api/auth/csrf-token (same-origin only; a
 *   malicious site cannot read the response) and sends it in the X-CSRF-Token
 *   header on every POST/PUT/PATCH/DELETE.
 * - The server compares the header with the session's token in constant time.
 * - Because the token lives in the session, it disappears whenever the session is
 *   regenerated (login, registration) or destroyed (logout, password change,
 *   timeout), and a new one is issued on the next request for a token.
 */
import crypto from 'node:crypto';
import { HttpError } from './http.js';
import { audit } from './audit.js';

export const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Returns the session's CSRF token, creating one if the session has none yet. */
export function getOrCreateCsrfToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  return req.session.csrfToken;
}

function tokensMatch(expected, provided) {
  if (typeof expected !== 'string' || typeof provided !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Middleware: every state-changing request must carry the session's token. */
export async function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const provided = req.get(CSRF_HEADER);
  const expected = req.session?.csrfToken;
  if (tokensMatch(expected, provided)) return next();

  const reason = !provided ? 'missing token' : !expected ? 'no token in session' : 'token mismatch';
  await audit(req, 'security.csrf_rejected', 'request', `${req.method} ${req.originalUrl}`, {
    method: req.method,
    path: req.originalUrl,
    reason,
    origin: req.get('origin') || null,
    referer: req.get('referer') || null,
  });
  throw new HttpError(403, 'Security check failed (invalid or missing CSRF token). Please refresh the page and try again.', 'CSRF_INVALID');
}
