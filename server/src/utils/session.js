/**
 * SEC-05: session helpers.
 *
 * Sessions are stored server-side in gym_v1.user_sessions (connect-pg-simple),
 * so deleting a row there invalidates that session immediately, wherever the
 * cookie is.
 */
import { query } from '../db.js';

export const SESSION_COOKIE = 'crunch.sid';

/** Issue a brand-new session ID (prevents session fixation). The old session row is deleted. */
export function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

/** Start an authenticated session for this user on a fresh session ID. */
export async function startAuthenticatedSession(req, userId) {
  await regenerateSession(req);
  const now = Date.now();
  req.session.userId = userId;
  req.session.authenticatedAt = now; // absolute timeout is measured from here
  req.session.lastActivityAt = now; // idle timeout is measured from here
}

/** Destroy the current session server-side and clear the cookie. */
export function destroySession(req, res) {
  return new Promise((resolve) => {
    if (!req.session) return resolve();
    req.session.destroy(() => {
      res.clearCookie(SESSION_COOKIE, { path: '/' });
      resolve();
    });
  });
}

/** Delete every stored session that belongs to this user (all browsers and devices). */
export async function destroyAllSessionsForUser(userId) {
  const { rowCount } = await query(
    `delete from gym_v1.user_sessions where sess->>'userId' = $1::text`,
    [userId],
  );
  return rowCount;
}
