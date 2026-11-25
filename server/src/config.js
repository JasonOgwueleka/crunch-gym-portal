import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(__dirname, '..');
export const PROJECT_ROOT = path.resolve(SERVER_ROOT, '..');

// Load env files in priority order (dotenv never overwrites a value that is already set,
// so the first file that defines a variable wins): .env.local, then .env, then server/.env.
for (const candidate of [
  path.join(PROJECT_ROOT, '.env.local'),
  path.join(PROJECT_ROOT, '.env'),
  path.join(SERVER_ROOT, '.env'),
]) {
  if (fs.existsSync(candidate)) dotenv.config({ path: candidate });
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

if (!process.env.SESSION_SECRET) {
  console.warn('SESSION_SECRET is not set; using a development default.');
}

export const config = {
  databaseUrl: process.env.DATABASE_URL,
  sessionSecret: process.env.SESSION_SECRET || 'crunch-gym-dev-secret',
  port: Number(process.env.PORT || 4000),
  appUrl: process.env.APP_URL || 'http://localhost:5173',
  // Each version keeps its own upload folder (uploads/gym_v1) so seeding one
  // version never deletes the files another version's database points to.
  uploadDir: path.resolve(SERVER_ROOT, process.env.UPLOAD_DIR || './uploads', 'gym_v1'),
  sessionMaxAgeMs: 1000 * 60 * 60 * 8, // 8 hours
};
