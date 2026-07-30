import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { runMigrations } from '#server/db/migrations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Overridable so tests can point at an isolated ':memory:' database instead
// of the real server/data/chronos.db — see server/test/setup.js.
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'chronos.db');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);
runMigrations(db);
