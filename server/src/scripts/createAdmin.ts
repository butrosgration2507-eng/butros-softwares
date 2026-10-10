import '../loadEnv.js';
import readline from 'node:readline';
import { Writable } from 'node:stream';
import { hashPassword } from '../crypto.js';
import { openDb, runMigrations } from '../db.js';

function ask(question: string, hidden = false): Promise<string> {
  let muted = false;
  const out = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = readline.createInterface({ input: process.stdin, output: out, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (a) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(a);
    });
    muted = hidden;
  });
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Run "npm run setup" or edit your .env file.');
  process.exit(1);
}
const reset = process.argv.includes('--reset-password');
const email = (process.env.ADMIN_EMAIL || (await ask('Administrator email: '))).trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('That does not look like an email address.');
  process.exit(1);
}
const password = process.env.ADMIN_PASSWORD || (await ask('Password (at least 12 characters, hidden): ', true));
if (password.length < 12) {
  console.error('Password must be at least 12 characters.');
  process.exit(1);
}
if (!process.env.ADMIN_PASSWORD) {
  const again = await ask('Repeat password: ', true);
  if (again !== password) {
    console.error('Passwords did not match.');
    process.exit(1);
  }
}
const db = await openDb(url);
await runMigrations(db);
const existing = await db.query('select id from admins where email=$1', [email]);
const hash = await hashPassword(password);
if (existing.rowCount && !reset) {
  console.error('An administrator with that email already exists. Use --reset-password to change the password.');
  await db.close();
  process.exit(1);
}
if (existing.rowCount) {
  await db.query('update admins set password_hash=$2, failed_attempts=0, locked_until=null, updated_at=now() where email=$1', [email, hash]);
  await db.query('delete from sessions where admin_id=(select id from admins where email=$1)', [email]);
  await db.query(`insert into audit_logs(admin_email, action, entity_type) values ($1,'admin.password_reset','admin')`, [email]);
  console.log(`Password updated for ${email}. Existing sessions were signed out.`);
} else {
  const r = await db.query<{ id: string }>('insert into admins(email, password_hash) values ($1,$2) returning id', [email, hash]);
  await db.query(`insert into audit_logs(admin_id, admin_email, action, entity_type, entity_id) values ($1,$2,'admin.create','admin',$1::text)`, [r.rows[0].id, email]);
  console.log(`Administrator created: ${email}. You can sign in at /admin.`);
}
await db.close();
