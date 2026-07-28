import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adminAgent, committedAgent, db, insertProject, insertProjectWithLead } from '../test/helpers.js';

test('POST /api/goals: requires project_id and text; 404/403 access control', async () => {
  const { project } = insertProjectWithLead();
  const { agent } = await adminAgent();

  const missing = await agent.post('/api/goals').send({ project_id: project.id });
  assert.equal(missing.status, 400);

  const notFound = await agent.post('/api/goals').send({ project_id: 999999, text: 'x' });
  assert.equal(notFound.status, 404);

  const { agent: readOnly } = await committedAgent(project.id, 'stakeholder');
  const forbidden = await readOnly.post('/api/goals').send({ project_id: project.id, text: 'x' });
  assert.equal(forbidden.status, 403);
});

test('POST /api/goals: creates with an optional target_date', async () => {
  const { project } = insertProjectWithLead();
  const { agent } = await adminAgent();
  const res = await agent
    .post('/api/goals')
    .send({ project_id: project.id, text: 'ship it', target_date: '2026-12-31' });
  assert.equal(res.status, 201);
  assert.equal(res.body.achieved, 0);
  assert.equal(res.body.target_date, '2026-12-31');
});

test('PUT /api/goals/:id: logs history only when text or target_date actually change', async () => {
  const { project } = insertProjectWithLead();
  const { agent } = await adminAgent();
  const create = await agent
    .post('/api/goals')
    .send({ project_id: project.id, text: 'original', target_date: '2026-06-01' });

  const noOpUpdate = await agent
    .put(`/api/goals/${create.body.id}`)
    .send({ text: 'original', target_date: '2026-06-01' });
  assert.equal(noOpUpdate.status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM goal_history WHERE goal_id = ?').get(create.body.id).n, 0);

  const realUpdate = await agent.put(`/api/goals/${create.body.id}`).send({ target_date: '2026-07-01' });
  assert.equal(realUpdate.status, 200);
  const history = db.prepare('SELECT * FROM goal_history WHERE goal_id = ?').all(create.body.id);
  assert.equal(history.length, 1);
  assert.equal(history[0].previous_target_date, '2026-06-01');
});

test('PATCH /api/goals/:id: toggles achieved', async () => {
  const { project } = insertProjectWithLead();
  const { agent } = await adminAgent();
  const create = await agent.post('/api/goals').send({ project_id: project.id, text: 'x' });
  const res = await agent.patch(`/api/goals/${create.body.id}`).send({ achieved: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.achieved, 1);
});

test('DELETE /api/goals/:id: only lead/admin can delete', async () => {
  const project = insertProject();
  const { agent: admin } = await adminAgent();
  const create = await admin.post('/api/goals').send({ project_id: project.id, text: 'x' });

  const { agent: contributor } = await committedAgent(project.id, 'member');
  const forbidden = await contributor.delete(`/api/goals/${create.body.id}`);
  assert.equal(forbidden.status, 403);

  const { agent: lead } = await committedAgent(project.id, 'lead');
  const res = await lead.delete(`/api/goals/${create.body.id}`);
  assert.equal(res.status, 204);
});
