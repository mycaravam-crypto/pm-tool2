import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  adminAgent,
  committedAgent,
  db,
  insertEvent,
  insertMember,
  insertProject,
  insertProjectWithLead,
  insertStakeholder,
} from '#server/test/helpers.js';

test('POST /api/decisions: requires event_id and text, 404 for an inaccessible event', async () => {
  const { project } = insertProjectWithLead();
  const event = insertEvent(project.id);
  const { agent } = await adminAgent();

  const missing = await agent.post('/api/decisions').send({ event_id: event.id });
  assert.equal(missing.status, 400);

  const notFound = await agent.post('/api/decisions').send({ event_id: 999999, text: 'x' });
  assert.equal(notFound.status, 404);
});

test('POST /api/decisions: 403 for a read-only stakeholder role', async () => {
  const { project } = insertProjectWithLead();
  const event = insertEvent(project.id);
  const { agent } = await committedAgent(project.id, 'stakeholder');
  const res = await agent.post('/api/decisions').send({ event_id: event.id, text: 'x' });
  assert.equal(res.status, 403);
});

test('POST /api/decisions: creates the decision and notifies the decision-maker', async () => {
  const { project } = insertProjectWithLead();
  const event = insertEvent(project.id);
  const decisionMaker = insertStakeholder();
  const decisionMakerMember = insertMember({ stakeholder_id: decisionMaker.id });
  const { agent } = await adminAgent();

  const res = await agent
    .post('/api/decisions')
    .send({ event_id: event.id, text: 'we picked A', decided_by: decisionMaker.id });
  assert.equal(res.status, 201);
  assert.equal(res.body.text, 'we picked A');

  const notif = db.prepare('SELECT * FROM notifications WHERE member_id = ?').get(decisionMakerMember.id);
  assert.ok(notif);
  assert.equal(notif.type, 'assigned');
  assert.match(notif.subject, /decision/i);
});

test('PUT /api/decisions/:id: updates text, notifies only when decided_by actually changes', async () => {
  const { project } = insertProjectWithLead();
  const event = insertEvent(project.id);
  const original = insertStakeholder();
  const replacement = insertStakeholder();
  insertMember({ stakeholder_id: replacement.id });
  const { agent } = await adminAgent();
  const create = await agent
    .post('/api/decisions')
    .send({ event_id: event.id, text: 'first', decided_by: original.id });
  const countNotifications = () => db.prepare('SELECT COUNT(*) AS n FROM notifications').get().n;
  const baseline = countNotifications();

  const sameOwner = await agent.put(`/api/decisions/${create.body.id}`).send({ text: 'edited' });
  assert.equal(sameOwner.status, 200);
  assert.equal(sameOwner.body.text, 'edited');
  assert.equal(countNotifications(), baseline);

  const changedOwner = await agent.put(`/api/decisions/${create.body.id}`).send({ decided_by: replacement.id });
  assert.equal(changedOwner.status, 200);
  assert.equal(countNotifications(), baseline + 1);
});

test('PUT /api/decisions/:id: 403 for a read-only role, 404 across event boundary', async () => {
  const { project } = insertProjectWithLead();
  const event = insertEvent(project.id);
  const { agent: admin } = await adminAgent();
  const create = await admin.post('/api/decisions').send({ event_id: event.id, text: 'x' });

  const { agent: readOnly } = await committedAgent(project.id, 'stakeholder');
  const forbidden = await readOnly.put(`/api/decisions/${create.body.id}`).send({ text: 'y' });
  assert.equal(forbidden.status, 403);

  const notFound = await admin.put('/api/decisions/999999').send({ text: 'y' });
  assert.equal(notFound.status, 404);
});

test('DELETE /api/decisions/:id: only the project lead (or admin) can delete, not a plain contributor', async () => {
  // No pre-assigned lead here (unlike insertProjectWithLead) so committedAgent
  // below can assign the 'lead' role itself without hitting the one-lead-per-
  // project unique index.
  const project = insertProject();
  const event = insertEvent(project.id);
  const { agent: admin } = await adminAgent();
  const create = await admin.post('/api/decisions').send({ event_id: event.id, text: 'x' });

  const { agent: contributor } = await committedAgent(project.id, 'member');
  const forbidden = await contributor.delete(`/api/decisions/${create.body.id}`);
  assert.equal(forbidden.status, 403);

  const { agent: lead } = await committedAgent(project.id, 'lead');
  const res = await lead.delete(`/api/decisions/${create.body.id}`);
  assert.equal(res.status, 204);
});
