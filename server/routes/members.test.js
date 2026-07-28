import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adminAgent, app, authedAgent, db, insertMember, insertProject, request } from '../test/helpers.js';

// Deliberately first in the file and self-contained: the "last admin" guard
// (server/routes/members.js's isLastAdmin) counts admins across the *whole*
// database, and every other test in this file that calls adminAgent()/
// insertMember({ role: 'admin' }) adds one more — so this scenario (exactly
// one admin existing) can only ever be true once, before any of those run.
test('members: last-admin guard blocks both demotion and deletion until a second admin exists', async () => {
  const { agent, member: onlyAdmin } = await adminAgent();

  const demote = await agent.put(`/api/members/${onlyAdmin.id}`).send({ role: 'member' });
  assert.equal(demote.status, 400);
  assert.match(demote.body.error, /last admin/);

  const del = await agent.delete(`/api/members/${onlyAdmin.id}`);
  assert.equal(del.status, 400);

  insertMember({ role: 'admin' });
  const demoteNow = await agent.put(`/api/members/${onlyAdmin.id}`).send({ role: 'member' });
  assert.equal(demoteNow.status, 200);
  assert.equal(demoteNow.body.role, 'member');
});

test('members routes require a session and admin role', async () => {
  const noSession = await request(app).get('/api/members');
  assert.equal(noSession.status, 401);

  const { agent } = await authedAgent({ role: 'member' });
  const nonAdmin = await agent.get('/api/members');
  assert.equal(nonAdmin.status, 403);
});

test('GET /api/members: never leaks password_hash, exposes has_password instead', async () => {
  const { agent } = await adminAgent();
  const withPassword = insertMember({ password: 'secret123' });
  const res = await agent.get('/api/members');
  const found = res.body.find((m) => m.id === withPassword.id);
  assert.equal(found.password_hash, undefined);
  assert.equal(found.has_password, 1);
});

test('POST /api/members: validates name/email, password length, role, and stakeholder_id existence', async () => {
  const { agent } = await adminAgent();

  const missing = await agent.post('/api/members').send({ name: 'X' });
  assert.equal(missing.status, 400);

  const shortPassword = await agent.post('/api/members').send({ name: 'X', email: 'x@example.com', password: '123' });
  assert.equal(shortPassword.status, 400);

  const badRole = await agent.post('/api/members').send({ name: 'X', email: 'x@example.com', role: 'superadmin' });
  assert.equal(badRole.status, 400);

  const badStakeholder = await agent
    .post('/api/members')
    .send({ name: 'X', email: 'x@example.com', stakeholder_id: 999999 });
  assert.equal(badStakeholder.status, 400);
});

test('POST /api/members: creates a subscriber with no password (not a login account)', async () => {
  const { agent } = await adminAgent();
  const res = await agent.post('/api/members').send({ name: 'Subscriber Only', email: 'sub@example.com' });
  assert.equal(res.status, 201);
  assert.equal(res.body.has_password, 0);
  assert.equal(res.body.role, 'member');
});

test('POST /api/members: duplicate email rejected', async () => {
  const { agent } = await adminAgent();
  await agent.post('/api/members').send({ name: 'A', email: 'dup@example.com' });
  const dupe = await agent.post('/api/members').send({ name: 'B', email: 'dup@example.com' });
  assert.equal(dupe.status, 400);
});

test('PUT /api/members/:id: blank password leaves the existing hash untouched', async () => {
  const { agent } = await adminAgent();
  const member = insertMember({ password: 'original-password' });
  const before = db.prepare('SELECT password_hash FROM members WHERE id = ?').get(member.id).password_hash;

  const res = await agent.put(`/api/members/${member.id}`).send({ name: 'renamed' });
  assert.equal(res.status, 200);
  const after = db.prepare('SELECT password_hash FROM members WHERE id = ?').get(member.id).password_hash;
  assert.equal(after, before);
});

test('DELETE /api/members/:id: 404 for a nonexistent member', async () => {
  const { agent } = await adminAgent();
  const res = await agent.delete('/api/members/999999');
  assert.equal(res.status, 404);
});

test('member project digest subscriptions: subscribe, list, reject duplicate, unsubscribe', async () => {
  const { agent } = await adminAgent();
  const member = insertMember();
  const project = insertProject();

  const subscribe = await agent.post(`/api/members/${member.id}/projects`).send({ project_id: project.id });
  assert.equal(subscribe.status, 201);

  const dupe = await agent.post(`/api/members/${member.id}/projects`).send({ project_id: project.id });
  assert.equal(dupe.status, 400);

  const list = await agent.get(`/api/members/${member.id}/projects`);
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].id, project.id);

  const unsubscribe = await agent.delete(`/api/members/${member.id}/projects/${project.id}`);
  assert.equal(unsubscribe.status, 204);

  const listAfter = await agent.get(`/api/members/${member.id}/projects`);
  assert.equal(listAfter.body.length, 0);
});

test('POST /api/members/:id/projects: requires project_id', async () => {
  const { agent } = await adminAgent();
  const member = insertMember();
  const res = await agent.post(`/api/members/${member.id}/projects`).send({});
  assert.equal(res.status, 400);
});
