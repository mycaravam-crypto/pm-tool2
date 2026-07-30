import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  adminAgent,
  app,
  committedAgent,
  db,
  insertProject,
  insertProjectWithLead,
  request,
} from '#server/test/helpers.js';

function daysFromToday(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

test('GET /api/dashboard/summary requires a session', async () => {
  const res = await request(app).get('/api/dashboard/summary');
  assert.equal(res.status, 401);
});

test('GET /api/dashboard/summary: with no accessible projects, everything is zero', async () => {
  const { agent } = await committedAgent(insertProject().id, 'member');
  const res = await agent.get('/api/dashboard/summary?project_ids=999999');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    overdue_action_items: 0,
    open_high_severity_pain_points: 0,
    upcoming_deadlines: 0,
    at_risk_goals: 0,
    unlinked_requirements: 0,
  });
});

test('GET /api/dashboard/summary: counts all five stats correctly for the given projects', async () => {
  const { project } = insertProjectWithLead();
  const event = db
    .prepare("INSERT INTO events (project_id, title, date, type) VALUES (?, 'x', '2026-01-01', 'sync')")
    .run(project.id).lastInsertRowid;
  db.prepare("INSERT INTO action_items (event_id, text, due_date, done) VALUES (?, 'overdue', ?, 0)").run(
    event,
    daysFromToday(-5),
  );
  db.prepare("INSERT INTO pain_points (event_id, text, severity, resolved) VALUES (?, 'x', 'High', 0)").run(event);
  db.prepare("INSERT INTO events (project_id, title, date, type) VALUES (?, 'deadline soon', ?, 'deadline')").run(
    project.id,
    daysFromToday(5),
  );
  db.prepare("INSERT INTO goals (project_id, text, target_date, achieved) VALUES (?, 'goal', ?, 0)").run(
    project.id,
    daysFromToday(3),
  );
  db.prepare("INSERT INTO requirements (project_id, text, goal_id) VALUES (?, 'unlinked req', NULL)").run(project.id);

  const { agent } = await adminAgent();
  const res = await agent.get(`/api/dashboard/summary?project_ids=${project.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.overdue_action_items, 1);
  assert.equal(res.body.open_high_severity_pain_points, 1);
  assert.equal(res.body.upcoming_deadlines, 1);
  assert.equal(res.body.at_risk_goals, 1);
  assert.equal(res.body.unlinked_requirements, 1);
});

test('GET /api/dashboard/summary: with no project_ids, defaults to active projects only', async () => {
  const { agent } = await adminAgent();
  // "No project_ids" scans every active project system-wide, which other
  // tests in this file also create — so this asserts the *delta* a new
  // active project's pain point contributes, not an absolute count.
  const baseline = (await agent.get('/api/dashboard/summary')).body.open_high_severity_pain_points;

  const { project: activeProject } = insertProjectWithLead({ status: 'active' });
  const { project: archivedProject } = insertProjectWithLead({ status: 'archived' });
  const activeEvent = db
    .prepare("INSERT INTO events (project_id, title, date, type) VALUES (?, 'x', '2026-01-01', 'sync')")
    .run(activeProject.id).lastInsertRowid;
  const archivedEvent = db
    .prepare("INSERT INTO events (project_id, title, date, type) VALUES (?, 'x', '2026-01-01', 'sync')")
    .run(archivedProject.id).lastInsertRowid;
  db.prepare("INSERT INTO pain_points (event_id, text, severity, resolved) VALUES (?, 'x', 'High', 0)").run(
    activeEvent,
  );
  db.prepare("INSERT INTO pain_points (event_id, text, severity, resolved) VALUES (?, 'x', 'High', 0)").run(
    archivedEvent,
  );

  const res = await agent.get('/api/dashboard/summary');
  assert.equal(res.status, 200);
  // Only the active project's pain point counts — the archived one contributes nothing.
  assert.equal(res.body.open_high_severity_pain_points, baseline + 1);
});

test('GET /api/dashboard/summary: a non-admin cannot inflate counts by asking for a project they cannot access', async () => {
  const { project: myProject } = insertProjectWithLead();
  const { project: otherProject } = insertProjectWithLead();
  const otherEvent = db
    .prepare("INSERT INTO events (project_id, title, date, type) VALUES (?, 'x', '2026-01-01', 'sync')")
    .run(otherProject.id).lastInsertRowid;
  db.prepare("INSERT INTO pain_points (event_id, text, severity, resolved) VALUES (?, 'x', 'High', 0)").run(otherEvent);

  const { agent } = await committedAgent(myProject.id, 'member');
  const res = await agent.get(`/api/dashboard/summary?project_ids=${myProject.id},${otherProject.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.open_high_severity_pain_points, 0);
});
