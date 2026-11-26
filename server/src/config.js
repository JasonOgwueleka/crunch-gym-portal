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

  // SEC-01: brute-force protection. Defaults match the requirement; the env
  // variables only exist so testers can shorten the waits.
  loginMaxAttempts: positiveInt('LOGIN_MAX_ATTEMPTS', 5),
  loginWindowMinutes: positiveInt('LOGIN_WINDOW_MINUTES', 15),
  loginLockoutMinutes: positiveInt('LOGIN_LOCKOUT_MINUTES', 15),
  authRateLimitPerMinute: positiveInt('AUTH_RATE_LIMIT_PER_MINUTE', 10),
  // Only trust X-Forwarded-For when the app really runs behind a reverse proxy.
  // Off by default: otherwise any client could fake its IP and dodge the rate limit.
  trustProxy: process.env.TRUST_PROXY ? parseTrustProxy(process.env.TRUST_PROXY) : false,
};

function positiveInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    console.error(`${name} must be a positive whole number (got "${raw}").`);
    process.exit(1);
  }
  return n;
}

function parseTrustProxy(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value); // number of proxy hops
  return value; // e.g. 'loopback' or an IP/subnet list
}
