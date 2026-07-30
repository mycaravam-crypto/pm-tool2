import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import app from './app.js';

test('GET /healthz: reports ok with a working database', async () => {
  const res = await request(app).get('/healthz');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
});

test('GET /version: reports the app version and commit (commit unset outside a built image)', async () => {
  const res = await request(app).get('/version');
  assert.equal(res.status, 200);
  assert.match(res.body.version, /^\d+\.\d+\.\d+$/);
  assert.equal(res.body.commit, 'unknown');
});

test('GET /version: APP_VERSION (baked in at image build time) overrides the package.json fallback', async () => {
  process.env.APP_VERSION = '2.4.6';
  try {
    const res = await request(app).get('/version');
    assert.equal(res.body.version, '2.4.6');
  } finally {
    delete process.env.APP_VERSION;
  }
});

test('GET /api/projects without a session: 401', async () => {
  const res = await request(app).get('/api/projects');
  assert.equal(res.status, 401);
});

test('register -> me -> logout -> me: the whole session lifecycle', async () => {
  const email = `integration-${Math.random()}@example.com`;
  const agent = request.agent(app);

  const registerRes = await agent.post('/api/auth/register').send({
    name: 'Test User',
    email,
    password: 'hunter22',
  });
  assert.equal(registerRes.status, 201);
  assert.equal(registerRes.body.email, email);
  assert.equal(registerRes.body.role, 'member');
  assert.equal(registerRes.body.password_hash, undefined); // never leaked to the client

  const meRes = await agent.get('/api/auth/me');
  assert.equal(meRes.status, 200);
  assert.equal(meRes.body.email, email);

  // A brand-new member has no stakeholder_id, so is committed to zero
  // projects — but is still authenticated, so this is a 200 with an empty
  // list, not a 401 (see utils/access.js).
  const projectsRes = await agent.get('/api/projects');
  assert.equal(projectsRes.status, 200);
  assert.deepEqual(projectsRes.body, []);

  const logoutRes = await agent.post('/api/auth/logout');
  assert.equal(logoutRes.status, 204);

  const meAfterLogoutRes = await agent.get('/api/auth/me');
  assert.equal(meAfterLogoutRes.status, 401);
});

test('register: rejects a duplicate email', async () => {
  const email = `dup-${Math.random()}@example.com`;
  const first = await request(app).post('/api/auth/register').send({ name: 'A', email, password: 'password1' });
  assert.equal(first.status, 201);

  const second = await request(app).post('/api/auth/register').send({ name: 'B', email, password: 'password2' });
  assert.equal(second.status, 400);
});

test('login: rejects a wrong password without revealing whether the email exists', async () => {
  const email = `login-${Math.random()}@example.com`;
  await request(app).post('/api/auth/register').send({ name: 'A', email, password: 'correct-password' });

  const wrongPassword = await request(app).post('/api/auth/login').send({ email, password: 'wrong-password' });
  assert.equal(wrongPassword.status, 401);

  const unknownEmail = await request(app)
    .post('/api/auth/login')
    .send({ email: 'nobody@example.com', password: 'whatever' });
  assert.equal(unknownEmail.status, 401);
  assert.equal(wrongPassword.body.error, unknownEmail.body.error);
});
