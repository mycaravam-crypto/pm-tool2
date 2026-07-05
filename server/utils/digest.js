import { db } from '../db/connection.js';
import { broadcastNotification } from '../ws.js';
import { sendEmail } from './mailer.js';
import { getFullNotification } from './notify.js';

const insertNotification = db.prepare(`
  INSERT INTO notifications (member_id, type, subject, body, project_id) VALUES (?, ?, ?, ?, ?)
`);

// One notification per (member, project) rather than one combined row per
// member across all their subscribed projects — that's what lets each row
// carry a real project_id, which is what scopes the notification log by
// project access (see routes/notifications.js). Shared by the manual
// "Run Digest Now" endpoint and the cron.js scheduler, so both stay in sync.
export function runDigest() {
  const today = new Date().toISOString().slice(0, 10);
  const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const members = db.prepare('SELECT * FROM members').all();
  const generatedIds = [];

  const run = db.transaction(() => {
    for (const member of members) {
      const projectIds = db
        .prepare('SELECT project_id FROM member_projects WHERE member_id = ?')
        .all(member.id)
        .map((r) => r.project_id);

      for (const projectId of projectIds) {
        if (member.notify_overdue_action_items) {
          const overdue = db
            .prepare(`
            SELECT a.text, a.due_date FROM action_items a
            JOIN events e ON e.id = a.event_id
            WHERE e.project_id = ? AND a.done = 0 AND a.due_date IS NOT NULL AND a.due_date < ?
            ORDER BY a.due_date
          `)
            .all(projectId, today);
          if (overdue.length > 0) {
            const body = overdue.map((o) => `- ${o.text} (due ${o.due_date})`).join('\n');
            const info = insertNotification.run(
              member.id,
              'overdue_digest',
              `${overdue.length} overdue action item(s)`,
              body,
              projectId,
            );
            generatedIds.push(info.lastInsertRowid);
          }
        }

        if (member.notify_upcoming_deadlines) {
          const upcoming = db
            .prepare(`
            SELECT title, type, date FROM events
            WHERE project_id = ? AND type IN ('milestone', 'deadline') AND date BETWEEN ? AND ?
            ORDER BY date
          `)
            .all(projectId, today, in14);
          if (upcoming.length > 0) {
            const body = upcoming.map((u) => `- ${u.type}: ${u.title} (${u.date})`).join('\n');
            const info = insertNotification.run(
              member.id,
              'deadline_digest',
              `${upcoming.length} upcoming milestone/deadline(s)`,
              body,
              projectId,
            );
            generatedIds.push(info.lastInsertRowid);
          }
        }
      }
    }
  });
  run();

  // Broadcast/email after the transaction commits — a rollback should never
  // produce a push or email for data that didn't land.
  const notifications = generatedIds.map((id) => getFullNotification.get(id));
  for (const notification of notifications) {
    broadcastNotification(notification);
    sendEmail({ to: notification.member_email, subject: notification.subject, text: notification.body });
  }

  return notifications;
}
