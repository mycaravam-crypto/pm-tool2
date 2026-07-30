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

test('POST /api/pain-points: requires event_id, text, and a valid severity/kind', async () => {
  const { project } = insertProjectWithLead();
  const event = insertEvent(project.id);
  const { agent } = await adminAgent();

  const missing = await agent.post('/api/pain-points').send({ event_id: event.id, text: 'x' });
  assert.equal(missing.status, 400);

  const badSeverity = await agent.post('/api/pain-points').send({ event_id: event.id, text: 'x', severity: 'Extreme' });
  assert.equal(badSeverity.status, 400);

  const badKind = await agent
    .post('/api/pain-points')
    .send({ event_id: event.id, text: 'x', severity: 'Low', kind: 'concern' });
  assert.equal(badKind.status, 400);
});

test('POST /api/pain-points: 404 for an inaccessible event, 403 read-only', async () => {
  const { project } = insertProjectWithLead();
  const event = insertEvent(project.id);
  const { agent } = await adminAgent();

  const notFound = await agent.post('/api/pain-points').send({ event_id: 999999, text: 'x', severity: 'Low' });
  assert.equal(notFound.status, 404);

  const { agent: readOnly } = await committedAgent(project.id, 'stakeholder');
  const forbidden = await readOnly.post('/api/pain-points').send({ event_id: event.id, text: 'x', severity: 'Low' });
  assert.equal(forbidden.status, 403);
});

test('POST /api/pain-points: defaults kind to issue, creates as risk when specified, notifies the owner', async () => {
  const { project } = insertProjectWithLead();
  const event = insertEvent(project.id);
  const owner = insertStakeholder();
  const ownerMember = insertMember({ stakeholder_id: owner.id });
  const { agent } = await adminAgent();

  const issue = await agent.post('/api/pain-points').send({ event_id: event.id, text: 'x', severity: 'High' });
  assert.equal(issue.body.kind, 'issue');

  const risk = await agent
    .post('/api/pain-points')
    .send({ event_id: event.id, text: 'might happen', severity: 'Medium', kind: 'risk', owner_id: owner.id });
  assert.equal(risk.body.kind, 'risk');

  const notif = db.prepare('SELECT * FROM notifications WHERE member_id = ?').get(ownerMember.id);
  assert.ok(notif);
});

test('PATCH /api/pain-points/:id: toggles resolved and stamps/clears resolved_at', async () => {
  const { project } = insertProjectWithLead();
  const event = insertEvent(project.id);
  const { agent } = await adminAgent();
  const create = await agent.post('/api/pain-points').send({ event_id: event.id, text: 'x', severity: 'Low' });

  const resolve = await agent.patch(`/api/pain-points/${create.body.id}`).send({ resolved: true });
  assert.equal(resolve.status, 200);
  assert.equal(resolve.body.resolved, 1);
  assert.ok(resolve.body.resolved_at);

  const reopen = await agent.patch(`/api/pain-points/${create.body.id}`).send({ resolved: false });
  assert.equal(reopen.body.resolved, 0);
  assert.equal(reopen.body.resolved_at, null);
});

test('PUT /api/pain-points/:id: updates severity/kind with validation, partial update preserves the rest', async () => {
  const { project } = insertProjectWithLead();
  const event = insertEvent(project.id);
  const { agent } = await adminAgent();
  const create = await agent
    .post('/api/pain-points')
    .send({ event_id: event.id, text: 'original', severity: 'Low', kind: 'issue' });

  const badUpdate = await agent.put(`/api/pain-points/${create.body.id}`).send({ severity: 'Extreme' });
  assert.equal(badUpdate.status, 400);

  const update = await agent.put(`/api/pain-points/${create.body.id}`).send({ severity: 'High' });
  assert.equal(update.status, 200);
  assert.equal(update.body.severity, 'High');
  assert.equal(update.body.text, 'original');
});

test('DELETE /api/pain-points/:id: only lead/admin can delete', async () => {
  const project = insertProject();
  const event = insertEvent(project.id);
  const { agent: admin } = await adminAgent();
  const create = await admin.post('/api/pain-points').send({ event_id: event.id, text: 'x', severity: 'Low' });

  const { agent: contributor } = await committedAgent(project.id, 'member');
  const forbidden = await contributor.delete(`/api/pain-points/${create.body.id}`);
  assert.equal(forbidden.status, 403);

  const { agent: lead } = await committedAgent(project.id, 'lead');
  const res = await lead.delete(`/api/pain-points/${create.body.id}`);
  assert.equal(res.status, 204);
});
