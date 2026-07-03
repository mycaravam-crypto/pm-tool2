import { Router } from 'express';
import { db } from '../db/connection.js';
import { canAccessProject } from '../utils/access.js';

const router = Router();

router.post('/', (req, res) => {
  const { project_id, text } = req.body;
  if (!project_id || !text) return res.status(400).json({ error: 'project_id and text are required' });
  if (!canAccessProject(req.member, project_id)) return res.status(404).json({ error: 'project not found' });
  const info = db.prepare('INSERT INTO requirements (project_id, text) VALUES (?, ?)').run(project_id, text);
  res.status(201).json(db.prepare('SELECT * FROM requirements WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM requirements WHERE id = ?').get(req.params.id);
  if (!existing || !canAccessProject(req.member, existing.project_id)) return res.status(404).json({ error: 'requirement not found' });
  const { text = existing.text } = req.body;
  db.prepare('UPDATE requirements SET text = ? WHERE id = ?').run(text, req.params.id);
  res.json(db.prepare('SELECT * FROM requirements WHERE id = ?').get(req.params.id));
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM requirements WHERE id = ?').get(req.params.id);
  if (!existing || !canAccessProject(req.member, existing.project_id)) return res.status(404).json({ error: 'requirement not found' });
  const done = req.body.done ? 1 : 0;
  db.prepare('UPDATE requirements SET done = ? WHERE id = ?').run(done, req.params.id);
  res.json(db.prepare('SELECT * FROM requirements WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM requirements WHERE id = ?').get(req.params.id);
  if (!existing || !canAccessProject(req.member, existing.project_id)) return res.status(404).json({ error: 'requirement not found' });
  db.prepare('DELETE FROM requirements WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
