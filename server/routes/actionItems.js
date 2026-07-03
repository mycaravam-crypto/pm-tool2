import { Router } from 'express';
import { db } from '../db/connection.js';

const router = Router();

router.post('/', (req, res) => {
  const { event_id, text, assignee_id, due_date } = req.body;
  if (!event_id || !text) return res.status(400).json({ error: 'event_id and text are required' });
  const info = db.prepare('INSERT INTO action_items (event_id, text, assignee_id, due_date) VALUES (?, ?, ?, ?)')
    .run(event_id, text, assignee_id ?? null, due_date ?? null);
  res.status(201).json(db.prepare('SELECT * FROM action_items WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM action_items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'action item not found' });
  const { text = existing.text, assignee_id = existing.assignee_id, due_date = existing.due_date } = req.body;
  db.prepare('UPDATE action_items SET text = ?, assignee_id = ?, due_date = ? WHERE id = ?')
    .run(text, assignee_id, due_date, req.params.id);
  res.json(db.prepare('SELECT * FROM action_items WHERE id = ?').get(req.params.id));
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM action_items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'action item not found' });
  const done = req.body.done ? 1 : 0;
  db.prepare('UPDATE action_items SET done = ? WHERE id = ?').run(done, req.params.id);
  res.json(db.prepare('SELECT * FROM action_items WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM action_items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'action item not found' });
  db.prepare('DELETE FROM action_items WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
