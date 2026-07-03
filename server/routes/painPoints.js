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
  const { event_id, text, severity, owner_id } = req.body;
  if (!event_id || !text || !severity) return res.status(400).json({ error: 'event_id, text, and severity are required' });
  if (!canAccessEvent(req.member, event_id)) return res.status(404).json({ error: 'event not found' });
  const info = db.prepare('INSERT INTO pain_points (event_id, text, severity, owner_id) VALUES (?, ?, ?, ?)')
    .run(event_id, text, severity, owner_id ?? null);
  if (owner_id) {
    const ctx = getEventContext.get(event_id);
    notifyAssigned(owner_id, 'New pain point assigned to you',
      `"${text}" (${severity} severity — ${ctx.project_name} — ${ctx.event_title})`);
  }
  res.status(201).json(db.prepare('SELECT * FROM pain_points WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM pain_points WHERE id = ?').get(req.params.id);
  if (!existing || !canAccessEvent(req.member, existing.event_id)) return res.status(404).json({ error: 'pain point not found' });
  const { text = existing.text, severity = existing.severity, owner_id = existing.owner_id } = req.body;
  db.prepare('UPDATE pain_points SET text = ?, severity = ?, owner_id = ? WHERE id = ?')
    .run(text, severity, owner_id, req.params.id);
  if (owner_id && owner_id !== existing.owner_id) {
    const ctx = getEventContext.get(existing.event_id);
    notifyAssigned(owner_id, 'Pain point assigned to you',
      `"${text}" (${severity} severity — ${ctx.project_name} — ${ctx.event_title})`);
  }
  res.json(db.prepare('SELECT * FROM pain_points WHERE id = ?').get(req.params.id));
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM pain_points WHERE id = ?').get(req.params.id);
  if (!existing || !canAccessEvent(req.member, existing.event_id)) return res.status(404).json({ error: 'pain point not found' });
  const resolved = req.body.resolved ? 1 : 0;
  const resolved_at = resolved ? new Date().toISOString() : null;
  db.prepare('UPDATE pain_points SET resolved = ?, resolved_at = ? WHERE id = ?')
    .run(resolved, resolved_at, req.params.id);
  res.json(db.prepare('SELECT * FROM pain_points WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM pain_points WHERE id = ?').get(req.params.id);
  if (!existing || !canAccessEvent(req.member, existing.event_id)) return res.status(404).json({ error: 'pain point not found' });
  db.prepare('DELETE FROM pain_points WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
