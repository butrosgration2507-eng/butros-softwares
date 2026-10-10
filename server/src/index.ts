import './loadEnv.js';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb, runMigrations } from './db.js';
import { createGoogleGateway } from './google.js';

async function main() {
  const config = loadConfig();
  const db = await openDb(config.databaseUrl);
  const ran = await runMigrations(db); // safe to run on every start: only applies new migrations
  if (ran.length) console.log(`Applied migrations: ${ran.join(', ')}`);
  const google = createGoogleGateway(config);
  const app = createApp({ db, config, google });
  const server = app.listen(config.port, () => {
    console.log(`${config.siteName} listening on port ${config.port} (${config.nodeEnv})`);
    if (!google.isConfigured()) console.log('Note: Google OAuth is not configured yet - Storage Manager will show setup instructions.');
  });
  const stop = () => server.close(() => void db.close().then(() => process.exit(0)));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
