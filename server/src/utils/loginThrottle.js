/**
 * SEC-01: persistent per-account login lockout.
 *
 * State lives in gym_v1.login_throttle (not memory), so a lockout survives a
 * server restart. Rows are keyed by the normalised email that was typed in,
 * whether or not an account exists, so locking behaves identically for real
 * and made-up emails (no user enumeration through the lockout).
 *
 * Rules (defaults, see config.js):
 *   - 5 failed attempts within a 15-minute window  -> locked for 15 minutes
 *   - while locked, every attempt is refused, even with the correct password
 *   - a successful login deletes the row (counter reset)
 */
import { query, one } from '../db.js';
import { config } from '../config.js';

export function emailKey(email) {
  return String(email ?? '').trim().toLowerCase();
}

/** Returns the lock expiry (Date) if this identifier is currently locked, otherwise null. */
export async function getActiveLock(key) {
  const row = await one(
    'select locked_until from gym_v1.login_throttle where email_key = $1 and locked_until > now()',
    [key],
  );
  return row ? row.locked_until : null;
}

/**
 * Records one failed attempt atomically (a single upsert, so parallel requests
 * cannot lose counts). Starts a new window if the previous one has expired.
 * Returns { failedCount, lockedUntil, justLocked }.
 */
export async function recordFailure(key) {
  const { rows } = await query(
    `insert into gym_v1.login_throttle as t (email_key, failed_count, window_started_at, updated_at)
          values ($1, 1, now(), now())
     on conflict (email_key) do update set
          failed_count = case
              when t.window_started_at < now() - make_interval(mins => $2) then 1
              else t.failed_count + 1 end,
          window_started_at = case
              when t.window_started_at < now() - make_interval(mins => $2) then now()
              else t.window_started_at end,
          updated_at = now()
     returning failed_count, window_started_at`,
    [key, config.loginWindowMinutes],
  );
  const failedCount = rows[0].failed_count;

  if (failedCount >= config.loginMaxAttempts) {
    // Lock and start a fresh counting window for after the lock expires.
    const locked = await one(
      `update gym_v1.login_throttle
          set locked_until = now() + make_interval(mins => $2),
              failed_count = 0,
              window_started_at = now() + make_interval(mins => $2),
              updated_at = now()
        where email_key = $1
        returning locked_until`,
      [key, config.loginLockoutMinutes],
    );
    return { failedCount, lockedUntil: locked.locked_until, justLocked: true };
  }
  return { failedCount, lockedUntil: null, justLocked: false };
}

/** Successful login: reset the counter. */
export async function clearFailures(key) {
  await query('delete from gym_v1.login_throttle where email_key = $1', [key]);
}

/** Minutes left on a lock, rounded up (for the user-facing message). */
export function minutesLeft(lockedUntil) {
  return Math.max(1, Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 60000));
}
