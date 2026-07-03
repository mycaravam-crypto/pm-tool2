import { Router } from 'express';
import { db } from '../db/connection.js';

const router = Router();

router.post('/', (req, res) => {
  const { event_id, text, decided_by } = req.body;
  if (!event_id || !text) return res.status(400).json({ error: 'event_id and text are required' });
  const info = db.prepare('INSERT INTO decisions (event_id, text, decided_by) VALUES (?, ?, ?)')
    .run(event_id, text, decided_by ?? null);
  res.status(201).json(db.prepare('SELECT * FROM decisions WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM decisions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'decision not found' });
  const { text = existing.text, decided_by = existing.decided_by } = req.body;
  db.prepare('UPDATE decisions SET text = ?, decided_by = ? WHERE id = ?').run(text, decided_by, req.params.id);
  res.json(db.prepare('SELECT * FROM decisions WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM decisions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'decision not found' });
  db.prepare('DELETE FROM decisions WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
