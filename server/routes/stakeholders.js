import { Router } from 'express';
import { db } from '../db/connection.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM stakeholders ORDER BY name').all());
});

router.post('/', (req, res) => {
  const { name, email, role } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const info = db.prepare('INSERT INTO stakeholders (name, email, role) VALUES (?, ?, ?)')
    .run(name, email ?? null, role ?? null);
  res.status(201).json(db.prepare('SELECT * FROM stakeholders WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM stakeholders WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'stakeholder not found' });
  const { name = existing.name, email = existing.email, role = existing.role } = req.body;
  db.prepare('UPDATE stakeholders SET name = ?, email = ?, role = ? WHERE id = ?')
    .run(name, email, role, req.params.id);
  res.json(db.prepare('SELECT * FROM stakeholders WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM stakeholders WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'stakeholder not found' });
  db.prepare('DELETE FROM stakeholders WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
