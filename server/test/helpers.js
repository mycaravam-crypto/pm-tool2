// Shared fixture + auth helpers for route integration tests. Every test file
// runs against its own isolated ':memory:' database (see test/setup.js), so
// these insert directly via `db` rather than going through the API for setup
// — faster, and keeps each test's *own* API calls the thing actually being
// asserted on.
import request from 'supertest';
import app from '#server/app.js';
import { db } from '#server/db/connection.js';
import { hashPassword } from '#server/utils/password.js';

let counter = 0;
export function unique(prefix) {
  counter += 1;
  return `${prefix}-${counter}-${Math.random().toString(36).slice(2, 8)}`;
}

export function insertStakeholder(overrides = {}) {
  const name = overrides.name ?? unique('Stakeholder');
  const info = db
    .prepare('INSERT INTO stakeholders (name, email, role) VALUES (?, ?, ?)')
    .run(name, overrides.email ?? null, overrides.role ?? null);
  return { id: info.lastInsertRowid, name };
}

export function insertProject(overrides = {}) {
  const name = overrides.name ?? unique('Project');
  const info = db
    .prepare(`
    INSERT INTO projects (name, description, status, start_date, target_end_date, budget_planned, budget_spent)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
    .run(
      name,
      overrides.description ?? null,
      overrides.status ?? 'active',
      overrides.start_date ?? null,
      overrides.target_end_date ?? null,
      overrides.budget_planned ?? null,
      overrides.budget_spent ?? 0,
    );
  return { id: info.lastInsertRowid, name };
}

export function assignStakeholder(projectId, stakeholderId, project_role = 'member') {
  db.prepare('INSERT INTO project_stakeholders (project_id, stakeholder_id, project_role) VALUES (?, ?, ?)').run(
    projectId,
    stakeholderId,
    project_role,
  );
}

// Every project needs exactly one lead in the real app (enforced by the
// create-project route, not the schema), so most fixtures want a project
// that already has one — this bypasses the route and inserts both directly.
export function insertProjectWithLead(overrides = {}) {
  const project = insertProject(overrides);
  const lead = insertStakeholder();
  assignStakeholder(project.id, lead.id, 'lead');
  return { project, lead };
}

export function insertEvent(projectId, overrides = {}) {
  const info = db
    .prepare('INSERT INTO events (project_id, title, date, type, status) VALUES (?, ?, ?, ?, ?)')
    .run(
      projectId,
      overrides.title ?? unique('Event'),
      overrides.date ?? '2026-01-01',
      overrides.type ?? 'sync',
      overrides.status ?? 'pending',
    );
  return { id: info.lastInsertRowid };
}

export function insertMember(overrides = {}) {
  const email = overrides.email ?? `${unique('member')}@example.com`;
  const password = overrides.password ?? 'password123';
  const info = db
    .prepare(`
    INSERT INTO members (
      name, email, stakeholder_id, password_hash, role,
      notify_assigned, notify_overdue_action_items, notify_upcoming_deadlines, notify_status_report
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .run(
      overrides.name ?? 'Test Member',
      email,
      overrides.stakeholder_id ?? null,
      hashPassword(password),
      overrides.role ?? 'member',
      overrides.notify_assigned ?? 1,
      overrides.notify_overdue_action_items ?? 1,
      overrides.notify_upcoming_deadlines ?? 1,
      overrides.notify_status_report ?? 1,
    );
  return { id: info.lastInsertRowid, email, password };
}

// Logs in as `member` (creating one first if not given) and returns a
// supertest agent that carries the session cookie across subsequent calls.
export async function authedAgent(memberOverrides = {}) {
  const member = insertMember(memberOverrides);
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email: member.email, password: member.password });
  if (res.status !== 200) {
    throw new Error(`authedAgent: login failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return { agent, member };
}

export function adminAgent() {
  return authedAgent({ role: 'admin' });
}

// A member committed to `projectId` with the given team role — creates its
// own stakeholder identity and assignment. This is the shape needed to test
// canContribute/canManageProject/canDeleteProjectItems from the outside.
export async function committedAgent(projectId, project_role = 'member') {
  const stakeholder = insertStakeholder();
  assignStakeholder(projectId, stakeholder.id, project_role);
  const { agent, member } = await authedAgent({ stakeholder_id: stakeholder.id });
  return { agent, member, stakeholder };
}

export { app, db, request };
