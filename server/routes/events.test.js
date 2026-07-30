import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  adminAgent,
  app,
  assignStakeholder,
  committedAgent,
  db,
  insertEvent,
  insertMember,
  insertProjectWithLead,
  insertStakeholder,
  request,
} from '#server/test/helpers.js';

test('GET /api/events: no project_ids returns an empty list, not an error', async () => {
  const { agent } = await adminAgent();
  const res = await agent.get('/api/events');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});

test('GET /api/events: filters by project access even if the caller asks for someone else’s project', async () => {
  const { project: myProject } = insertProjectWithLead();
  const { project: otherProject } = insertProjectWithLead();
  insertEvent(myProject.id);
  insertEvent(otherProject.id);

  const { agent } = await committedAgent(myProject.id, 'member');
  const res = await agent.get(`/api/events?project_ids=${myProject.id},${otherProject.id}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.every((e) => e.project_id === myProject.id));
});

test('GET /api/events: serializes nested decisions/action items/pain points/participants', async () => {
  const { project } = insertProjectWithLead();
  const stakeholder = insertStakeholder();
  const event = insertEvent(project.id);
  db.prepare('INSERT INTO event_participants (event_id, stakeholder_id) VALUES (?, ?)').run(event.id, stakeholder.id);
  db.prepare("INSERT INTO decisions (event_id, text) VALUES (?, 'a decision')").run(event.id);
  db.prepare("INSERT INTO action_items (event_id, text) VALUES (?, 'a task')").run(event.id);
  db.prepare("INSERT INTO pain_points (event_id, text, severity) VALUES (?, 'a pain point', 'Low')").run(event.id);

  const { agent } = await adminAgent();
  const res = await agent.get(`/api/events?project_ids=${project.id}`);
  const found = res.body.find((e) => e.id === event.id);
  assert.equal(found.participants.length, 1);
  assert.equal(found.decisions.length, 1);
  assert.equal(found.action_items.length, 1);
  assert.equal(found.pain_points.length, 1);
  assert.equal(found.project.id, project.id);
});

test('POST /api/events: validates required fields and enum values', async () => {
  const { project } = insertProjectWithLead();
  const { agent } = await adminAgent();

  const missing = await agent.post('/api/events').send({ project_id: project.id });
  assert.equal(missing.status, 400);

  const badType = await agent
    .post('/api/events')
    .send({ project_id: project.id, title: 'x', date: '2026-01-01', type: 'not-a-type' });
  assert.equal(badType.status, 400);

  const badStatus = await agent
    .post('/api/events')
    .send({ project_id: project.id, title: 'x', date: '2026-01-01', type: 'sync', status: 'not-a-status' });
  assert.equal(badStatus.status, 400);
});

test('POST /api/events: 404 for an inaccessible project, 403 for a read-only (stakeholder) role', async () => {
  const { project } = insertProjectWithLead();
  const { project: otherProject } = insertProjectWithLead();
  const { agent: strangerAgent } = await committedAgent(otherProject.id, 'member'); // not committed to `project`

  const notFound = await strangerAgent
    .post('/api/events')
    .send({ project_id: project.id, title: 'x', date: '2026-01-01', type: 'sync' });
  assert.equal(notFound.status, 404);

  const { agent: readOnlyAgent } = await committedAgent(project.id, 'stakeholder');
  const forbidden = await readOnlyAgent
    .post('/api/events')
    .send({ project_id: project.id, title: 'x', date: '2026-01-01', type: 'sync' });
  assert.equal(forbidden.status, 403);
});

test('POST /api/events: creates nested decisions/action items/pain points and notifies assignees', async () => {
  const { project } = insertProjectWithLead();
  const decisionMaker = insertStakeholder();
  const assignee = insertStakeholder();
  const owner = insertStakeholder();
  const decisionMakerMember = insertMember({ stakeholder_id: decisionMaker.id });
  const assigneeMember = insertMember({ stakeholder_id: assignee.id });
  const ownerMember = insertMember({ stakeholder_id: owner.id });

  const { agent } = await adminAgent();
  const res = await agent.post('/api/events').send({
    project_id: project.id,
    title: 'Kickoff',
    date: '2026-02-01',
    type: 'kickoff',
    decisions: [{ text: 'we decided X', decided_by: decisionMaker.id }],
    action_items: [{ text: 'do the thing', assignee_id: assignee.id, due_date: '2026-02-15' }],
    pain_points: [{ text: 'a risk', severity: 'High', owner_id: owner.id, kind: 'risk' }],
  });
  assert.equal(res.status, 201);
  const event = res.body.events[0];
  assert.equal(event.decisions.length, 1);
  assert.equal(event.action_items.length, 1);
  assert.equal(event.pain_points[0].kind, 'risk');

  for (const memberId of [decisionMakerMember.id, assigneeMember.id, ownerMember.id]) {
    const notif = db.prepare('SELECT * FROM notifications WHERE member_id = ?').get(memberId);
    assert.ok(notif, `expected a notification for member ${memberId}`);
  }
});

test('POST /api/events: recurrence generates the right number of occurrences, only the first gets nested items', async () => {
  const { project } = insertProjectWithLead();
  const { agent } = await adminAgent();
  const res = await agent.post('/api/events').send({
    project_id: project.id,
    title: 'Weekly sync',
    date: '2026-03-02',
    type: 'sync',
    recurrence: { frequency: 'weekly', interval: 1, count: 4 },
    decisions: [{ text: 'kickoff decision' }],
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.events.length, 4);
  assert.equal(res.body.events[0].decisions.length, 1);
  assert.equal(res.body.events[1].decisions.length, 0);
  assert.ok(res.body.events.every((e) => e.series.frequency === 'weekly'));
  assert.deepEqual(
    res.body.events.map((e) => e.date),
    ['2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23'],
  );
});

test('POST /api/events: invalid recurrence rule is rejected', async () => {
  const { project } = insertProjectWithLead();
  const { agent } = await adminAgent();
  const res = await agent.post('/api/events').send({
    project_id: project.id,
    title: 'x',
    date: '2026-01-01',
    type: 'sync',
    recurrence: { frequency: 'daily', interval: 1, count: 1 }, // count must be >= 2
  });
  assert.equal(res.status, 400);
});

test('PUT /api/events/:id: updates fields and replaces participants; requires contribute', async () => {
  const { project } = insertProjectWithLead();
  const event = insertEvent(project.id, { title: 'old title' });
  const p1 = insertStakeholder();
  const p2 = insertStakeholder();
  db.prepare('INSERT INTO event_participants (event_id, stakeholder_id) VALUES (?, ?)').run(event.id, p1.id);

  const { agent: readOnlyAgent } = await committedAgent(project.id, 'stakeholder');
  const forbidden = await readOnlyAgent.put(`/api/events/${event.id}`).send({ title: 'nope' });
  assert.equal(forbidden.status, 403);

  const { agent } = await adminAgent();
  const res = await agent.put(`/api/events/${event.id}`).send({ title: 'new title', participants: [p2.id] });
  assert.equal(res.status, 200);
  assert.equal(res.body.title, 'new title');
  assert.equal(res.body.participants.length, 1);
  assert.equal(res.body.participants[0].id, p2.id);
});

test('DELETE /api/events/:id: 404 across project boundary, 204 on success', async () => {
  const { project } = insertProjectWithLead();
  const event = insertEvent(project.id);
  const { project: otherProject } = insertProjectWithLead();
  const { agent: strangerAgent } = await committedAgent(otherProject.id, 'member');

  const notFound = await strangerAgent.delete(`/api/events/${event.id}`);
  assert.equal(notFound.status, 404);

  const { agent } = await adminAgent();
  const res = await agent.delete(`/api/events/${event.id}`);
  assert.equal(res.status, 204);
  assert.equal(db.prepare('SELECT id FROM events WHERE id = ?').get(event.id), undefined);
});

test('PUT /api/events/series/:seriesId: edits shared fields across every occurrence, excludes date/status', async () => {
  const { project } = insertProjectWithLead();
  const { agent } = await adminAgent();
  const create = await agent.post('/api/events').send({
    project_id: project.id,
    title: 'Standup',
    date: '2026-04-01',
    type: 'sync',
    recurrence: { frequency: 'daily', interval: 1, count: 3 },
  });
  const seriesId = create.body.events[0].series_id;

  const res = await agent.put(`/api/events/series/${seriesId}`).send({ title: 'Renamed Standup' });
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 3);
  assert.ok(res.body.every((e) => e.title === 'Renamed Standup'));
  // Dates are untouched — series edits don't reschedule occurrences.
  assert.deepEqual(res.body.map((e) => e.date).sort(), ['2026-04-01', '2026-04-02', '2026-04-03']);
});

test('DELETE /api/events/series/:seriesId: removes every occurrence in the series', async () => {
  const { project } = insertProjectWithLead();
  const { agent } = await adminAgent();
  const create = await agent.post('/api/events').send({
    project_id: project.id,
    title: 'Standup',
    date: '2026-05-01',
    type: 'sync',
    recurrence: { frequency: 'daily', interval: 1, count: 3 },
  });
  const seriesId = create.body.events[0].series_id;
  const eventIds = create.body.events.map((e) => e.id);

  const res = await agent.delete(`/api/events/series/${seriesId}`);
  assert.equal(res.status, 204);
  for (const id of eventIds) {
    assert.equal(db.prepare('SELECT id FROM events WHERE id = ?').get(id), undefined);
  }
});

test('POST /api/events/import: preview mode validates without writing anything', async () => {
  const { project } = insertProjectWithLead();
  const member = insertStakeholder();
  assignStakeholder(project.id, member.id, 'member');
  const { agent } = await adminAgent();

  const csv = `title,date,type,participants\nKickoff,2026-06-01,kickoff,${member.name}\nBad Row,not-a-date,sync,`;
  const res = await agent.post('/api/events/import').send({ project_id: project.id, csv, commit: false });
  assert.equal(res.status, 200);
  assert.equal(res.body.preview, true);
  assert.equal(res.body.totalRows, 2);
  assert.equal(res.body.validCount, 1);

  const countBefore = db.prepare('SELECT COUNT(*) AS n FROM events WHERE project_id = ?').get(project.id).n;
  assert.equal(countBefore, 0);
});

test('POST /api/events/import: commit writes only the valid rows and reports skipped ones', async () => {
  const { project } = insertProjectWithLead();
  const { agent } = await adminAgent();
  const csv = 'title,date,type\nGood Row,2026-06-02,sync\n,2026-06-03,sync';
  const res = await agent.post('/api/events/import').send({ project_id: project.id, csv, commit: true });
  assert.equal(res.status, 201);
  assert.equal(res.body.imported, 1);
  assert.equal(res.body.skipped.length, 1);

  const count = db.prepare('SELECT COUNT(*) AS n FROM events WHERE project_id = ?').get(project.id).n;
  assert.equal(count, 1);
});

test('POST /api/events/import: rejects missing project_id/csv and unparseable CSV', async () => {
  const { agent } = await adminAgent();
  const missing = await agent.post('/api/events/import').send({});
  assert.equal(missing.status, 400);
});

test('events routes: unauthenticated requests are rejected', async () => {
  const res = await request(app).get('/api/events?project_ids=1');
  assert.equal(res.status, 401);
});
