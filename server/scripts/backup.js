// Snapshots the live SQLite database to a timestamped file in the same data
// directory, using better-sqlite3's own .backup() (safe to run against a
// database that's being written to concurrently, unlike a raw file copy).
// This only produces a local snapshot — copying it off-box on a schedule
// (cron + rsync/S3/etc, depending on where this is deployed) is still on you.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db/connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dest = path.join(dataDir, `backup-${stamp}.db`);

await db.backup(dest);
console.log(`Backed up to ${dest}`);
