import assert from 'node:assert/strict';
import { test } from 'node:test';
import { db, insertEvent, insertMember, insertProjectWithLead } from '../test/helpers.js';
import { runDigest } from './digest.js';

// runDigest() scans every subscribed member/project system-wide, so every
// assertion below filters the returned array down to *this test's own*
// member/project rather than trusting its overall length or the function's
// return value in isolation — other tests in this file (and the DB they
// share) are still there when a later test runs.
function subscribe(memberId, projectId) {
  db.prepare('INSERT INTO member_projects (member_id, project_id) VALUES (?, ?)').run(memberId, projectId);
}

function mine(generated, memberId) {
  return generated.filter((n) => n.member_id === memberId);
}

test('runDigest: overdue action items produce one overdue_digest notification per project', () => {
  const { project } = insertProjectWithLead();
  const member = insertMember({ notify_overdue_action_items: 1 });
  subscribe(member.id, project.id);
  const event = insertEvent(project.id);
  db.prepare("INSERT INTO action_items (event_id, text, due_date, done) VALUES (?, 'overdue', '2020-01-01', 0)").run(
    event.id,
  );
  // Not overdue: due in the future.
  db.prepare("INSERT INTO action_items (event_id, text, due_date, done) VALUES (?, 'future', '2099-01-01', 0)").run(
    event.id,
  );
  // Already done — shouldn't count even though its due date has passed.
  db.prepare("INSERT INTO action_items (event_id, text, due_date, done) VALUES (?, 'done', '2020-01-01', 1)").run(
    event.id,
  );

  const generated = runDigest();
  const myNotifs = mine(generated, member.id);
  assert.equal(myNotifs.length, 1);
  assert.equal(myNotifs[0].type, 'overdue_digest');
  assert.equal(myNotifs[0].project_id, project.id);
  assert.match(myNotifs[0].body, /overdue/);
});

test('runDigest: notify_overdue_action_items = 0 suppresses the overdue-items digest', () => {
  const { project } = insertProjectWithLead();
  const member = insertMember({ notify_overdue_action_items: 0 });
  subscribe(member.id, project.id);
  const event = insertEvent(project.id);
  db.prepare("INSERT INTO action_items (event_id, text, due_date, done) VALUES (?, 'overdue', '2020-01-01', 0)").run(
    event.id,
  );

  const generated = runDigest();
  assert.equal(mine(generated, member.id).length, 0);
});

test('runDigest: overdue pending milestones/deadlines produce a deadline_digest notification', () => {
  const { project } = insertProjectWithLead();
  const member = insertMember({ notify_upcoming_deadlines: 1 });
  subscribe(member.id, project.id);
  db.prepare(
    "INSERT INTO events (project_id, title, date, type, status) VALUES (?, 'launch', '2020-01-01', 'deadline', 'pending')",
  ).run(project.id);
  // Already marked achieved — the digest only flags *pending* ones.
  db.prepare(
    "INSERT INTO events (project_id, title, date, type, status) VALUES (?, 'done already', '2020-01-01', 'milestone', 'achieved')",
  ).run(project.id);

  const generated = runDigest();
  const myNotifs = mine(generated, member.id).filter((n) => n.type === 'deadline_digest');
  assert.equal(myNotifs.length, 1);
  assert.match(myNotifs[0].body, /launch/);
});

test('runDigest: upcoming (within 14 days) milestones/deadlines produce a separate deadline_digest notification', () => {
  const { project } = insertProjectWithLead();
  const member = insertMember({ notify_upcoming_deadlines: 1 });
  subscribe(member.id, project.id);
  const soon = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  db.prepare(
    "INSERT INTO events (project_id, title, date, type, status) VALUES (?, 'soon', ?, 'milestone', 'pending')",
  ).run(project.id, soon);

  const generated = runDigest();
  const myNotifs = mine(generated, member.id).filter((n) => n.type === 'deadline_digest');
  assert.equal(myNotifs.length, 1);
  assert.match(myNotifs[0].subject, /upcoming/);
});

test('runDigest: overdue and upcoming goals each produce their own deadline_digest notification', () => {
  const { project } = insertProjectWithLead();
  const member = insertMember({ notify_upcoming_deadlines: 1 });
  subscribe(member.id, project.id);
  const soon = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  db.prepare(
    "INSERT INTO goals (project_id, text, target_date, achieved) VALUES (?, 'overdue goal', '2020-01-01', 0)",
  ).run(project.id);
  db.prepare("INSERT INTO goals (project_id, text, target_date, achieved) VALUES (?, 'soon goal', ?, 0)").run(
    project.id,
    soon,
  );
  // Achieved — must not be flagged even though its target date has passed.
  db.prepare(
    "INSERT INTO goals (project_id, text, target_date, achieved) VALUES (?, 'done goal', '2020-01-01', 1)",
  ).run(project.id);

  const generated = runDigest();
  const myNotifs = mine(generated, member.id).filter((n) => n.type === 'deadline_digest');
  assert.equal(myNotifs.length, 2);
  assert.ok(myNotifs.some((n) => n.subject.includes('overdue goal(s)')));
  assert.ok(myNotifs.some((n) => n.subject.includes('upcoming goal(s)')));
});

test('runDigest: notify_upcoming_deadlines = 0 suppresses deadline and goal digests alike', () => {
  const { project } = insertProjectWithLead();
  const member = insertMember({ notify_upcoming_deadlines: 0 });
  subscribe(member.id, project.id);
  db.prepare(
    "INSERT INTO events (project_id, title, date, type, status) VALUES (?, 'x', '2020-01-01', 'deadline', 'pending')",
  ).run(project.id);
  db.prepare("INSERT INTO goals (project_id, text, target_date, achieved) VALUES (?, 'x', '2020-01-01', 0)").run(
    project.id,
  );

  const generated = runDigest();
  assert.equal(mine(generated, member.id).length, 0);
});

test('runDigest: a member not subscribed to any project generates nothing', () => {
  const member = insertMember({ notify_overdue_action_items: 1, notify_upcoming_deadlines: 1 });
  // No member_projects row at all — nothing to scope a digest to.
  const generated = runDigest();
  assert.equal(mine(generated, member.id).length, 0);
});

test('runDigest: each returned notification includes the recipient email (via getFullNotification)', () => {
  const { project } = insertProjectWithLead();
  const member = insertMember({ notify_overdue_action_items: 1 });
  subscribe(member.id, project.id);
  const event = insertEvent(project.id);
  db.prepare("INSERT INTO action_items (event_id, text, due_date, done) VALUES (?, 'x', '2020-01-01', 0)").run(
    event.id,
  );

  const generated = runDigest();
  const myNotif = mine(generated, member.id)[0];
  assert.equal(myNotif.member_email, member.email);
});
