import { Router } from 'express';
import { db } from '../db/connection.js';
import { notifyAssigned } from '../utils/notify.js';

const router = Router();

const getEventStmt = db.prepare('SELECT * FROM events WHERE id = ?');
const getProjectStmt = db.prepare('SELECT id, name, color_hex FROM projects WHERE id = ?');
const getParticipantsStmt = db.prepare(`
  SELECT s.id, s.name FROM event_participants ep
  JOIN stakeholders s ON s.id = ep.stakeholder_id
  WHERE ep.event_id = ?
`);
const getDecisionsStmt = db.prepare(`
  SELECT d.*, s.name AS decided_by_name FROM decisions d
  LEFT JOIN stakeholders s ON s.id = d.decided_by
  WHERE d.event_id = ? ORDER BY d.created_at
`);
const getActionItemsStmt = db.prepare(`
  SELECT a.*, s.name AS assignee_name FROM action_items a
  LEFT JOIN stakeholders s ON s.id = a.assignee_id
  WHERE a.event_id = ? ORDER BY a.created_at
`);
const getPainPointsStmt = db.prepare(`
  SELECT p.*, s.name AS owner_name FROM pain_points p
  LEFT JOIN stakeholders s ON s.id = p.owner_id
  WHERE p.event_id = ? ORDER BY p.created_at
`);

function serializeEvent(event) {
  return {
    ...event,
    project: getProjectStmt.get(event.project_id),
    participants: getParticipantsStmt.all(event.id),
    decisions: getDecisionsStmt.all(event.id),
    action_items: getActionItemsStmt.all(event.id),
    pain_points: getPainPointsStmt.all(event.id)
  };
}

router.get('/', (req, res) => {
  const { project_ids } = req.query;
  if (!project_ids) return res.json([]);
  const ids = project_ids.split(',').map(Number).filter(Number.isFinite);
  if (ids.length === 0) return res.json([]);
  const placeholders = ids.map(() => '?').join(',');
  const events = db.prepare(`SELECT * FROM events WHERE project_id IN (${placeholders}) ORDER BY date`).all(...ids);
  res.json(events.map(serializeEvent));
});

router.post('/', (req, res) => {
  const { project_id, title, date, type, summary, status = 'pending', participants = [], decisions = [], action_items = [], pain_points = [] } = req.body;
  if (!project_id || !title || !date || !type) {
    return res.status(400).json({ error: 'project_id, title, date, and type are required' });
  }

  const create = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO events (project_id, title, date, type, summary, status) VALUES (?, ?, ?, ?, ?, ?)
    `).run(project_id, title, date, type, summary ?? null, status);
    const eventId = info.lastInsertRowid;

    for (const stakeholderId of participants) {
      db.prepare('INSERT INTO event_participants (event_id, stakeholder_id) VALUES (?, ?)').run(eventId, stakeholderId);
    }
    for (const d of decisions) {
      db.prepare('INSERT INTO decisions (event_id, text, decided_by) VALUES (?, ?, ?)').run(eventId, d.text, d.decided_by ?? null);
    }
    for (const a of action_items) {
      db.prepare('INSERT INTO action_items (event_id, text, assignee_id, due_date) VALUES (?, ?, ?, ?)')
        .run(eventId, a.text, a.assignee_id ?? null, a.due_date ?? null);
    }
    for (const p of pain_points) {
      db.prepare('INSERT INTO pain_points (event_id, text, severity, owner_id) VALUES (?, ?, ?, ?)')
        .run(eventId, p.text, p.severity, p.owner_id ?? null);
    }
    return eventId;
  });

  const id = create();

  // Notify after the transaction commits, not inside it — a rollback shouldn't leave
  // a "you were assigned" notification for data that never actually landed.
  const projectName = getProjectStmt.get(project_id)?.name ?? '';
  for (const d of decisions) {
    if (d.decided_by) notifyAssigned(d.decided_by, 'A decision was logged under your name', `"${d.text}" (${projectName} — ${title})`);
  }
  for (const a of action_items) {
    if (a.assignee_id) notifyAssigned(a.assignee_id, 'New action item assigned to you', `"${a.text}" (${projectName} — ${title})${a.due_date ? ` — due ${a.due_date}` : ''}`);
  }
  for (const p of pain_points) {
    if (p.owner_id) notifyAssigned(p.owner_id, 'New pain point assigned to you', `"${p.text}" (${p.severity} severity — ${projectName} — ${title})`);
  }

  res.status(201).json(serializeEvent(getEventStmt.get(id)));
});

router.put('/:id', (req, res) => {
  const event = getEventStmt.get(req.params.id);
  if (!event) return res.status(404).json({ error: 'event not found' });

  const {
    title = event.title,
    date = event.date,
    type = event.type,
    summary = event.summary,
    status = event.status,
    participants
  } = req.body;

  const update = db.transaction(() => {
    db.prepare(`
      UPDATE events SET title = ?, date = ?, type = ?, summary = ?, status = ?, updated_at = datetime('now') WHERE id = ?
    `).run(title, date, type, summary, status, req.params.id);

    if (Array.isArray(participants)) {
      db.prepare('DELETE FROM event_participants WHERE event_id = ?').run(req.params.id);
      for (const stakeholderId of participants) {
        db.prepare('INSERT INTO event_participants (event_id, stakeholder_id) VALUES (?, ?)').run(req.params.id, stakeholderId);
      }
    }
  });
  update();

  res.json(serializeEvent(getEventStmt.get(req.params.id)));
});

router.delete('/:id', (req, res) => {
  const event = getEventStmt.get(req.params.id);
  if (!event) return res.status(404).json({ error: 'event not found' });
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
