import { Router } from 'express';
import { db } from '../db/connection.js';
import { canAccessProject, canContribute, canDeleteProjectItems } from '../utils/access.js';

const router = Router();

// A goal_id must reference a goal on the same project — otherwise a requirement
// could claim to serve an outcome from a project it isn't even part of.
function goalBelongsToProject(goalId, projectId) {
  if (goalId == null) return true;
  const goal = db.prepare('SELECT project_id FROM goals WHERE id = ?').get(goalId);
  return !!goal && goal.project_id === Number(projectId);
}

router.post('/', (req, res) => {
  const { project_id, text, goal_id = null } = req.body;
  if (!project_id || !text) return res.status(400).json({ error: 'project_id and text are required' });
  if (!canAccessProject(req.member, project_id)) return res.status(404).json({ error: 'project not found' });
  if (!canContribute(req.member, project_id))
    return res.status(403).json({ error: 'read-only access to this project' });
  if (!goalBelongsToProject(goal_id, project_id))
    return res.status(400).json({ error: 'goal_id does not reference a goal on this project' });
  const info = db
    .prepare('INSERT INTO requirements (project_id, text, goal_id) VALUES (?, ?, ?)')
    .run(project_id, text, goal_id);
  res.status(201).json(db.prepare('SELECT * FROM requirements WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM requirements WHERE id = ?').get(req.params.id);
  if (!existing || !canAccessProject(req.member, existing.project_id))
    return res.status(404).json({ error: 'requirement not found' });
  if (!canContribute(req.member, existing.project_id))
    return res.status(403).json({ error: 'read-only access to this project' });
  const { text = existing.text, goal_id = existing.goal_id } = req.body;
  if (!goalBelongsToProject(goal_id, existing.project_id))
    return res.status(400).json({ error: 'goal_id does not reference a goal on this project' });

  // History only logs actual text edits — a goal_id-only relink (the dropdown next to
  // each requirement) still hits this route but isn't "content history."
  const update = db.transaction(() => {
    if (text !== existing.text) {
      db.prepare('INSERT INTO requirement_history (requirement_id, previous_text, changed_by) VALUES (?, ?, ?)').run(
        existing.id,
        existing.text,
        req.member.id,
      );
    }
    db.prepare('UPDATE requirements SET text = ?, goal_id = ? WHERE id = ?').run(text, goal_id, req.params.id);
  });
  update();

  res.json(db.prepare('SELECT * FROM requirements WHERE id = ?').get(req.params.id));
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM requirements WHERE id = ?').get(req.params.id);
  if (!existing || !canAccessProject(req.member, existing.project_id))
    return res.status(404).json({ error: 'requirement not found' });
  if (!canContribute(req.member, existing.project_id))
    return res.status(403).json({ error: 'read-only access to this project' });
  const done = req.body.done ? 1 : 0;
  db.prepare('UPDATE requirements SET done = ? WHERE id = ?').run(done, req.params.id);
  res.json(db.prepare('SELECT * FROM requirements WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM requirements WHERE id = ?').get(req.params.id);
  if (!existing || !canAccessProject(req.member, existing.project_id))
    return res.status(404).json({ error: 'requirement not found' });
  if (!canDeleteProjectItems(req.member, existing.project_id))
    return res.status(403).json({ error: 'only the project lead can delete this' });
  db.prepare('DELETE FROM requirements WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
