import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  adminAgent,
  app,
  assignStakeholder,
  authedAgent,
  db,
  insertProject,
  insertStakeholder,
  request,
} from '../test/helpers.js';

test('GET /api/stakeholders requires a session', async () => {
  const res = await request(app).get('/api/stakeholders');
  assert.equal(res.status, 401);
});

test('GET /api/stakeholders requires admin', async () => {
  const { agent } = await authedAgent({ role: 'member' });
  const res = await agent.get('/api/stakeholders');
  assert.equal(res.status, 403);
});

test('stakeholders: full CRUD as admin', async () => {
  const { agent } = await adminAgent();

  const create = await agent
    .post('/api/stakeholders')
    .send({ name: 'Ada Lovelace', email: 'ada@example.com', role: 'Engineer' });
  assert.equal(create.status, 201);
  assert.equal(create.body.name, 'Ada Lovelace');
  const id = create.body.id;

  const update = await agent.put(`/api/stakeholders/${id}`).send({ role: 'Staff Engineer' });
  assert.equal(update.status, 200);
  assert.equal(update.body.role, 'Staff Engineer');
  assert.equal(update.body.name, 'Ada Lovelace'); // untouched fields preserved

  const list = await agent.get('/api/stakeholders');
  assert.equal(list.status, 200);
  assert.ok(list.body.some((s) => s.id === id));

  const del = await agent.delete(`/api/stakeholders/${id}`);
  assert.equal(del.status, 204);

  const updateAfterDelete = await agent.put(`/api/stakeholders/${id}`).send({ name: 'x' });
  assert.equal(updateAfterDelete.status, 404);
});

test('POST /api/stakeholders requires a name', async () => {
  const { agent } = await adminAgent();
  const res = await agent.post('/api/stakeholders').send({ email: 'noname@example.com' });
  assert.equal(res.status, 400);
});

test('stakeholders: duplicate email rejected on create and update', async () => {
  const { agent } = await adminAgent();
  await agent.post('/api/stakeholders').send({ name: 'A', email: 'dup@example.com' });
  const second = await agent.post('/api/stakeholders').send({ name: 'B', email: 'dup@example.com' });
  assert.equal(second.status, 400);

  const c = await agent.post('/api/stakeholders').send({ name: 'C', email: 'unique-c@example.com' });
  const updateToDup = await agent.put(`/api/stakeholders/${c.body.id}`).send({ email: 'dup@example.com' });
  assert.equal(updateToDup.status, 400);
});

test('DELETE /api/stakeholders/:id is blocked while still leading a project', async () => {
  const { agent } = await adminAgent();
  const lead = insertStakeholder();
  const project = insertProject();
  assignStakeholder(project.id, lead.id, 'lead');

  const res = await agent.delete(`/api/stakeholders/${lead.id}`);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /reassign the lead/);

  // Confirm it genuinely wasn't deleted.
  const still = db.prepare('SELECT id FROM stakeholders WHERE id = ?').get(lead.id);
  assert.ok(still);
});

test('DELETE /api/stakeholders/:id succeeds for a non-lead stakeholder', async () => {
  const { agent } = await adminAgent();
  const member = insertStakeholder();
  const project = insertProject();
  assignStakeholder(project.id, member.id, 'member');

  const res = await agent.delete(`/api/stakeholders/${member.id}`);
  assert.equal(res.status, 204);
});

test('GET /api/stakeholders: workload/overload signal', async () => {
  const { agent } = await adminAgent();

  // Overloaded via 2+ active leads.
  const busyLead = insertStakeholder();
  const projectA = insertProject({ status: 'active' });
  const projectB = insertProject({ status: 'active' });
  assignStakeholder(projectA.id, busyLead.id, 'lead');
  assignStakeholder(projectB.id, busyLead.id, 'lead');

  // Not overloaded: a single active lead assignment.
  const calmLead = insertStakeholder();
  const projectC = insertProject({ status: 'active' });
  assignStakeholder(projectC.id, calmLead.id, 'lead');

  // Leading an *archived* project doesn't count toward the active-lead threshold.
  const archivedLead = insertStakeholder();
  const archivedProject = insertProject({ status: 'archived' });
  assignStakeholder(archivedProject.id, archivedLead.id, 'lead');

  const res = await agent.get('/api/stakeholders');
  assert.equal(res.status, 200);
  const byId = new Map(res.body.map((s) => [s.id, s]));

  assert.equal(byId.get(busyLead.id).overloaded, true);
  assert.equal(byId.get(busyLead.id).active_project_count, 2);
  assert.equal(byId.get(calmLead.id).overloaded, false);
  assert.equal(byId.get(archivedLead.id).overloaded, false);
  assert.equal(byId.get(archivedLead.id).active_project_count, 0);
});

test('GET /api/stakeholders: overloaded via 5+ open items even with no lead role', async () => {
  const { agent } = await adminAgent();
  const stakeholder = insertStakeholder();
  const project = insertProject();
  assignStakeholder(project.id, stakeholder.id, 'member');
  const event = db
    .prepare("INSERT INTO events (project_id, title, date, type) VALUES (?, 'x', '2026-01-01', 'sync')")
    .run(project.id).lastInsertRowid;
  for (let i = 0; i < 5; i++) {
    db.prepare('INSERT INTO action_items (event_id, text, assignee_id, done) VALUES (?, ?, ?, 0)').run(
      event,
      `task ${i}`,
      stakeholder.id,
    );
  }

  const res = await agent.get('/api/stakeholders');
  const found = res.body.find((s) => s.id === stakeholder.id);
  assert.equal(found.open_item_count, 5);
  assert.equal(found.overloaded, true);
});
