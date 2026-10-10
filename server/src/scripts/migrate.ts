import '../loadEnv.js';
import { openDb, runMigrations } from '../db.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Run "npm run setup" or edit your .env file.');
  process.exit(1);
}
const db = await openDb(url);
const ran = await runMigrations(db);
console.log(ran.length ? `Applied: ${ran.join(', ')}` : 'Database is already up to date.');
await db.close();
