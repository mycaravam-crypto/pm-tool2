import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  adminAgent,
  app,
  assignStakeholder,
  authedAgent,
  committedAgent,
  db,
  insertProjectWithLead,
  insertStakeholder,
  request,
} from '#server/test/helpers.js';

test('GET /api/projects requires a session', async () => {
  const res = await request(app).get('/api/projects');
  assert.equal(res.status, 401);
});

test('GET /api/projects: admin sees every project, a committed member sees only their own', async () => {
  const { project: projectA } = insertProjectWithLead();
  const { project: projectB } = insertProjectWithLead();

  const { agent: admin } = await adminAgent();
  const adminList = await admin.get('/api/projects');
  assert.equal(adminList.status, 200);
  const adminIds = adminList.body.map((p) => p.id);
  assert.ok(adminIds.includes(projectA.id) && adminIds.includes(projectB.id));

  const { agent: memberAgent } = await committedAgent(projectA.id, 'member');
  const memberList = await memberAgent.get('/api/projects');
  assert.equal(memberList.status, 200);
  const memberIds = memberList.body.map((p) => p.id);
  assert.ok(memberIds.includes(projectA.id));
  assert.ok(!memberIds.includes(projectB.id));
});

test('GET /api/projects response includes lead, scorecard, requirements, and goals', async () => {
  const { project, lead } = insertProjectWithLead();
  const { agent } = await adminAgent();
  const res = await agent.get('/api/projects');
  const found = res.body.find((p) => p.id === project.id);
  assert.equal(found.lead.id, lead.id);
  assert.ok(
    'schedule' in found.scorecard &&
      'cost' in found.scorecard &&
      'quality' in found.scorecard &&
      'scope' in found.scorecard,
  );
  assert.deepEqual(found.requirements, []);
  assert.deepEqual(found.goals, []);
});

test('GET /api/projects?status=active filters', async () => {
  insertProjectWithLead({ status: 'active' });
  insertProjectWithLead({ status: 'archived' });
  const { agent } = await adminAgent();
  const res = await agent.get('/api/projects?status=active');
  assert.ok(res.body.every((p) => p.status === 'active'));
});

test('POST /api/projects requires admin', async () => {
  const stakeholder = insertStakeholder();
  const { agent } = await authedAgent({ role: 'member' });
  const res = await agent.post('/api/projects').send({ name: 'X', lead_stakeholder_id: stakeholder.id });
  assert.equal(res.status, 403);
});

test('POST /api/projects requires a name and a lead_stakeholder_id', async () => {
  const { agent } = await adminAgent();
  const stakeholder = insertStakeholder();

  const noName = await agent.post('/api/projects').send({ lead_stakeholder_id: stakeholder.id });
  assert.equal(noName.status, 400);

  const noLead = await agent.post('/api/projects').send({ name: 'X' });
  assert.equal(noLead.status, 400);

  const badLead = await agent.post('/api/projects').send({ name: 'X', lead_stakeholder_id: 999999 });
  assert.equal(badLead.status, 400);
});

test('POST /api/projects: creates the project with the given lead, budget baselines snapshotted', async () => {
  const { agent } = await adminAgent();
  const stakeholder = insertStakeholder();
  const res = await agent.post('/api/projects').send({
    name: 'New Project',
    lead_stakeholder_id: stakeholder.id,
    target_end_date: '2026-12-31',
    budget_planned: 1000,
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.name, 'New Project');
  assert.equal(res.body.lead.id, stakeholder.id);
  assert.equal(res.body.original_target_end_date, '2026-12-31');
  assert.equal(res.body.original_budget_planned, 1000);
});

test('PUT /api/projects/:id: 404 for a project the caller cannot access (not 403)', async () => {
  const { project } = insertProjectWithLead();
  const stranger = insertStakeholder();
  const { agent } = await authedAgent({ stakeholder_id: stranger.id });
  const res = await agent.put(`/api/projects/${project.id}`).send({ name: 'renamed' });
  assert.equal(res.status, 404);
});

test('PUT /api/projects/:id: requires manage role (lead/sponsor/admin), not just contribute', async () => {
  const { project } = insertProjectWithLead();

  const { agent: memberAgent } = await committedAgent(project.id, 'member');
  const memberRes = await memberAgent.put(`/api/projects/${project.id}`).send({ name: 'x' });
  assert.equal(memberRes.status, 403);

  const { agent: stakeholderAgent } = await committedAgent(project.id, 'stakeholder');
  const stakeholderRes = await stakeholderAgent.put(`/api/projects/${project.id}`).send({ name: 'x' });
  assert.equal(stakeholderRes.status, 403);

  const { agent: sponsorAgent } = await committedAgent(project.id, 'sponsor');
  const sponsorRes = await sponsorAgent.put(`/api/projects/${project.id}`).send({ name: 'renamed by sponsor' });
  assert.equal(sponsorRes.status, 200);
  assert.equal(sponsorRes.body.name, 'renamed by sponsor');
});

test('PUT /api/projects/:id: partial update preserves unspecified fields', async () => {
  const { project } = insertProjectWithLead({ description: 'original description', budget_planned: 500 });
  const { agent } = await adminAgent();
  const res = await agent.put(`/api/projects/${project.id}`).send({ name: 'renamed only' });
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'renamed only');
  assert.equal(res.body.description, 'original description');
  assert.equal(res.body.budget_planned, 500);
});

test('PUT /api/projects/:id: setting status=completed stamps actual_end_date', async () => {
  const { project } = insertProjectWithLead();
  const { agent } = await adminAgent();
  const res = await agent.put(`/api/projects/${project.id}`).send({ status: 'completed' });
  assert.equal(res.status, 200);
  assert.ok(res.body.actual_end_date);
});

test('PUT /api/projects/:id/lead: atomically reassigns, requires the target to already be on the team', async () => {
  const { project, lead: oldLead } = insertProjectWithLead();
  const newLead = insertStakeholder();
  assignStakeholder(project.id, newLead.id, 'member');
  const { agent } = await adminAgent();

  const notOnTeam = insertStakeholder();
  const badRes = await agent.put(`/api/projects/${project.id}/lead`).send({ stakeholder_id: notOnTeam.id });
  assert.equal(badRes.status, 400);

  const res = await agent.put(`/api/projects/${project.id}/lead`).send({ stakeholder_id: newLead.id });
  assert.equal(res.status, 200);
  assert.equal(res.body.lead.id, newLead.id);

  const oldLeadRole = db
    .prepare('SELECT project_role FROM project_stakeholders WHERE project_id = ? AND stakeholder_id = ?')
    .get(project.id, oldLead.id).project_role;
  assert.equal(oldLeadRole, 'member');
});

test('DELETE /api/projects/:id requires admin and cascades to events', async () => {
  const { project } = insertProjectWithLead();
  const event = db
    .prepare("INSERT INTO events (project_id, title, date, type) VALUES (?, 'x', '2026-01-01', 'sync')")
    .run(project.id).lastInsertRowid;

  // A committed member of the project (even a non-lead) still can't delete
  // it — DELETE is admin-only, not gated by project management role at all.
  const { agent: memberAgent } = await committedAgent(project.id, 'member');
  const forbidden = await memberAgent.delete(`/api/projects/${project.id}`);
  assert.equal(forbidden.status, 403);

  const { agent } = await adminAgent();
  const res = await agent.delete(`/api/projects/${project.id}`);
  assert.equal(res.status, 204);
  assert.equal(db.prepare('SELECT id FROM events WHERE id = ?').get(event), undefined);
});

test('DELETE /api/projects/:id: 404 for a nonexistent project', async () => {
  const { agent } = await adminAgent();
  const res = await agent.delete('/api/projects/999999');
  assert.equal(res.status, 404);
});

test('project team management: add/patch/remove a stakeholder', async () => {
  const { project } = insertProjectWithLead();
  const { agent } = await adminAgent();
  const newMember = insertStakeholder();

  const rejectLead = await agent
    .post(`/api/projects/${project.id}/stakeholders`)
    .send({ stakeholder_id: newMember.id, project_role: 'lead' });
  assert.equal(rejectLead.status, 400);

  const rejectInvalidRole = await agent
    .post(`/api/projects/${project.id}/stakeholders`)
    .send({ stakeholder_id: newMember.id, project_role: 'not-a-role' });
  assert.equal(rejectInvalidRole.status, 400);

  const add = await agent
    .post(`/api/projects/${project.id}/stakeholders`)
    .send({ stakeholder_id: newMember.id, project_role: 'member' });
  assert.equal(add.status, 201);

  const dupe = await agent
    .post(`/api/projects/${project.id}/stakeholders`)
    .send({ stakeholder_id: newMember.id, project_role: 'sponsor' });
  assert.equal(dupe.status, 400);

  const list = await agent.get(`/api/projects/${project.id}/stakeholders`);
  assert.equal(list.status, 200);
  assert.ok(list.body.some((s) => s.id === newMember.id && s.project_role === 'member'));

  const patch = await agent
    .patch(`/api/projects/${project.id}/stakeholders/${newMember.id}`)
    .send({ project_role: 'sponsor' });
  assert.equal(patch.status, 200);
  assert.equal(patch.body.project_role, 'sponsor');

  const patchToLead = await agent
    .patch(`/api/projects/${project.id}/stakeholders/${newMember.id}`)
    .send({ project_role: 'lead' });
  assert.equal(patchToLead.status, 400);

  const remove = await agent.delete(`/api/projects/${project.id}/stakeholders/${newMember.id}`);
  assert.equal(remove.status, 204);

  const removeAgain = await agent.delete(`/api/projects/${project.id}/stakeholders/${newMember.id}`);
  assert.equal(removeAgain.status, 404);
});

test('project team management: cannot remove the lead directly', async () => {
  const { project, lead } = insertProjectWithLead();
  const { agent } = await adminAgent();
  const res = await agent.delete(`/api/projects/${project.id}/stakeholders/${lead.id}`);
  assert.equal(res.status, 400);
  assert.match(res.body.error, /reassign the lead/);
});

test('GET /api/projects/:id/stakeholders: read-only for any committed role including plain stakeholder', async () => {
  const { project } = insertProjectWithLead();
  const { agent } = await committedAgent(project.id, 'stakeholder');
  const res = await agent.get(`/api/projects/${project.id}/stakeholders`);
  assert.equal(res.status, 200);
});
