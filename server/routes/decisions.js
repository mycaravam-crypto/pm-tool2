import { Router } from 'express';
import { db } from '../db/connection.js';
import { notifyAssigned } from '../utils/notify.js';
import { canAccessEvent } from '../utils/access.js';

const router = Router();

const getEventContext = db.prepare(`
  SELECT e.title AS event_title, p.name AS project_name
  FROM events e JOIN projects p ON p.id = e.project_id WHERE e.id = ?
`);

router.post('/', (req, res) => {
  const { event_id, text, decided_by } = req.body;
  if (!event_id || !text) return res.status(400).json({ error: 'event_id and text are required' });
  if (!canAccessEvent(req.member, event_id)) return res.status(404).json({ error: 'event not found' });
  const info = db.prepare('INSERT INTO decisions (event_id, text, decided_by) VALUES (?, ?, ?)')
    .run(event_id, text, decided_by ?? null);
  if (decided_by) {
    const ctx = getEventContext.get(event_id);
    notifyAssigned(decided_by, 'A decision was logged under your name',
      `"${text}" (${ctx.project_name} — ${ctx.event_title})`);
  }
  res.status(201).json(db.prepare('SELECT * FROM decisions WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM decisions WHERE id = ?').get(req.params.id);
  if (!existing || !canAccessEvent(req.member, existing.event_id)) return res.status(404).json({ error: 'decision not found' });
  const { text = existing.text, decided_by = existing.decided_by } = req.body;
  db.prepare('UPDATE decisions SET text = ?, decided_by = ? WHERE id = ?').run(text, decided_by, req.params.id);
  if (decided_by && decided_by !== existing.decided_by) {
    const ctx = getEventContext.get(existing.event_id);
    notifyAssigned(decided_by, 'A decision was logged under your name',
      `"${text}" (${ctx.project_name} — ${ctx.event_title})`);
  }
  res.json(db.prepare('SELECT * FROM decisions WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM decisions WHERE id = ?').get(req.params.id);
  if (!existing || !canAccessEvent(req.member, existing.event_id)) return res.status(404).json({ error: 'decision not found' });
  db.prepare('DELETE FROM decisions WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
