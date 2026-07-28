import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adminAgent, committedAgent, db, insertProject, insertProjectWithLead } from '../test/helpers.js';

function insertGoal(projectId, text = 'a goal') {
  return db.prepare('INSERT INTO goals (project_id, text) VALUES (?, ?)').run(projectId, text).lastInsertRowid;
}

test('POST /api/requirements: requires project_id and text; 404/403 access control', async () => {
  const { project } = insertProjectWithLead();
  const { agent } = await adminAgent();

  const missing = await agent.post('/api/requirements').send({ project_id: project.id });
  assert.equal(missing.status, 400);

  const notFound = await agent.post('/api/requirements').send({ project_id: 999999, text: 'x' });
  assert.equal(notFound.status, 404);

  const { agent: readOnly } = await committedAgent(project.id, 'stakeholder');
  const forbidden = await readOnly.post('/api/requirements').send({ project_id: project.id, text: 'x' });
  assert.equal(forbidden.status, 403);
});

test('POST /api/requirements: goal_id must belong to the same project', async () => {
  const { project: projectA } = insertProjectWithLead();
  const { project: projectB } = insertProjectWithLead();
  const goalOnB = insertGoal(projectB.id);
  const { agent } = await adminAgent();

  const crossProject = await agent
    .post('/api/requirements')
    .send({ project_id: projectA.id, text: 'x', goal_id: goalOnB });
  assert.equal(crossProject.status, 400);

  const goalOnA = insertGoal(projectA.id);
  const ok = await agent.post('/api/requirements').send({ project_id: projectA.id, text: 'x', goal_id: goalOnA });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.goal_id, goalOnA);
});

test('PUT /api/requirements/:id: logs history only on an actual text change, not a goal_id-only relink', async () => {
  const { project } = insertProjectWithLead();
  const goal = insertGoal(project.id);
  const { agent } = await adminAgent();
  const create = await agent.post('/api/requirements').send({ project_id: project.id, text: 'original' });

  const relink = await agent.put(`/api/requirements/${create.body.id}`).send({ goal_id: goal });
  assert.equal(relink.status, 200);
  assert.equal(relink.body.goal_id, goal);
  assert.equal(
    db.prepare('SELECT COUNT(*) AS n FROM requirement_history WHERE requirement_id = ?').get(create.body.id).n,
    0,
  );

  const edit = await agent.put(`/api/requirements/${create.body.id}`).send({ text: 'edited' });
  assert.equal(edit.status, 200);
  const history = db.prepare('SELECT * FROM requirement_history WHERE requirement_id = ?').all(create.body.id);
  assert.equal(history.length, 1);
  assert.equal(history[0].previous_text, 'original');
});

test('PATCH /api/requirements/:id: toggles done', async () => {
  const { project } = insertProjectWithLead();
  const { agent } = await adminAgent();
  const create = await agent.post('/api/requirements').send({ project_id: project.id, text: 'x' });
  const res = await agent.patch(`/api/requirements/${create.body.id}`).send({ done: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.done, 1);
});

test('DELETE /api/requirements/:id: only lead/admin can delete', async () => {
  const project = insertProject();
  const { agent: admin } = await adminAgent();
  const create = await admin.post('/api/requirements').send({ project_id: project.id, text: 'x' });

  const { agent: contributor } = await committedAgent(project.id, 'member');
  const forbidden = await contributor.delete(`/api/requirements/${create.body.id}`);
  assert.equal(forbidden.status, 403);

  const { agent: lead } = await committedAgent(project.id, 'lead');
  const res = await lead.delete(`/api/requirements/${create.body.id}`);
  assert.equal(res.status, 204);
});
