import assert from 'node:assert/strict';
import { test } from 'node:test';
import { db, insertMember, insertProject, insertStakeholder } from '#server/test/helpers.js';
import { notifyAssigned } from '#server/utils/notify.js';

test('notifyAssigned: no-op when stakeholderId is falsy', () => {
  assert.doesNotThrow(() => notifyAssigned(null, 'subject', 'body'));
  assert.doesNotThrow(() => notifyAssigned(undefined, 'subject', 'body'));
});

test('notifyAssigned: no-op when the stakeholder has no linked member', () => {
  const stakeholder = insertStakeholder();
  const before = db.prepare('SELECT COUNT(*) AS n FROM notifications').get().n;
  notifyAssigned(stakeholder.id, 'subject', 'body');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM notifications').get().n, before);
});

test('notifyAssigned: no-op when the linked member has notify_assigned turned off', () => {
  const stakeholder = insertStakeholder();
  const member = insertMember({ stakeholder_id: stakeholder.id });
  db.prepare('UPDATE members SET notify_assigned = 0 WHERE id = ?').run(member.id);

  notifyAssigned(stakeholder.id, 'subject', 'body');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE member_id = ?').get(member.id).n, 0);
});

test('notifyAssigned: creates a notification row scoped to the project when the member opts in', () => {
  const stakeholder = insertStakeholder();
  const member = insertMember({ stakeholder_id: stakeholder.id });
  const project = insertProject();

  notifyAssigned(stakeholder.id, 'You were assigned something', 'the details', project.id);

  const notif = db.prepare('SELECT * FROM notifications WHERE member_id = ?').get(member.id);
  assert.ok(notif);
  assert.equal(notif.type, 'assigned');
  assert.equal(notif.subject, 'You were assigned something');
  assert.equal(notif.body, 'the details');
  assert.equal(notif.project_id, project.id);
});

test('notifyAssigned: project_id defaults to null when not given', () => {
  const stakeholder = insertStakeholder();
  const member = insertMember({ stakeholder_id: stakeholder.id });
  notifyAssigned(stakeholder.id, 'subject', 'body');
  const notif = db.prepare('SELECT * FROM notifications WHERE member_id = ?').get(member.id);
  assert.equal(notif.project_id, null);
});
