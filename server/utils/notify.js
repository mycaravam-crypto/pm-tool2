import { db } from '../db/connection.js';
import { broadcastNotification } from '../ws.js';

const insertNotification = db.prepare(`
  INSERT INTO notifications (member_id, type, subject, body) VALUES (?, ?, ?, ?)
`);
const findMemberByStakeholder = db.prepare(`
  SELECT * FROM members WHERE stakeholder_id = ? AND notify_assigned = 1
`);
export const getFullNotification = db.prepare(`
  SELECT n.*, m.name AS member_name, m.email AS member_email
  FROM notifications n JOIN members m ON m.id = n.member_id
  WHERE n.id = ?
`);

// Stub outbox: logs a notification row instead of sending a real email — see
// schema.sql's comment on the notifications table for why. Swapping in a real
// provider means replacing this insert with an actual send call, keyed off the
// same (member, subject, body) shape. The WebSocket broadcast is a separate,
// additive concern — it's how the UI hears the doorbell in real time, it isn't
// the notification itself.
export function notifyAssigned(stakeholderId, subject, body) {
  if (!stakeholderId) return;
  const member = findMemberByStakeholder.get(stakeholderId);
  if (!member) return;
  const info = insertNotification.run(member.id, 'assigned', subject, body);
  broadcastNotification(getFullNotification.get(info.lastInsertRowid));
}
