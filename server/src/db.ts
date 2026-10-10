import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));

export type QueryResult<T = any> = { rows: T[]; rowCount: number };
export interface Queryable {
  query<T = any>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  /** Run one or more statements without parameters (used by migrations). */
  exec(sql: string): Promise<void>;
}
export interface Db extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

function normalizeValue(v: unknown): unknown {
  if (typeof v === 'bigint') return Number(v);
  if (v instanceof Uint8Array && !Buffer.isBuffer(v)) return Buffer.from(v);
  return v;
}
function normalizeRows<T>(rows: any[]): T[] {
  return rows.map((r) => {
    const o: any = {};
    for (const k of Object.keys(r)) o[k] = normalizeValue(r[k]);
    return o;
  });
}

function wrapPg(c: pg.Pool | pg.PoolClient): Queryable {
  return {
    async query(sql, params) {
      const r = await c.query(sql, params as any[]);
      return { rows: normalizeRows(r.rows), rowCount: r.rowCount ?? 0 };
    },
    async exec(sql) {
      await c.query(sql);
    },
  };
}

export function createPgDb(connectionString: string): Db {
  // int8 (bigint) -> JS number. File sizes stay far below 2^53.
  pg.types.setTypeParser(20, (v: string) => Number(v));
  const pool = new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 15_000 });
  pool.on('error', (e) => console.error('Postgres pool error:', e.message));
  const base = wrapPg(pool);
  return {
    ...base,
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn(wrapPg(client));
        await client.query('COMMIT');
        return out;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

/** Embedded Postgres (WASM). Used for tests and zero-install local development. */
export async function createPgliteDb(location: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  if (location !== 'memory://') fs.mkdirSync(location, { recursive: true });
  const lite = new PGlite(location);
  await lite.waitReady;
  const wrap = (c: any): Queryable => ({
    async query(sql, params) {
      const r = await c.query(sql, params as any[]);
      return { rows: normalizeRows(r.rows), rowCount: Math.max(r.affectedRows ?? 0, r.rows.length) };
    },
    async exec(sql) {
      await c.exec(sql);
    },
  });
  return {
    ...wrap(lite),
    tx: (fn) => lite.transaction((t) => fn(wrap(t))),
    close: () => lite.close(),
  };
}

export async function openDb(url: string): Promise<Db> {
  if (url.startsWith('pglite:')) {
    const loc = url.slice('pglite:'.length);
    // relative paths are resolved from the project root so every command uses the same local database
    return createPgliteDb(loc === 'memory' ? 'memory://' : path.resolve(path.resolve(here, '../..'), loc));
  }
  return createPgDb(url);
}

export const MIGRATIONS_DIR = path.resolve(here, '../migrations');

export async function runMigrations(db: Db, dir = MIGRATIONS_DIR): Promise<string[]> {
  await db.exec(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
  const applied = new Set((await db.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const ran: string[] = [];
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    await db.tx(async (q) => {
      await q.exec(sql);
      await q.query('insert into schema_migrations(name) values ($1)', [f]);
    });
    ran.push(f);
  }
  return ran;
}
