import { Router } from 'express';
import { db } from '../db/connection.js';
import { broadcastNotification } from '../ws.js';
import { getFullNotification } from '../utils/notify.js';

const router = Router();

router.get('/', (req, res) => {
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const rows = db.prepare(`
    SELECT n.*, m.name AS member_name, m.email AS member_email
    FROM notifications n JOIN members m ON m.id = n.member_id
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT ?
  `).all(limit);
  res.json(rows);
});

// Stands in for a scheduled (e.g. nightly) cron job — there's no background scheduler
// in this prototype, so digests are generated on demand via this endpoint instead.
router.post('/run-digest', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  const insertNotification = db.prepare(`
    INSERT INTO notifications (member_id, type, subject, body) VALUES (?, ?, ?, ?)
  `);
  const members = db.prepare('SELECT * FROM members').all();

  const generatedIds = [];

  const run = db.transaction(() => {
    for (const member of members) {
      const projectIds = db.prepare('SELECT project_id FROM member_projects WHERE member_id = ?')
        .all(member.id).map(r => r.project_id);
      if (projectIds.length === 0) continue;
      const placeholders = projectIds.map(() => '?').join(',');

      if (member.notify_overdue_action_items) {
        const overdue = db.prepare(`
          SELECT a.text, a.due_date, p.name AS project_name FROM action_items a
          JOIN events e ON e.id = a.event_id
          JOIN projects p ON p.id = e.project_id
          WHERE e.project_id IN (${placeholders}) AND a.done = 0 AND a.due_date IS NOT NULL AND a.due_date < ?
          ORDER BY a.due_date
        `).all(...projectIds, today);
        if (overdue.length > 0) {
          const body = overdue.map(o => `- [${o.project_name}] ${o.text} (due ${o.due_date})`).join('\n');
          const info = insertNotification.run(member.id, 'overdue_digest', `${overdue.length} overdue action item(s)`, body);
          generatedIds.push(info.lastInsertRowid);
        }
      }

      if (member.notify_upcoming_deadlines) {
        const upcoming = db.prepare(`
          SELECT e.title, e.type, e.date, p.name AS project_name FROM events e
          JOIN projects p ON p.id = e.project_id
          WHERE e.project_id IN (${placeholders}) AND e.type IN ('milestone', 'deadline') AND e.date BETWEEN ? AND ?
          ORDER BY e.date
        `).all(...projectIds, today, in14);
        if (upcoming.length > 0) {
          const body = upcoming.map(u => `- [${u.project_name}] ${u.type}: ${u.title} (${u.date})`).join('\n');
          const info = insertNotification.run(member.id, 'deadline_digest', `${upcoming.length} upcoming milestone/deadline(s)`, body);
          generatedIds.push(info.lastInsertRowid);
        }
      }
    }
  });
  run();

  // Broadcast after the transaction commits, same rule as everywhere else that
  // calls notify — a rollback should never produce a WebSocket push for data that
  // didn't land.
  for (const id of generatedIds) broadcastNotification(getFullNotification.get(id));

  res.json({ generated: generatedIds.length });
});

export default router;
