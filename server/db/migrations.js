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
    db.exec('CREATE INDEX IF NOT EXISTS idx_notifications_project_id ON notifications(project_id)');
  }
}
