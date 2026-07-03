import { Router } from 'express';
import { db } from '../db/connection.js';

const router = Router();

router.post('/', (req, res) => {
  const { event_id, text, severity, owner_id } = req.body;
  if (!event_id || !text || !severity) return res.status(400).json({ error: 'event_id, text, and severity are required' });
  const info = db.prepare('INSERT INTO pain_points (event_id, text, severity, owner_id) VALUES (?, ?, ?, ?)')
    .run(event_id, text, severity, owner_id ?? null);
  res.status(201).json(db.prepare('SELECT * FROM pain_points WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM pain_points WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'pain point not found' });
  const { text = existing.text, severity = existing.severity, owner_id = existing.owner_id } = req.body;
  db.prepare('UPDATE pain_points SET text = ?, severity = ?, owner_id = ? WHERE id = ?')
    .run(text, severity, owner_id, req.params.id);
  res.json(db.prepare('SELECT * FROM pain_points WHERE id = ?').get(req.params.id));
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM pain_points WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'pain point not found' });
  const resolved = req.body.resolved ? 1 : 0;
  const resolved_at = resolved ? new Date().toISOString() : null;
  db.prepare('UPDATE pain_points SET resolved = ?, resolved_at = ? WHERE id = ?')
    .run(resolved, resolved_at, req.params.id);
  res.json(db.prepare('SELECT * FROM pain_points WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM pain_points WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'pain point not found' });
  db.prepare('DELETE FROM pain_points WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
