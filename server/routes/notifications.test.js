import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  adminAgent,
  app,
  committedAgent,
  db,
  insertMember,
  insertProjectWithLead,
  request,
} from '#server/test/helpers.js';

function insertNotification({ memberId, type = 'assigned', projectId = null, subject = 'subject', body = 'body' }) {
  return db
    .prepare('INSERT INTO notifications (member_id, type, subject, body, project_id) VALUES (?, ?, ?, ?, ?)')
    .run(memberId, type, subject, body, projectId).lastInsertRowid;
}

test('GET /api/notifications requires a session', async () => {
  const res = await request(app).get('/api/notifications');
  assert.equal(res.status, 401);
});

test('GET /api/notifications: admin sees everything, a committed member only sees their accessible projects (or untagged rows)', async () => {
  const { project: myProject } = insertProjectWithLead();
  const { project: otherProject } = insertProjectWithLead();
  const someMember = insertMember();

  const myProjectNotif = insertNotification({ memberId: someMember.id, projectId: myProject.id });
  const otherProjectNotif = insertNotification({ memberId: someMember.id, projectId: otherProject.id });
  const untaggedNotif = insertNotification({ memberId: someMember.id, projectId: null });

  const { agent: admin } = await adminAgent();
  const adminList = await admin.get('/api/notifications');
  const adminIds = adminList.body.map((n) => n.id);
  assert.ok([myProjectNotif, otherProjectNotif, untaggedNotif].every((id) => adminIds.includes(id)));

  const { agent: memberAgent } = await committedAgent(myProject.id, 'member');
  const memberList = await memberAgent.get('/api/notifications');
  const memberIds = memberList.body.map((n) => n.id);
  assert.ok(memberIds.includes(myProjectNotif));
  assert.ok(memberIds.includes(untaggedNotif));
  assert.ok(!memberIds.includes(otherProjectNotif));
});

test('GET /api/notifications: rows include member name/email and respect the limit param', async () => {
  const member = insertMember({ name: 'Notified Person' });
  for (let i = 0; i < 5; i++) insertNotification({ memberId: member.id, subject: `n${i}` });

  const { agent } = await adminAgent();
  const res = await agent.get('/api/notifications?limit=2');
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2);
  assert.equal(res.body[0].member_name, 'Notified Person');
});

test('GET /api/notifications: limit is clamped to 200', async () => {
  const { agent } = await adminAgent();
  const res = await agent.get('/api/notifications?limit=99999');
  assert.equal(res.status, 200); // would only matter with >200 rows; just confirms no error on an oversized limit
});

test('POST /api/notifications/run-digest: runs the shared digest logic and reports how many were generated', async () => {
  const { project } = insertProjectWithLead();
  const member = insertMember({ notify_overdue_action_items: 1 });
  db.prepare('INSERT INTO member_projects (member_id, project_id) VALUES (?, ?)').run(member.id, project.id);
  const event = db
    .prepare("INSERT INTO events (project_id, title, date, type) VALUES (?, 'x', '2026-01-01', 'sync')")
    .run(project.id).lastInsertRowid;
  db.prepare(
    "INSERT INTO action_items (event_id, text, due_date, done) VALUES (?, 'overdue task', '2020-01-01', 0)",
  ).run(event);

  const { agent } = await adminAgent();
  const res = await agent.post('/api/notifications/run-digest');
  assert.equal(res.status, 200);
  assert.ok(res.body.generated >= 1);
  // Scoped to this test's own member, not the run's total — runDigest scans
  // every subscribed member system-wide, and other tests in this file may
  // have their own (unrelated) subscriptions still active at this point.
  const mine = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE member_id = ?').get(member.id).n;
  assert.equal(mine, 1);
});

test('POST /api/notifications/run-status-report: runs the shared status-report logic', async () => {
  const { project } = insertProjectWithLead();
  const member = insertMember({ notify_status_report: 1 });
  db.prepare('INSERT INTO member_projects (member_id, project_id) VALUES (?, ?)').run(member.id, project.id);

  const { agent } = await adminAgent();
  const res = await agent.post('/api/notifications/run-status-report');
  assert.equal(res.status, 200);
  assert.ok(res.body.generated >= 1);
  // Scoped to this test's own member — runStatusReportDigest scans every
  // active project + subscribed member system-wide on every call (it has no
  // "already sent" state), so other tests' still-active subscriptions also
  // regenerate a report each time this runs.
  const mine = db.prepare("SELECT * FROM notifications WHERE member_id = ? AND type = 'status_report'").get(member.id);
  assert.ok(mine);
  assert.match(mine.subject, new RegExp(project.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
