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
} from '../test/helpers.js';

test('POST /api/action-items: requires event_id and text, 404 for an inaccessible event, 403 read-only', async () => {
  const { project } = insertProjectWithLead();
  const event = insertEvent(project.id);
  const { agent } = await adminAgent();

  const missing = await agent.post('/api/action-items').send({ event_id: event.id });
  assert.equal(missing.status, 400);

  const notFound = await agent.post('/api/action-items').send({ event_id: 999999, text: 'x' });
  assert.equal(notFound.status, 404);

  const { agent: readOnly } = await committedAgent(project.id, 'stakeholder');
  const forbidden = await readOnly.post('/api/action-items').send({ event_id: event.id, text: 'x' });
  assert.equal(forbidden.status, 403);
});

test('POST /api/action-items: creates and notifies the assignee', async () => {
  const { project } = insertProjectWithLead();
  const event = insertEvent(project.id);
  const assignee = insertStakeholder();
  const assigneeMember = insertMember({ stakeholder_id: assignee.id });
  const { agent } = await adminAgent();

  const res = await agent
    .post('/api/action-items')
    .send({ event_id: event.id, text: 'do the thing', assignee_id: assignee.id, due_date: '2026-03-01' });
  assert.equal(res.status, 201);
  assert.equal(res.body.done, 0);

  const notif = db.prepare('SELECT * FROM notifications WHERE member_id = ?').get(assigneeMember.id);
  assert.ok(notif);
  assert.match(notif.body, /2026-03-01|01\.03\.2026/);
});

test('PATCH /api/action-items/:id: toggles done, requires contribute', async () => {
  const { project } = insertProjectWithLead();
  const event = insertEvent(project.id);
  const { agent } = await adminAgent();
  const create = await agent.post('/api/action-items').send({ event_id: event.id, text: 'x' });

  const { agent: readOnly } = await committedAgent(project.id, 'stakeholder');
  const forbidden = await readOnly.patch(`/api/action-items/${create.body.id}`).send({ done: true });
  assert.equal(forbidden.status, 403);

  const res = await agent.patch(`/api/action-items/${create.body.id}`).send({ done: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.done, 1);

  const untoggle = await agent.patch(`/api/action-items/${create.body.id}`).send({ done: false });
  assert.equal(untoggle.body.done, 0);
});

test('PUT /api/action-items/:id: reassigning notifies the new assignee only when it actually changes', async () => {
  const { project } = insertProjectWithLead();
  const event = insertEvent(project.id);
  const first = insertStakeholder();
  const second = insertStakeholder();
  const secondMember = insertMember({ stakeholder_id: second.id });
  const { agent } = await adminAgent();
  const create = await agent.post('/api/action-items').send({ event_id: event.id, text: 'x', assignee_id: first.id });

  const noChange = await agent.put(`/api/action-items/${create.body.id}`).send({ text: 'x edited' });
  assert.equal(noChange.status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE member_id = ?').get(secondMember.id).n, 0);

  const reassigned = await agent.put(`/api/action-items/${create.body.id}`).send({ assignee_id: second.id });
  assert.equal(reassigned.status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE member_id = ?').get(secondMember.id).n, 1);
});

test('DELETE /api/action-items/:id: only lead/admin can delete', async () => {
  const project = insertProject(); // no pre-assigned lead, so committedAgent below can be the lead
  const event = insertEvent(project.id);
  const { agent: admin } = await adminAgent();
  const create = await admin.post('/api/action-items').send({ event_id: event.id, text: 'x' });

  const { agent: contributor } = await committedAgent(project.id, 'member');
  const forbidden = await contributor.delete(`/api/action-items/${create.body.id}`);
  assert.equal(forbidden.status, 403);

  const { agent: lead } = await committedAgent(project.id, 'lead');
  const res = await lead.delete(`/api/action-items/${create.body.id}`);
  assert.equal(res.status, 204);
});
