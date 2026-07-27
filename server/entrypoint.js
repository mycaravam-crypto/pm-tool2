import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Docker entrypoint, run directly by `node` (see Dockerfile) — the distroless
// runtime image it replaces docker-entrypoint.sh for has no shell, so this
// logic has to live in JS rather than a `#!/usr/bin/env sh` script.
//
// Schema creation and migrations already happen automatically inside the app
// itself on every startup (db/connection.js runs both unconditionally,
// guarded so they're safe to re-run) — this only covers what that doesn't:
// optionally seeding demo data the first time the app ever starts against a
// given volume. The existence check has to happen before anything imports
// db/connection.js, since that module creates the (empty) database file as a
// side effect of opening it.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbFile = path.join(__dirname, 'data', 'chronos.db');
const isFirstStartup = !fs.existsSync(dbFile);

if (isFirstStartup) {
  console.log(`entrypoint: no database found at ${dbFile} — first startup on this volume.`);
  if (process.env.SEED_DEMO_DATA === 'true') {
    console.log('entrypoint: SEED_DEMO_DATA=true, seeding demo data...');
    await import('./db/seed.js');
  }
}

await import('./index.js');
