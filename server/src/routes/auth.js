import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { query, one, withTransaction } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError, badRequest, requireFields, blankToNull } from '../utils/http.js';
import { audit } from '../utils/audit.js';
import { sendEmail } from '../utils/mailer.js';
import { ACTIVE_MEMBERSHIP_SQL } from '../utils/domain.js';
import { config } from '../config.js';
import { authRateLimit } from '../middleware/rateLimit.js';
import { emailKey, getActiveLock, recordFailure, clearFailures, minutesLeft } from '../utils/loginThrottle.js';

const router = Router();
const MIN_PASSWORD = 6;

// SEC-01: one generic message for every failed login (unknown email or wrong password).
const LOGIN_FAILED_MESSAGE = 'Incorrect email or password';
// SEC-01: bcrypt hash of a random value, cost 10 like real hashes. Used when the
// email has no account so the response takes the same time as a wrong password.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);

function lockedError(lockedUntil) {
  const mins = minutesLeft(lockedUntil);
  return new HttpError(
    423,
    `Too many failed login attempts. This account is locked for ${mins} more minute${mins === 1 ? '' : 's'}.`,
  );
}

export const publicUser = (u) =>
  u && {
    id: u.id,
    email: u.email,
    full_name: u.full_name,
    phone: u.phone,
    date_of_birth: u.date_of_birth,
    role: u.role,
    is_active: u.is_active,
    created_at: u.created_at,
  };

async function currentUserPayload(userId) {
  const user = await one(
    `select u.*, ${ACTIVE_MEMBERSHIP_SQL('u')} as membership_active,
            ta.trainer_id as assigned_trainer_id, t.full_name as assigned_trainer_name
       from gym_v1.users u
       left join gym_v1.trainer_assignments ta on ta.member_id = u.id
       left join gym_v1.users t on t.id = ta.trainer_id
      where u.id = $1`,
    [userId],
  );
  if (!user) return null;
  return {
    ...publicUser(user),
    membership_active: user.membership_active,
    assigned_trainer_id: user.assigned_trainer_id,
    assigned_trainer_name: user.assigned_trainer_name,
  };
}

// Visitor registration: creates a member account and logs them in.
router.post('/register', authRateLimit('register'), async (req, res) => {
  requireFields(req.body, ['email', 'password', 'full_name']);
  const { email, password, full_name, phone, date_of_birth } = req.body;
  if (String(password).length < MIN_PASSWORD) {
    throw badRequest(`Password must be at least ${MIN_PASSWORD} characters`);
  }
  const hash = await bcrypt.hash(String(password), 10);
  const user = await one(
    `insert into gym_v1.users (email, password_hash, full_name, phone, date_of_birth, role)
     values ($1, $2, $3, $4, $5, 'member') returning *`,
    [String(email).trim().toLowerCase(), hash, String(full_name).trim(), blankToNull(phone), blankToNull(date_of_birth)],
  );
  req.session.userId = user.id;
  await audit(req, 'auth.register', 'user', user.id, { email: user.email }, user);
  sendEmail({
    to: user.email,
    subject: 'Welcome to Crunch Gym',
    text: `Hi ${user.full_name},\n\nYour Crunch Gym Portal account is ready. Choose a membership plan to start booking classes.\n\n${config.appUrl}/membership`,
  });
  res.status(201).json({ user: await currentUserPayload(user.id) });
});

router.post('/login', authRateLimit('login'), async (req, res) => {
  requireFields(req.body, ['email', 'password']);
  const key = emailKey(req.body.email);

  // SEC-01 (1): refuse while locked, even with the correct password. Checked
  // before the user lookup so locked real and made-up emails behave the same.
  const activeLock = await getActiveLock(key);
  if (activeLock) {
    await audit(req, 'auth.login_blocked_locked', 'login', key, { email: key, locked_until: activeLock }, null);
    throw lockedError(activeLock);
  }

  const user = await one('select * from gym_v1.users where lower(email) = $1', [key]);
  // SEC-01 (3): always run one bcrypt comparison so timing doesn't reveal whether the email exists.
  const passwordOk = await bcrypt.compare(String(req.body.password), user ? user.password_hash : DUMMY_HASH);
  if (!user || !passwordOk) {
    const { failedCount, lockedUntil, justLocked } = await recordFailure(key);
    await audit(req, 'auth.login_failed', 'user', user?.id ?? null, { email: key, failed_count: failedCount }, null);
    if (justLocked) {
      await audit(req, 'auth.account_locked', 'login', key, {
        email: key,
        locked_until: lockedUntil,
        after_failed_attempts: failedCount,
      }, null);
      throw lockedError(lockedUntil);
    }
    throw new HttpError(401, LOGIN_FAILED_MESSAGE);
  }

  // SEC-01 (5): successful authentication resets the failed-attempt counter.
  await clearFailures(key);
  if (!user.is_active) throw new HttpError(403, 'This account has been deactivated. Please contact the gym.');
  req.session.userId = user.id;
  await query('update gym_v1.users set last_login_at = now() where id = $1', [user.id]);
  await audit(req, 'auth.login', 'user', user.id, null, user);
  res.json({ user: await currentUserPayload(user.id) });
});

router.post('/logout', async (req, res) => {
  if (req.user) await audit(req, 'auth.logout', 'user', req.user.id);
  req.session.destroy(() => {
    res.clearCookie('crunch.sid');
    res.json({ ok: true });
  });
});

router.get('/me', async (req, res) => {
  res.json({ user: req.user ? await currentUserPayload(req.user.id) : null });
});

// Update own profile
router.put('/me', requireAuth, async (req, res) => {
  const { full_name, email, phone, date_of_birth } = req.body || {};
  if (full_name !== undefined && !String(full_name).trim()) throw badRequest('Name cannot be empty');
  if (email !== undefined && !String(email).trim()) throw badRequest('Email cannot be empty');
  await query(
    `update gym_v1.users set
        full_name = coalesce($2, full_name),
        email = coalesce($3, email),
        phone = $4,
        date_of_birth = $5
      where id = $1`,
    [
      req.user.id,
      full_name === undefined ? null : String(full_name).trim(),
      email === undefined ? null : String(email).trim().toLowerCase(),
      phone === undefined ? req.user.phone : blankToNull(phone),
      date_of_birth === undefined ? req.user.date_of_birth : blankToNull(date_of_birth),
    ],
  );
  await audit(req, 'user.update_profile', 'user', req.user.id);
  res.json({ user: await currentUserPayload(req.user.id) });
});

// Delete own account (requires password confirmation)
router.delete('/me', requireAuth, async (req, res) => {
  requireFields(req.body, ['password']);
  const user = await one('select * from gym_v1.users where id = $1', [req.user.id]);
  if (!(await bcrypt.compare(String(req.body.password), user.password_hash))) {
    throw badRequest('Password is incorrect');
  }
  if (user.role === 'admin') {
    const admins = await one(`select count(*)::int as n from gym_v1.users where role = 'admin' and is_active`);
    if (admins.n <= 1) throw badRequest('You are the last admin and cannot delete your account');
  }
  await audit(req, 'user.delete_self', 'user', user.id, { email: user.email });
  await query('delete from gym_v1.users where id = $1', [user.id]);
  req.session.destroy(() => {
    res.clearCookie('crunch.sid');
    res.json({ ok: true });
  });
});

router.post('/change-password', requireAuth, async (req, res) => {
  requireFields(req.body, ['current_password', 'new_password']);
  const user = await one('select * from gym_v1.users where id = $1', [req.user.id]);
  if (!(await bcrypt.compare(String(req.body.current_password), user.password_hash))) {
    throw badRequest('Current password is incorrect');
  }
  if (String(req.body.new_password).length < MIN_PASSWORD) {
    throw badRequest(`Password must be at least ${MIN_PASSWORD} characters`);
  }
  const hash = await bcrypt.hash(String(req.body.new_password), 10);
  await query('update gym_v1.users set password_hash = $2 where id = $1', [user.id, hash]);
  await audit(req, 'auth.change_password', 'user', user.id);
  res.json({ ok: true });
});

router.post('/forgot-password', authRateLimit('forgot-password'), async (req, res) => {
  requireFields(req.body, ['email']);
  const user = await one('select * from gym_v1.users where lower(email) = lower($1) and is_active', [String(req.body.email).trim()]);
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    await query(
      `insert into gym_v1.password_reset_tokens (user_id, token, expires_at)
       values ($1, $2, now() + interval '1 hour')`,
      [user.id, token],
    );
    sendEmail({
      to: user.email,
      subject: 'Reset your Crunch Gym password',
      text: `Hi ${user.full_name},\n\nUse this link to choose a new password (valid for 1 hour):\n${config.appUrl}/reset-password?token=${token}\n\nIf you did not ask for this, you can ignore this email.`,
    });
    await audit(req, 'auth.password_reset_requested', 'user', user.id, null, user);
  }
  res.json({ ok: true, message: 'If an account exists for that email, a reset link has been sent.' });
});

router.post('/reset-password', async (req, res) => {
  requireFields(req.body, ['token', 'password']);
  if (String(req.body.password).length < MIN_PASSWORD) {
    throw badRequest(`Password must be at least ${MIN_PASSWORD} characters`);
  }
  const hash = await bcrypt.hash(String(req.body.password), 10);
  const userId = await withTransaction(async (db) => {
    const { rows } = await db.query(
      `select * from gym_v1.password_reset_tokens
        where token = $1 and used_at is null and expires_at > now() for update`,
      [String(req.body.token)],
    );
    const t = rows[0];
    if (!t) throw badRequest('This reset link is invalid or has expired');
    await db.query('update gym_v1.users set password_hash = $2 where id = $1', [t.user_id, hash]);
    await db.query('update gym_v1.password_reset_tokens set used_at = now() where id = $1', [t.id]);
    return t.user_id;
  });
  const user = await one('select * from gym_v1.users where id = $1', [userId]);
  await audit(req, 'auth.password_reset', 'user', userId, null, user);
  res.json({ ok: true });
});

export default router;
