import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Loads the project's .env file (if any). Variables already set by the host (e.g. Render) always win.
const here = path.dirname(fileURLToPath(import.meta.url));
for (const p of [path.resolve(here, '../../.env'), path.resolve(process.cwd(), '.env')]) {
  if (fs.existsSync(p)) {
    try {
      process.loadEnvFile(p);
    } catch {
      /* ignore */
    }
  }
}
