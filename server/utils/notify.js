import { db } from '../db/connection.js';
import { broadcastNotification } from '../ws.js';
import { sendEmail } from './mailer.js';

const insertNotification = db.prepare(`
  INSERT INTO notifications (member_id, type, subject, body, project_id) VALUES (?, ?, ?, ?, ?)
`);
const findMemberByStakeholder = db.prepare(`
  SELECT * FROM members WHERE stakeholder_id = ? AND notify_assigned = 1
`);
export const getFullNotification = db.prepare(`
  SELECT n.*, m.name AS member_name, m.email AS member_email
  FROM notifications n JOIN members m ON m.id = n.member_id
  WHERE n.id = ?
`);

// Logs a notification row and emails it (mailer.js falls back to console
// logging if no SMTP is configured). The WebSocket broadcast is a separate,
// additive concern — it's how the UI hears the doorbell in real time, it isn't
// the notification itself. projectId is optional context used to scope the
// notification log by project access (see routes/notifications.js).
export function notifyAssigned(stakeholderId, subject, body, projectId = null) {
  if (!stakeholderId) return;
  const member = findMemberByStakeholder.get(stakeholderId);
  if (!member) return;
  const info = insertNotification.run(member.id, 'assigned', subject, body, projectId);
  const notification = getFullNotification.get(info.lastInsertRowid);
  broadcastNotification(notification);
  sendEmail({ to: member.email, subject, text: body });
}
