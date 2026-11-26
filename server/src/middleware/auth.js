import { one } from '../db.js';
import { HttpError } from '../utils/http.js';
import { config } from '../config.js';
import { audit } from '../utils/audit.js';
import { regenerateSession } from '../utils/session.js';

const EXPIRED_MESSAGES = {
  idle: 'Your session expired because you were inactive. Please log in again.',
  absolute: 'Your session has reached its maximum length. Please log in again.',
};

/**
 * SEC-05: returns 'idle' or 'absolute' if this session must no longer be accepted,
 * otherwise null. Sessions without timestamps (created before SEC-05) are treated
 * as expired.
 */
function expiryReason(session, now) {
  if (!session.authenticatedAt) return 'absolute';
  if (now - session.authenticatedAt > config.sessionAbsoluteMs) return 'absolute';
  if (now - (session.lastActivityAt ?? session.authenticatedAt) > config.sessionIdleMs) return 'idle';
  return null;
}

/**
 * Look up the logged-in user on every request so role/active changes apply immediately.
 * SEC-05: also enforces the idle and absolute timeouts server-side. An expired session
 * is deleted from the store and replaced with an empty one, the request continues as
 * a visitor, and the response carries `X-Session-Expired: idle|absolute` so the React
 * app can send the user to the login page with a clear message.
 */
export async function loadUser(req, res, next) {
  const userId = req.session?.userId;
  if (userId) {
    const now = Date.now();
    const reason = expiryReason(req.session, now);
    if (reason) {
      await regenerateSession(req); // deletes the old session row; new one is empty
      req.sessionExpired = reason;
      res.set('X-Session-Expired', reason);
      await audit(req, 'auth.session_expired', 'user', userId, { reason }, { id: userId });
      return next();
    }

    const user = await one(
      `select id, email, full_name, phone, date_of_birth, role, is_active, created_at
         from gym_v1.users where id = $1`,
      [userId],
    );
    if (user && user.is_active) {
      req.user = user;
      req.session.lastActivityAt = now; // any authenticated request counts as activity
    } else {
      delete req.session.userId;
    }
  }
  next();
}

function notLoggedIn(req) {
  if (req.sessionExpired) {
    return new HttpError(401, EXPIRED_MESSAGES[req.sessionExpired], 'SESSION_EXPIRED');
  }
  return new HttpError(401, 'Please log in to continue');
}

export function requireAuth(req, res, next) {
  if (!req.user) throw notLoggedIn(req);
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) throw notLoggedIn(req);
    if (!roles.includes(req.user.role)) throw new HttpError(403, 'You do not have permission to do that');
    next();
  };
}
