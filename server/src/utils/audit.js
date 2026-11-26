import { query } from '../db.js';

/**
 * SEC-12 (5): nothing secret or medical may reach the audit log. Any detail key
 * that looks like a password, token, secret, card data or health information is
 * replaced with "[redacted]", at any depth. This is applied to every call, so it
 * also covers routes that log a whole request body.
 */
const SENSITIVE_KEY = new RegExp(
  [
    'pass(word)?', 'pwd', 'token', 'secret', 'csrf', 'cookie', 'authori[sz]ation', 'api[_-]?key',
    '^sid$', 'session_?id', // session identifiers (but not counters like sessions_ended)
    'card_?(number|num|no)$', '^pan$', 'cvc', 'cvv', 'expiry', // full card data (brand/last4 are fine)
    'medic', 'health', 'injur', 'condition', 'pregnan', 'heart', 'chest', 'dizz', 'bone', 'joint',
    'smoker', 'emergency', 'fitness_goal',
  ].join('|'),
  'i',
);

export function redact(value, depth = 0) {
  if (value === null || typeof value !== 'object' || depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : redact(v, depth + 1);
  }
  return out;
}

/**
 * Record an action in the audit log. Failures are logged but never break the request.
 * `actor` defaults to the logged-in user.
 *
 * SEC-12: the row's hash (chain_seq, prev_hash, entry_hash) is computed by a
 * database trigger under a lock, so concurrent calls cannot break the chain.
 * Rows can only ever be inserted, never updated or deleted.
 */
export async function audit(req, action, entityType, entityId, details = null, actor = req?.user) {
  try {
    await query(
      `insert into gym_v1.audit_logs
         (actor_id, actor_email, actor_role, action, entity_type, entity_id, details, ip_address)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        actor?.id ?? null,
        actor?.email ?? null,
        actor?.role ?? null,
        action,
        entityType ?? null,
        entityId == null ? null : String(entityId),
        details ? JSON.stringify(redact(details)) : null,
        req?.ip ?? null,
      ],
    );
  } catch (err) {
    console.error('Failed to write audit log', err);
  }
}
