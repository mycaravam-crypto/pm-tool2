import { Router } from 'express';
import { db } from '../db/connection.js';
import { canAccessProject, canContribute } from '../utils/access.js';

const router = Router();

router.post('/', (req, res) => {
  const { project_id, text, target_date } = req.body;
  if (!project_id || !text) return res.status(400).json({ error: 'project_id and text are required' });
  if (!canAccessProject(req.member, project_id)) return res.status(404).json({ error: 'project not found' });
  if (!canContribute(req.member, project_id))
    return res.status(403).json({ error: 'read-only access to this project' });
  const info = db
    .prepare('INSERT INTO goals (project_id, text, target_date) VALUES (?, ?, ?)')
    .run(project_id, text, target_date ?? null);
  res.status(201).json(db.prepare('SELECT * FROM goals WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id);
  if (!existing || !canAccessProject(req.member, existing.project_id))
    return res.status(404).json({ error: 'goal not found' });
  if (!canContribute(req.member, existing.project_id))
    return res.status(403).json({ error: 'read-only access to this project' });
  const { text = existing.text, target_date = existing.target_date } = req.body;
  db.prepare('UPDATE goals SET text = ?, target_date = ? WHERE id = ?').run(text, target_date, req.params.id);
  res.json(db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id));
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id);
  if (!existing || !canAccessProject(req.member, existing.project_id))
    return res.status(404).json({ error: 'goal not found' });
  if (!canContribute(req.member, existing.project_id))
    return res.status(403).json({ error: 'read-only access to this project' });
  const achieved = req.body.achieved ? 1 : 0;
  db.prepare('UPDATE goals SET achieved = ? WHERE id = ?').run(achieved, req.params.id);
  res.json(db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id);
  if (!existing || !canAccessProject(req.member, existing.project_id))
    return res.status(404).json({ error: 'goal not found' });
  if (!canContribute(req.member, existing.project_id))
    return res.status(403).json({ error: 'read-only access to this project' });
  db.prepare('DELETE FROM goals WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
