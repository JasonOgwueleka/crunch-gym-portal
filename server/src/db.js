import pg from 'pg';
import { config } from './config.js';

// Return numeric columns as JS numbers, bigint counts as numbers,
// and DATE columns as plain 'YYYY-MM-DD' strings (avoids timezone shifts).
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));
pg.types.setTypeParser(1082, (v) => v);

/**
 * Supabase requires SSL. A `sslmode=...` query parameter would override the
 * ssl option below (and enable strict CA checks against Supabase's own CA),
 * so it is stripped and SSL is configured here instead.
 */
function buildPoolConfig(url) {
  const parsed = new URL(url);
  parsed.searchParams.delete('sslmode');
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  return {
    connectionString: parsed.toString(),
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30_000,
  };
}

export const pool = new pg.Pool(buildPoolConfig(config.databaseUrl));

pool.on('error', (err) => {
  console.error('Unexpected Postgres pool error', err);
});

export function query(text, params) {
  return pool.query(text, params);
}

export async function one(text, params) {
  const { rows } = await pool.query(text, params);
  return rows[0] || null;
}

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
