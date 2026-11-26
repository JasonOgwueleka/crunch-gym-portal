/**
 * SEC-11: encrypt or re-encrypt health questionnaire fields in place.
 *
 *   npm run db:reencrypt-health            (from server/)
 *
 * - Plaintext values (e.g. data saved before SEC-11) are encrypted with the current key.
 * - Values encrypted with an OLD key (listed in HEALTH_DATA_OLD_KEYS) are decrypted
 *   and re-encrypted with the current HEALTH_DATA_KEY: this is the key-rotation step.
 * - Values already using the current key are left alone, so it is safe to re-run.
 * Runs in one transaction; if any value fails its integrity check, nothing is changed.
 */
import { pool, withTransaction } from '../src/db.js';
import {
  loadHealthKeys, currentKeyId, ENCRYPTED_HEALTH_FIELDS, isEncrypted, keyIdOf, encryptField, decryptField,
} from '../src/utils/healthCrypto.js';

try {
  const { currentId, keyIds } = loadHealthKeys();
  console.log(`Current key id: ${currentId}; keys available: ${keyIds.join(', ')}`);
} catch (err) {
  console.error(`Cannot run: ${err.message}`);
  process.exit(1);
}

const stats = { rows: 0, encrypted_plaintext: 0, rotated: 0, unchanged: 0 };
try {
  await withTransaction(async (db) => {
    const { rows } = await db.query(
      `select id, member_id, ${ENCRYPTED_HEALTH_FIELDS.join(', ')} from gym_v1.health_questionnaires for update`,
    );
    for (const row of rows) {
      stats.rows += 1;
      const updates = {};
      for (const f of ENCRYPTED_HEALTH_FIELDS) {
        const v = row[f];
        if (v === null) continue;
        if (!isEncrypted(v)) {
          updates[f] = encryptField(v, row.member_id, f);
          stats.encrypted_plaintext += 1;
        } else if (keyIdOf(v) !== currentKeyId()) {
          updates[f] = encryptField(decryptField(v, row.member_id, f), row.member_id, f);
          stats.rotated += 1;
        } else {
          stats.unchanged += 1;
        }
      }
      const cols = Object.keys(updates);
      if (cols.length) {
        await db.query(
          `update gym_v1.health_questionnaires set ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} where id = $1`,
          [row.id, ...cols.map((c) => updates[c])],
        );
      }
    }
  });
  console.log('Done:', stats);
} catch (err) {
  console.error('Re-encryption failed, nothing was changed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
