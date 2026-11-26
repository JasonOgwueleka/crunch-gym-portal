/**
 * SEC-11: application-level encryption of health questionnaire text fields.
 *
 * Algorithm: AES-256-GCM (Node's built-in crypto), 96-bit random IV per value,
 * 128-bit authentication tag. Stored format (text column):
 *
 *     enc:v1:<keyId>:<iv base64url>:<tag base64url>:<ciphertext base64url>
 *
 * Additional authenticated data (AAD) binds each ciphertext to its row and
 * column ("gym_v1.health_questionnaires|<member_id>|<field>"), so a value
 * copied into another member's row or another field fails to decrypt.
 *
 * Keys come only from environment variables (never code or the database):
 *   HEALTH_DATA_KEY       current key, 32 bytes as base64 (44 chars) or hex (64 chars)
 *   HEALTH_DATA_KEY_ID    label stored with each value (default "k1")
 *   HEALTH_DATA_OLD_KEYS  optional, for rotation: "k0=<key>,k-1=<key>" (decrypt only)
 */
import crypto from 'node:crypto';
import { audit } from './audit.js';
import { HttpError } from './http.js';

export const ENCRYPTED_HEALTH_FIELDS = [
  'medications',
  'medical_conditions',
  'injuries',
  'emergency_contact_name',
  'emergency_contact_phone',
];

const PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_ID_RE = /^[A-Za-z0-9_-]{1,16}$/;

export class HealthDataIntegrityError extends Error {
  constructor(field, reason) {
    super(`Health data integrity check failed for ${field}: ${reason}`);
    this.field = field;
  }
}

/** Accepts 32 bytes encoded as 64 hex characters or base64 / base64url. */
function parseKey(name, raw) {
  const value = String(raw ?? '').trim();
  if (!value) throw new Error(`${name} is not set`);
  let key;
  if (/^[0-9a-fA-F]{64}$/.test(value)) key = Buffer.from(value, 'hex');
  else if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) key = Buffer.from(value, 'base64');
  if (!key || key.length !== 32) {
    throw new Error(`${name} must be exactly 32 bytes (256 bits), given as 64 hex characters or 44 base64 characters`);
  }
  return key;
}

let keys = null; // { currentId, byId: Map<id, Buffer> }

/**
 * Reads and validates the keys. Throws a clear error if anything is missing or
 * the wrong length; callers (server start-up, seed, re-encrypt script) exit on it.
 */
export function loadHealthKeys(env = process.env) {
  const currentId = (env.HEALTH_DATA_KEY_ID || 'k1').trim();
  if (!KEY_ID_RE.test(currentId)) throw new Error('HEALTH_DATA_KEY_ID may only contain letters, digits, _ and - (max 16)');
  const byId = new Map([[currentId, parseKey('HEALTH_DATA_KEY', env.HEALTH_DATA_KEY)]]);
  for (const entry of String(env.HEALTH_DATA_OLD_KEYS || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const [id, value] = entry.split('=');
    if (!KEY_ID_RE.test(id || '') || byId.has(id)) throw new Error(`HEALTH_DATA_OLD_KEYS has an invalid or duplicate key id: "${id}"`);
    byId.set(id, parseKey(`HEALTH_DATA_OLD_KEYS (${id})`, value));
  }
  keys = { currentId, byId };
  return { currentId, keyIds: [...byId.keys()] };
}

function getKeys() {
  if (!keys) loadHealthKeys();
  return keys;
}

export const currentKeyId = () => getKeys().currentId;

const aad = (memberId, field) => Buffer.from(`gym_v1.health_questionnaires|${memberId}|${field}`, 'utf8');
const b64u = (buf) => buf.toString('base64url');

export const isEncrypted = (value) => typeof value === 'string' && value.startsWith(PREFIX);
export const keyIdOf = (value) => (isEncrypted(value) ? value.slice(PREFIX.length).split(':')[0] : null);

/** Encrypt one value (null/empty stays null). */
export function encryptField(plaintext, memberId, field) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return null;
  const { currentId, byId } = getKeys();
  const iv = crypto.randomBytes(IV_BYTES); // unique random IV for every value
  const cipher = crypto.createCipheriv(ALGORITHM, byId.get(currentId), iv);
  cipher.setAAD(aad(memberId, field));
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${currentId}:${b64u(iv)}:${b64u(tag)}:${b64u(ciphertext)}`;
}

/**
 * Decrypt one value. Anything that is not our ciphertext format, uses an unknown
 * key, or fails the GCM authentication check throws HealthDataIntegrityError:
 * tampered data is never returned as garbage, and plaintext written straight
 * into the column is not trusted either.
 */
export function decryptField(stored, memberId, field) {
  if (stored === null || stored === undefined) return null;
  if (!isEncrypted(stored)) throw new HealthDataIntegrityError(field, 'value is not encrypted');
  const parts = stored.slice(PREFIX.length).split(':');
  if (parts.length !== 4) throw new HealthDataIntegrityError(field, 'malformed ciphertext');
  const [keyId, ivB64, tagB64, ctB64] = parts;
  const key = getKeys().byId.get(keyId);
  if (!key) throw new HealthDataIntegrityError(field, `unknown key id "${keyId}"`);
  try {
    const iv = Buffer.from(ivB64, 'base64url');
    const tag = Buffer.from(tagB64, 'base64url');
    if (iv.length !== IV_BYTES || tag.length !== 16) throw new Error('bad iv/tag length');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: 16 });
    decipher.setAAD(aad(memberId, field));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    throw new HealthDataIntegrityError(field, 'authentication failed (data was modified or the wrong key is set)');
  }
}

/** Values for the encrypted fields of an object that is about to be saved. */
export function encryptHealthFields(obj, memberId) {
  const out = { ...obj };
  for (const f of ENCRYPTED_HEALTH_FIELDS) if (f in out) out[f] = encryptField(out[f], memberId, f);
  return out;
}

/** Decrypted copy of a stored questionnaire row (throws on any integrity failure). */
export function decryptHealthRow(row) {
  if (!row) return row;
  const out = { ...row };
  for (const f of ENCRYPTED_HEALTH_FIELDS) out[f] = decryptField(row[f], row.member_id, f);
  return out;
}

/**
 * For route handlers, AFTER the existing permission checks have passed.
 * strict (single questionnaire): an integrity failure becomes an error response.
 * non-strict (lists / pages with other data): the encrypted fields are blanked,
 * integrity_error is set, and the rest of the response still works.
 * Either way the failure is written to the audit log.
 */
export async function decryptForViewer(req, row, { strict = true } = {}) {
  if (!row) return row;
  try {
    return decryptHealthRow(row);
  } catch (err) {
    if (!(err instanceof HealthDataIntegrityError)) throw err;
    await audit(req, 'security.health_data_integrity_failure', 'health_questionnaire', row.id, {
      member_id: row.member_id,
      field: err.field,
    });
    if (strict) {
      throw new HttpError(
        500,
        'This health questionnaire failed an integrity check (the stored data was changed or cannot be decrypted), so it cannot be shown. Please contact the gym.',
        'HEALTH_DATA_INTEGRITY',
      );
    }
    const out = { ...row, integrity_error: true };
    for (const f of ENCRYPTED_HEALTH_FIELDS) out[f] = null;
    return out;
  }
}
