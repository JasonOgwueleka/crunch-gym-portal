import { one } from '../db.js';
import { HttpError } from '../utils/http.js';

/** Look up the logged-in user on every request so role/active changes apply immediately. */
export async function loadUser(req, res, next) {
  const userId = req.session?.userId;
  if (userId) {
    const user = await one(
      `select id, email, full_name, phone, date_of_birth, role, is_active, created_at
         from gym_v0.users where id = $1`,
      [userId],
    );
    if (user && user.is_active) {
      req.user = user;
    } else {
      delete req.session.userId;
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) throw new HttpError(401, 'Please log in to continue');
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) throw new HttpError(401, 'Please log in to continue');
    if (!roles.includes(req.user.role)) throw new HttpError(403, 'You do not have permission to do that');
    next();
  };
}
