import assert from 'node:assert/strict';
import { test } from 'node:test';
import { db } from '../db/connection.js';
import { computeScorecard } from './scorecard.js';

const insertProject = db.prepare(`
  INSERT INTO projects (name, status, target_end_date, budget_planned, budget_spent)
  VALUES (?, ?, ?, ?, ?)
`);
const insertEvent = db.prepare(
  "INSERT INTO events (project_id, title, date, type) VALUES (?, 'x', '2026-01-01', 'sync')",
);
const insertPainPoint = db.prepare(
  "INSERT INTO pain_points (event_id, text, severity, resolved) VALUES (?, 'x', ?, ?)",
);
const insertGoal = db.prepare('INSERT INTO goals (project_id, achieved, target_date, text) VALUES (?, ?, ?, ?)');

function daysFromToday(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function makeProject(overrides = {}) {
  const { status = 'active', target_end_date = null, budget_planned = null, budget_spent = 0 } = overrides;
  const id = insertProject.run(
    `Project ${Math.random()}`,
    status,
    target_end_date,
    budget_planned,
    budget_spent,
  ).lastInsertRowid;
  return { id, status, target_end_date, budget_planned, budget_spent };
}
function makeEventFor(projectId) {
  return insertEvent.run(projectId).lastInsertRowid;
}

test('schedule: n/a with no target_end_date', () => {
  const project = makeProject();
  assert.equal(computeScorecard(project).schedule, 'n/a');
});

test('schedule: red when overdue and not completed', () => {
  const project = makeProject({ target_end_date: daysFromToday(-1) });
  assert.equal(computeScorecard(project).schedule, 'red');
});

test('schedule: amber when due within 14 days', () => {
  const project = makeProject({ target_end_date: daysFromToday(5) });
  assert.equal(computeScorecard(project).schedule, 'amber');
});

test('schedule: green when far out', () => {
  const project = makeProject({ target_end_date: daysFromToday(60) });
  assert.equal(computeScorecard(project).schedule, 'green');
});

test('schedule: green when completed, even past the target date', () => {
  const project = makeProject({ status: 'completed', target_end_date: daysFromToday(-30) });
  assert.equal(computeScorecard(project).schedule, 'green');
});

test('cost: n/a with no budget planned', () => {
  const project = makeProject();
  assert.equal(computeScorecard(project).cost, 'n/a');
});

test('cost: green under 90% spent, amber at 90%+, red over 100%', () => {
  assert.equal(computeScorecard(makeProject({ budget_planned: 1000, budget_spent: 500 })).cost, 'green');
  assert.equal(computeScorecard(makeProject({ budget_planned: 1000, budget_spent: 900 })).cost, 'amber');
  assert.equal(computeScorecard(makeProject({ budget_planned: 1000, budget_spent: 1001 })).cost, 'red');
});

test('quality: green with no open high-severity pain points, amber at 1-2, red at 3+', () => {
  const project = makeProject();
  const eventId = makeEventFor(project.id);
  assert.equal(computeScorecard(project).quality, 'green');

  insertPainPoint.run(eventId, 'High', 0);
  assert.equal(computeScorecard(project).quality, 'amber');

  insertPainPoint.run(eventId, 'High', 0);
  insertPainPoint.run(eventId, 'High', 0);
  assert.equal(computeScorecard(project).quality, 'red');
});

test('quality: resolved high-severity pain points do not count', () => {
  const project = makeProject();
  const eventId = makeEventFor(project.id);
  insertPainPoint.run(eventId, 'High', 1);
  assert.equal(computeScorecard(project).quality, 'green');
});

test('quality: low/medium severity pain points do not count', () => {
  const project = makeProject();
  const eventId = makeEventFor(project.id);
  insertPainPoint.run(eventId, 'Low', 0);
  insertPainPoint.run(eventId, 'Medium', 0);
  assert.equal(computeScorecard(project).quality, 'green');
});

test('scope: n/a with no goals', () => {
  const project = makeProject();
  assert.equal(computeScorecard(project).scope, 'n/a');
});

test('scope: red when a goal is overdue and unachieved', () => {
  const project = makeProject();
  insertGoal.run(project.id, 0, daysFromToday(-1), 'goal');
  assert.equal(computeScorecard(project).scope, 'red');
});

test('scope: amber when a goal is due within 14 days', () => {
  const project = makeProject();
  insertGoal.run(project.id, 0, daysFromToday(5), 'goal');
  assert.equal(computeScorecard(project).scope, 'amber');
});

test('scope: green when open goals are far out, and achieved goals never count', () => {
  const project = makeProject();
  insertGoal.run(project.id, 1, daysFromToday(-100), 'achieved but overdue — must not count');
  insertGoal.run(project.id, 0, daysFromToday(60), 'goal');
  assert.equal(computeScorecard(project).scope, 'green');
});
