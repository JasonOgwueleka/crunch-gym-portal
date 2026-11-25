/**
 * Optional alternative to pasting the SQL into the Supabase SQL editor:
 * runs every file in database/migrations in filename order.
 *
 *   npm run db:migrate
 */
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT } from '../src/config.js';
import { pool } from '../src/db.js';

const dir = path.join(PROJECT_ROOT, 'database', 'migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

try {
  for (const file of files) {
    process.stdout.write(`Running ${file} ... `);
    await pool.query(fs.readFileSync(path.join(dir, file), 'utf8'));
    console.log('done');
  }
  console.log('All migrations applied.');
} catch (err) {
  console.error('\nMigration failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
