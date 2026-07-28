import assert from 'node:assert/strict';
import { test } from 'node:test';
import { db } from './connection.js';
import { runMigrations } from './migrations.js';

// connection.js already runs schema.sql + runMigrations once at import time
// (against this test's isolated ':memory:' database — see test/setup.js).
// The real regression this guards against: someone adds a migration without
// an idempotency guard (a bare ALTER TABLE with no hasColumn() check, or a
// CREATE INDEX without IF NOT EXISTS) — safe on a brand-new database that
// hits it once, but breaks every subsequent app restart, since
// runMigrations runs unconditionally on every boot (see db/connection.js).
test('runMigrations is safe to run again against an already-migrated database', () => {
  assert.doesNotThrow(() => runMigrations(db));
  assert.doesNotThrow(() => runMigrations(db));
});

function columns(table) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((c) => c.name);
}

test('runMigrations: expected columns exist after migrating', () => {
  assert.ok(columns('members').includes('email_verified'));
  assert.ok(columns('members').includes('notify_status_report'));
  assert.ok(columns('notifications').includes('project_id'));
  assert.ok(columns('projects').includes('original_target_end_date'));
  assert.ok(columns('projects').includes('original_budget_planned'));
  assert.ok(columns('pain_points').includes('kind'));
  assert.ok(columns('events').includes('time'));
  assert.ok(columns('events').includes('series_id'));
  assert.ok(columns('events').includes('occurrence_index'));
  assert.ok(columns('requirements').includes('goal_id'));
});

test('runMigrations: notifications.type CHECK includes status_report', () => {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'notifications'").get();
  assert.match(row.sql, /status_report/);
});

test('runMigrations: expected indexes exist', () => {
  const indexes = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
    .all()
    .map((r) => r.name);
  assert.ok(indexes.includes('idx_notifications_project_id'));
  assert.ok(indexes.includes('idx_events_series_id'));
  assert.ok(indexes.includes('idx_requirements_goal_id'));
});

// Not covered here: the `UPDATE events SET type = 'review' WHERE type =
// 'decision'` backfill. schema.sql's current CHECK constraint already
// rejects 'decision' on insert, so the historical scenario it backfills (a
// database created before that CHECK was tightened) can't be reproduced
// against a fresh in-memory test database.
