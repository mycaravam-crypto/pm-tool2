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
  if (!hasColumn(db, 'requirements', 'goal_id')) {
    db.exec('ALTER TABLE requirements ADD COLUMN goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL');
  }
  // 'decision' was removed as an event type (it collided with the unrelated
  // decisions log, and was folded into 'review'). SQLite can't alter an existing
  // CHECK constraint, so a pre-existing database's events table still technically
  // allows the old value at the SQL level — the app just never writes it anymore,
  // and this backfills any row that already had it so the UI doesn't hit an
  // undefined EVENT_TYPES lookup for a type it no longer recognizes.
  db.exec("UPDATE events SET type = 'review' WHERE type = 'decision'");
  // Outside the check above, not inside it: on a brand-new database the column
  // already exists (created directly by schema.sql), so the ALTER is skipped —
  // but the index still needs to be created either way.
  db.exec('CREATE INDEX IF NOT EXISTS idx_notifications_project_id ON notifications(project_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_events_series_id ON events(series_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_requirements_goal_id ON requirements(goal_id)');
}
