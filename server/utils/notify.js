import { db } from '../db/connection.js';

const insertNotification = db.prepare(`
  INSERT INTO notifications (member_id, type, subject, body) VALUES (?, ?, ?, ?)
`);
const findMemberByStakeholder = db.prepare(`
  SELECT * FROM members WHERE stakeholder_id = ? AND notify_assigned = 1
`);

// Stub outbox: logs a notification row instead of sending a real email — see
// schema.sql's comment on the notifications table for why. Swapping in a real
// provider means replacing this insert with an actual send call, keyed off the
// same (member, subject, body) shape.
export function notifyAssigned(stakeholderId, subject, body) {
  if (!stakeholderId) return;
  const member = findMemberByStakeholder.get(stakeholderId);
  if (!member) return;
  insertNotification.run(member.id, 'assigned', subject, body);
}
