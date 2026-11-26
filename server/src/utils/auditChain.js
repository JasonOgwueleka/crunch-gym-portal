/**
 * SEC-12: verify the audit log hash chain.
 *
 * Hashes are written by the database trigger in
 * database/migrations/003_audit_log_hash_chain.sql. Verification is done here,
 * in Node.js, from the raw column values, so it does not trust the database's
 * own hash function: for every row (in chain order) we rebuild the exact text
 * that was hashed, recompute SHA-256 and check that
 *   - chain_seq has no gaps (no row removed or inserted out of order),
 *   - prev_hash equals the previous row's entry_hash (links intact),
 *   - entry_hash equals our recomputed hash (row content unchanged).
 */
import crypto from 'node:crypto';
import { pool } from '../db.js';

export const GENESIS_HASH = '0'.repeat(64);
const SEP = '\x1f'; // ASCII unit separator, same as chr(31) in SQL
const NUL = '\\N'; // how NULL is written in the hashed text
const BATCH = 1000;

const orNull = (v) => (v === null || v === undefined ? NUL : String(v));

/** Same field order and formatting as gym_v1.audit_log_canonical(). */
export function canonical(row) {
  return [
    row.prev_hash,
    row.chain_seq_text,
    String(row.id),
    row.created_utc,
    orNull(row.actor_id),
    orNull(row.actor_email),
    orNull(row.actor_role),
    orNull(row.action),
    orNull(row.entity_type),
    orNull(row.entity_id),
    orNull(row.details_text),
    orNull(row.ip_address),
  ].join(SEP);
}

export const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

/**
 * Walks the whole chain in batches. Returns
 *   { intact, total_entries, checked_entries, first_broken_id, first_broken_seq, reason, checked_at }
 */
export async function verifyAuditChain() {
  const result = {
    intact: true,
    total_entries: 0,
    checked_entries: 0,
    first_broken_id: null,
    first_broken_seq: null,
    reason: null,
    checked_at: new Date().toISOString(),
  };

  let expectedPrev = GENESIS_HASH;
  let expectedSeq = 1;
  let lastSeq = 0;

  // Raw values straight from the table (ids and seq as text to avoid any
  // number conversion; details as Postgres' own jsonb text).
  const sql = `
    select a.id::text as id, a.chain_seq::text as chain_seq_text, a.prev_hash, a.entry_hash,
           to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_utc,
           a.actor_id::text as actor_id, a.actor_email, a.actor_role, a.action, a.entity_type, a.entity_id,
           a.details::text as details_text, a.ip_address
      from gym_v1.audit_logs a
     where a.chain_seq > $1
     order by a.chain_seq  -- numeric order (the table column, not the text copy)
     limit ${BATCH}`;

  for (;;) {
    const { rows } = await pool.query(sql, [lastSeq]);
    if (!rows.length) break;
    for (const row of rows) {
      result.checked_entries += 1;
      let reason = null;
      if (Number(row.chain_seq_text) !== expectedSeq) {
        reason = `Sequence gap: expected entry #${expectedSeq} but found #${row.chain_seq_text} (an entry was removed or inserted)`;
      } else if (row.prev_hash !== expectedPrev) {
        reason = 'Link broken: prev_hash does not match the previous entry (an entry before this one was changed, removed or reordered)';
      } else if (sha256(canonical(row)) !== row.entry_hash) {
        reason = 'Content changed: this entry no longer matches its stored hash';
      }
      if (reason) {
        result.intact = false;
        result.first_broken_id = Number(row.id);
        result.first_broken_seq = Number(row.chain_seq_text);
        result.reason = reason;
        break;
      }
      expectedPrev = row.entry_hash;
      expectedSeq += 1;
    }
    if (!result.intact) break;
    lastSeq = Number(rows[rows.length - 1].chain_seq_text);
  }

  const { rows } = await pool.query('select count(*)::int as n from gym_v1.audit_logs');
  result.total_entries = rows[0].n;
  return result;
}
