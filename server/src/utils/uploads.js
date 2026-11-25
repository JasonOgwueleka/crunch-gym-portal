import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { config } from '../config.js';

/**
 * Uploaded files are stored under UPLOAD_DIR (server/uploads by default), which is
 * never served statically. Files are only returned through API routes that check
 * who is asking.
 */
export const UPLOAD_SUBDIRS = {
  progressPhotos: 'progress-photos',
  certifications: 'certifications',
};

for (const sub of Object.values(UPLOAD_SUBDIRS)) {
  fs.mkdirSync(path.join(config.uploadDir, sub), { recursive: true });
}

export function uploader(subdir) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(config.uploadDir, subdir)),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  });
  return multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
}

export function storedFilePath(subdir, storedName) {
  return path.join(config.uploadDir, subdir, storedName);
}

export function removeStoredFile(subdir, storedName) {
  if (!storedName) return;
  fs.promises.unlink(storedFilePath(subdir, storedName)).catch(() => {});
}

export function sendStoredFile(res, subdir, row) {
  const filePath = storedFilePath(subdir, row.stored_name);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  if (row.mime_type) res.type(row.mime_type);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.original_name || row.stored_name)}"`);
  return res.sendFile(filePath);
}
