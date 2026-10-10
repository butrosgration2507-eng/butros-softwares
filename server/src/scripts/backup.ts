import '../loadEnv.js';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../db.js';

// Metadata backup. Excluded on purpose: administrator accounts, sessions and encrypted Google tokens.
// (After a restore you create the admin again and re-authorize each Google account.)
export const BACKUP_TABLES: { table: string; strip?: string[] }[] = [
  { table: 'categories' },
  { table: 'media' },
  { table: 'drive_accounts', strip: ['encrypted_refresh_token'] },
  { table: 'software' },
  { table: 'software_versions' },
  { table: 'software_files' },
  { table: 'download_events' },
  { table: 'audit_logs', strip: ['admin_id'] },
  { table: 'site_settings' },
];

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}
const db = await openDb(url);
const data: Record<string, unknown> = {};
for (const t of BACKUP_TABLES) {
  const expr = t.strip?.length ? `to_jsonb(t) ${t.strip.map((c) => `- '${c}'`).join(' ')}` : 'to_jsonb(t)';
  const r = await db.query<{ rows: unknown }>(`select coalesce(jsonb_agg(${expr}), '[]'::jsonb) as rows from ${t.table} t`);
  data[t.table] = r.rows[0].rows;
}
const dir = path.resolve(process.cwd(), process.env.BACKUP_DIR || '../backups');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `butros-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(file, JSON.stringify({ format: 'butros-backup-v1', createdAt: new Date().toISOString(), data }));
console.log(`Backup written to ${file}`);
await db.close();
