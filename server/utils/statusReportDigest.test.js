import assert from 'node:assert/strict';
import { test } from 'node:test';
import { db, insertEvent, insertMember, insertProjectWithLead } from '#server/test/helpers.js';
import { runStatusReportDigest } from '#server/utils/statusReportDigest.js';

// Same rule as digest.test.js: runStatusReportDigest() scans every active
// project and every notify_status_report member system-wide, so assertions
// below are always scoped to this test's own member/project.
function subscribe(memberId, projectId) {
  db.prepare('INSERT INTO member_projects (member_id, project_id) VALUES (?, ?)').run(memberId, projectId);
}
function mine(generated, memberId) {
  return generated.filter((n) => n.member_id === memberId);
}

// Must run first: this asserts a truly-empty active-projects set, which is
// only genuinely true before any other test in this file creates one.
test('runStatusReportDigest: returns an empty array when there are no active projects yet', () => {
  assert.deepEqual(runStatusReportDigest(), []);
});

test('runStatusReportDigest: one status_report notification per subscribed active project', () => {
  const { project: projectA } = insertProjectWithLead({ status: 'active' });
  const { project: projectB } = insertProjectWithLead({ status: 'active' });
  const member = insertMember({ notify_status_report: 1 });
  subscribe(member.id, projectA.id);
  subscribe(member.id, projectB.id);

  const generated = runStatusReportDigest();
  const myNotifs = mine(generated, member.id);
  assert.equal(myNotifs.length, 2);
  assert.ok(myNotifs.every((n) => n.type === 'status_report'));
  assert.ok(myNotifs.some((n) => n.subject.includes(projectA.name)));
  assert.ok(myNotifs.some((n) => n.subject.includes(projectB.name)));
});

test('runStatusReportDigest: excludes archived/completed projects even if subscribed', () => {
  const { project: active } = insertProjectWithLead({ status: 'active' });
  const { project: archived } = insertProjectWithLead({ status: 'archived' });
  const { project: completed } = insertProjectWithLead({ status: 'completed' });
  const member = insertMember({ notify_status_report: 1 });
  subscribe(member.id, active.id);
  subscribe(member.id, archived.id);
  subscribe(member.id, completed.id);

  const generated = runStatusReportDigest();
  const myNotifs = mine(generated, member.id);
  assert.equal(myNotifs.length, 1);
  assert.equal(myNotifs[0].subject, `Status report: ${active.name}`);
});

test('runStatusReportDigest: notify_status_report = 0 excludes the member entirely', () => {
  const { project } = insertProjectWithLead({ status: 'active' });
  const member = insertMember({ notify_status_report: 0 });
  subscribe(member.id, project.id);

  const generated = runStatusReportDigest();
  assert.equal(mine(generated, member.id).length, 0);
});

test('runStatusReportDigest: not subscribed to a project means no report for it, even if active', () => {
  insertProjectWithLead({ status: 'active' }); // exists, but nobody is subscribed to it
  const member = insertMember({ notify_status_report: 1 });
  // Deliberately no subscribe() call.

  const generated = runStatusReportDigest();
  assert.equal(mine(generated, member.id).length, 0);
});

test('runStatusReportDigest: report body includes schedule/cost/quality/scope, item counts, and goal progress', () => {
  const { project } = insertProjectWithLead({
    status: 'active',
    target_end_date: '2026-12-31',
    budget_planned: 1000,
    budget_spent: 250,
  });
  const member = insertMember({ notify_status_report: 1 });
  subscribe(member.id, project.id);
  const event = insertEvent(project.id);
  db.prepare("INSERT INTO action_items (event_id, text, due_date, done) VALUES (?, 'x', '2020-01-01', 0)").run(
    event.id,
  );
  db.prepare("INSERT INTO pain_points (event_id, text, severity, resolved) VALUES (?, 'x', 'High', 0)").run(event.id);
  db.prepare("INSERT INTO goals (project_id, text, achieved) VALUES (?, 'a', 1)").run(project.id);
  db.prepare("INSERT INTO goals (project_id, text, achieved) VALUES (?, 'b', 0)").run(project.id);

  const generated = runStatusReportDigest();
  const notif = mine(generated, member.id)[0];
  assert.match(notif.body, /Schedule:/);
  assert.match(notif.body, /Cost:/);
  assert.match(notif.body, /Quality:/);
  assert.match(notif.body, /Scope:/);
  assert.match(notif.body, /1 overdue action item/);
  assert.match(notif.body, /1 open high-severity pain point/);
  assert.match(notif.body, /Target end date: 31\.12\.2026/);
  assert.match(notif.body, /Budget: 250 of 1000 spent/);
  assert.match(notif.body, /Goals: 1 of 2 achieved/);
});
