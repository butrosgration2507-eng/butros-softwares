import '../loadEnv.js';
import fs from 'node:fs';
import { openDb, runMigrations } from '../db.js';

const tables = ['categories', 'media', 'drive_accounts', 'software', 'software_versions', 'software_files', 'download_events', 'audit_logs', 'site_settings'];
const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
const force = process.argv.includes('--force');
const url = process.env.DATABASE_URL;
if (!url || !file) {
  console.error('Usage: npm run restore -- <backup-file.json> [--force]\n(--force wipes existing catalogue data first)');
  process.exit(1);
}
const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
if (backup.format !== 'butros-backup-v1') {
  console.error('This is not a BUTROS backup file.');
  process.exit(1);
}
const db = await openDb(url);
await runMigrations(db);
const existing = (await db.query<{ n: number }>('select (select count(*) from software)::int + (select count(*) from drive_accounts)::int as n')).rows[0].n;
if (existing > 0 && !force) {
  console.error('The database already contains data. Re-run with --force to replace it.');
  await db.close();
  process.exit(1);
}
await db.tx(async (q) => {
  if (force) await q.exec('truncate table download_events, software_files, software_versions, software, drive_accounts, media, categories, site_settings, audit_logs cascade');
  for (const t of tables) {
    const rows = backup.data[t] ?? [];
    if (!rows.length) continue;
    await q.query(`insert into ${t} select * from jsonb_populate_recordset(null::${t}, $1::jsonb)`, [JSON.stringify(rows)]);
  }
  await q.exec(`update drive_accounts set status='needs_reauth', last_error='Restored from backup: reauthorize this account.' where status='connected'`);
});
console.log('Restore complete. Next: run "npm run create-admin", sign in, and reauthorize each Google account in Storage Manager.');
await db.close();
