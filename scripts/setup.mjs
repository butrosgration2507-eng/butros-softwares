// Creates a ready-to-use local .env (safe: generates a fresh random encryption key).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  console.log('.env already exists - leaving it untouched.');
} else {
  let text = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  text = text.replace(/^TOKEN_ENCRYPTION_KEY=.*$/m, `TOKEN_ENCRYPTION_KEY=${crypto.randomBytes(32).toString('base64')}`);
  fs.writeFileSync(envPath, text, { mode: 0o600 });
  console.log('Created .env with a new random TOKEN_ENCRYPTION_KEY.');
}
console.log('\nNext steps:\n  1. npm run create-admin     (create your administrator login)\n  2. npm run dev              (then open http://localhost:5173)\n');
