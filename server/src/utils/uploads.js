import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { fileTypeFromFile } from 'file-type';
import { config } from '../config.js';
import { HttpError } from './http.js';
import { audit } from './audit.js';

/**
 * Uploaded files are stored under UPLOAD_DIR (server/uploads/gym_v1 by default),
 * which is never served statically. Files are only returned through API routes
 * that check who is asking.
 *
 * SEC-10: safe file uploads
 *   - max 5 MB, one file per request
 *   - the real type is detected from the file's content (magic bytes, via the
 *     file-type package); the client's file name and Content-Type are ignored
 *   - only allow-listed types are kept; anything else is deleted at once,
 *     rejected with 400 and written to the audit log
 *   - stored name = random UUID + extension of the DETECTED type
 *   - the original name is sanitised before it is stored (display only)
 *   - downloads: detected Content-Type, nosniff, attachment (inline for images)
 */
export const UPLOAD_SUBDIRS = {
  progressPhotos: 'progress-photos',
  certifications: 'certifications',
};

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // SEC-10 (3)

/** SEC-10 (1): allowed types per upload kind, by detected MIME type -> stored extension. */
export const ALLOWED_TYPES = {
  [UPLOAD_SUBDIRS.progressPhotos]: { 'image/jpeg': 'jpg', 'image/png': 'png' },
  [UPLOAD_SUBDIRS.certifications]: { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' },
};

const ALLOWED_LABEL = {
  [UPLOAD_SUBDIRS.progressPhotos]: 'JPG or PNG images',
  [UPLOAD_SUBDIRS.certifications]: 'PDF, JPG or PNG files',
};

// Every type any upload kind may have; used when serving files.
const SERVABLE_TYPES = new Set(Object.values(ALLOWED_TYPES).flatMap((m) => Object.keys(m)));

for (const sub of Object.values(UPLOAD_SUBDIRS)) {
  fs.mkdirSync(path.join(config.uploadDir, sub), { recursive: true });
}

export function uploader(subdir) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(config.uploadDir, subdir)),
    // Temporary random name with no extension; renamed once the type is verified.
    filename: (req, file, cb) => cb(null, `incoming-${crypto.randomUUID()}`),
  });
  return multer({
    storage,
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 20, fieldSize: 100 * 1024 },
  });
}

/**
 * SEC-10 (4): make the client's file name safe to store and show: no path parts,
 * no control or special characters, limited length.
 */
export function sanitizeOriginalName(name) {
  const base = path.basename(String(name ?? '').replace(/\\/g, '/'));
  const cleaned = base
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, '') // control characters
    .replace(/[^\p{L}\p{N} ._()-]/gu, '_') // anything but letters, digits, space . _ ( ) -
    .replace(/_+/g, '_')
    .replace(/^[.\s]+/, '') // no leading dots (hidden files, "..")
    .trim()
    .slice(0, 100);
  return cleaned || 'upload';
}

/** The display name always ends in the DETECTED type's extension (page.html -> page.png). */
function withExtension(name, ext) {
  const stem = name.replace(/\.[^.]*$/, '') || 'upload';
  return `${stem}.${ext}`;
}

/**
 * Middleware to run straight after `upload.single(field)`. Checks the uploaded
 * file's real type; on success renames it and rewrites req.file so the route
 * stores the verified values; on failure deletes it and responds 400.
 */
export function verifyUpload(subdir) {
  const allowed = ALLOWED_TYPES[subdir];
  return async (req, res, next) => {
    const file = req.file;
    if (!file) return next();

    let detected;
    try {
      detected = await fileTypeFromFile(file.path); // reads the first bytes only
    } catch {
      detected = undefined;
    }
    const ext = detected && allowed[detected.mime];

    if (!ext) {
      await fs.promises.unlink(file.path).catch(() => {}); // SEC-10 (6): delete at once
      await audit(req, 'upload.rejected', 'request', `${req.method} ${req.originalUrl}`, {
        path: req.originalUrl,
        reason: 'file type not allowed',
        detected_type: detected?.mime ?? 'unknown',
        claimed_type: file.mimetype,
        original_name: sanitizeOriginalName(file.originalname),
        size_bytes: file.size,
      });
      throw new HttpError(
        400,
        `This file type is not allowed. Upload ${ALLOWED_LABEL[subdir]} only (max 5 MB). ` +
          `The file's content did not match an allowed type.`,
        'UPLOAD_TYPE_REJECTED',
      );
    }

    const storedName = `${crypto.randomUUID()}.${ext}`;
    const storedPath = path.join(path.dirname(file.path), storedName);
    await fs.promises.rename(file.path, storedPath);
    // If the route later rejects the request (validation, permission or DB error),
    // don't leave the file behind on disk.
    res.on('finish', () => {
      if (res.statusCode >= 400) fs.promises.unlink(storedPath).catch(() => {});
    });
    req.file = {
      ...file,
      filename: storedName,
      path: storedPath,
      mimetype: detected.mime, // detected, not what the client claimed
      originalname: withExtension(sanitizeOriginalName(file.originalname), ext),
    };
    next();
  };
}

export function storedFilePath(subdir, storedName) {
  return path.join(config.uploadDir, subdir, path.basename(storedName));
}

export function removeStoredFile(subdir, storedName) {
  if (!storedName) return;
  fs.promises.unlink(storedFilePath(subdir, storedName)).catch(() => {});
}

/** RFC 6266 / 5987 Content-Disposition value with a safe ASCII fallback name. */
function contentDisposition(type, name) {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** SEC-10 (5): send a stored file with safe headers. */
export function sendStoredFile(res, subdir, row) {
  const filePath = storedFilePath(subdir, row.stored_name);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  // Only ever send one of our allow-listed types; anything else is a download.
  const type = SERVABLE_TYPES.has(row.mime_type) ? row.mime_type : 'application/octet-stream';
  const disposition = type.startsWith('image/') ? 'inline' : 'attachment';
  res.type(type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', contentDisposition(disposition, sanitizeOriginalName(row.original_name || row.stored_name)));
  // Defence in depth: even if a file were rendered, it may not run scripts or load anything.
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox");
  res.setHeader('Cache-Control', 'private, no-store');
  return res.sendFile(filePath);
}
