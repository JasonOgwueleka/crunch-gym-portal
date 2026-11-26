import { audit } from './audit.js';

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    if (code) this.code = code; // optional machine-readable reason for the client
  }
}

export const badRequest = (msg) => new HttpError(400, msg);
export const notFound = (msg = 'Not found') => new HttpError(404, msg);
export const forbidden = (msg = 'You do not have permission to do that') => new HttpError(403, msg);
export const conflict = (msg) => new HttpError(409, msg);

/** Throw 400 if any of the named fields is missing or blank. */
export function requireFields(body, fields) {
  const missing = fields.filter((f) => {
    const v = body?.[f];
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  });
  if (missing.length) throw badRequest(`Missing required field(s): ${missing.join(', ')}`);
}

/** Turn '' into null; leave everything else alone. */
export const blankToNull = (v) => (v === '' || v === undefined ? null : v);

export function toInt(value, name = 'id') {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) throw badRequest(`Invalid ${name}`);
  return n;
}

/**
 * Build "col = $n" fragments for a partial update from an allow-list of columns.
 * Returns { sets, values } where values continues from startIndex.
 */
export function buildUpdate(body, allowed, startIndex = 1) {
  const sets = [];
  const values = [];
  for (const col of allowed) {
    if (Object.prototype.hasOwnProperty.call(body || {}, col)) {
      values.push(blankToNull(body[col]));
      sets.push(`${col} = $${startIndex + values.length - 1}`);
    }
  }
  return { sets, values };
}

/** Express error handler: maps HttpError and common Postgres errors to JSON. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    // SEC-12 (1): record every "access denied". CSRF rejections are already
    // logged (with more detail) by the CSRF middleware.
    if (err.status === 403 && err.code !== 'CSRF_INVALID') {
      void audit(req, 'security.access_denied', 'request', `${req.method} ${req.originalUrl}`, {
        method: req.method,
        path: req.originalUrl,
        reason: err.message,
      });
    }
    return res.status(err.status).json(err.code ? { error: err.message, code: err.code } : { error: err.message });
  }
  if (err?.name === 'MulterError') {
    // SEC-12 (1): record rejected uploads (multer removes the partial file itself).
    void audit(req, 'upload.rejected', 'request', `${req.method} ${req.originalUrl}`, {
      path: req.originalUrl,
      reason: err.code,
      field: err.field ?? null,
    });
    return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : 'The upload was rejected' });
  }
  switch (err?.code) {
    case '23505':
      return res.status(409).json({ error: 'A record with those details already exists' });
    case '23503':
      return res.status(409).json({ error: 'This record is linked to other records and cannot be changed or removed' });
    case '23514':
    case '23502':
    case '22P02':
    case '22007':
    case '22008':
    case '22003':
      return res.status(400).json({ error: 'Some of the values provided are not valid' });
    default:
      break;
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }
  console.error(err);
  return res.status(500).json({ error: 'Something went wrong on the server' });
}
