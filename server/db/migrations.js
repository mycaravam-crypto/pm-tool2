// Adds columns to tables that may already exist from before this change.
// schema.sql's CREATE TABLE IF NOT EXISTS handles brand-new databases fine, but
// doesn't retrofit columns onto a database that predates them — this does that,
// guarded so it's safe to run on every startup.
function hasColumn(db, table, column) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((c) => c.name === column);
}

export function runMigrations(db) {
  if (!hasColumn(db, 'members', 'email_verified')) {
    db.exec('ALTER TABLE members ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1');
  }
  if (!hasColumn(db, 'notifications', 'project_id')) {
    db.exec('ALTER TABLE notifications ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL');
  }
  if (!hasColumn(db, 'projects', 'original_target_end_date')) {
    db.exec('ALTER TABLE projects ADD COLUMN original_target_end_date TEXT');
    // Backfill from the current value so a database that predates this column doesn't
    // read as "slipped from nothing" — best available proxy for "what it was at creation".
    db.exec('UPDATE projects SET original_target_end_date = target_end_date WHERE original_target_end_date IS NULL');
  }
  if (!hasColumn(db, 'pain_points', 'kind')) {
    db.exec("ALTER TABLE pain_points ADD COLUMN kind TEXT NOT NULL DEFAULT 'issue' CHECK(kind IN ('issue', 'risk'))");
  }
  // event_series is a brand-new table, so schema.sql's CREATE TABLE IF NOT EXISTS
  // already creates it on an existing database with no ALTER needed here — only
  // the new columns on the pre-existing events table need retrofitting.
  if (!hasColumn(db, 'events', 'time')) {
    db.exec('ALTER TABLE events ADD COLUMN time TEXT');
  }
  if (!hasColumn(db, 'events', 'series_id')) {
    db.exec('ALTER TABLE events ADD COLUMN series_id INTEGER REFERENCES event_series(id) ON DELETE CASCADE');
  }
  if (!hasColumn(db, 'events', 'occurrence_index')) {
    db.exec('ALTER TABLE events ADD COLUMN occurrence_index INTEGER');
  }
  // Outside the check above, not inside it: on a brand-new database the column
  // already exists (created directly by schema.sql), so the ALTER is skipped —
  // but the index still needs to be created either way.
  db.exec('CREATE INDEX IF NOT EXISTS idx_notifications_project_id ON notifications(project_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_events_series_id ON events(series_id)');
}
