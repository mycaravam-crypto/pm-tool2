import { Router } from 'express';
import { db } from '../db/connection.js';
import { canAccessEvent, canContribute, getEventContext, getProjectIdForEvent } from '../utils/access.js';
import { notifyAssigned } from '../utils/notify.js';

const router = Router();

router.post('/', (req, res) => {
  const { event_id, text, decided_by } = req.body;
  if (!event_id || !text) return res.status(400).json({ error: 'event_id and text are required' });
  if (!canAccessEvent(req.member, event_id)) return res.status(404).json({ error: 'event not found' });
  const ctx = getEventContext.get(event_id);
  if (!canContribute(req.member, ctx.project_id))
    return res.status(403).json({ error: 'read-only access to this project' });
  const info = db
    .prepare('INSERT INTO decisions (event_id, text, decided_by) VALUES (?, ?, ?)')
    .run(event_id, text, decided_by ?? null);
  if (decided_by) {
    notifyAssigned(
      decided_by,
      'A decision was logged under your name',
      `"${text}" (${ctx.project_name} — ${ctx.event_title})`,
      ctx.project_id,
    );
  }
  res.status(201).json(db.prepare('SELECT * FROM decisions WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM decisions WHERE id = ?').get(req.params.id);
  if (!existing || !canAccessEvent(req.member, existing.event_id))
    return res.status(404).json({ error: 'decision not found' });
  const projectId = getProjectIdForEvent(existing.event_id);
  if (!canContribute(req.member, projectId)) return res.status(403).json({ error: 'read-only access to this project' });
  const { text = existing.text, decided_by = existing.decided_by } = req.body;
  db.prepare('UPDATE decisions SET text = ?, decided_by = ? WHERE id = ?').run(text, decided_by, req.params.id);
  if (decided_by && decided_by !== existing.decided_by) {
    const ctx = getEventContext.get(existing.event_id);
    notifyAssigned(
      decided_by,
      'A decision was logged under your name',
      `"${text}" (${ctx.project_name} — ${ctx.event_title})`,
      ctx.project_id,
    );
  }
  res.json(db.prepare('SELECT * FROM decisions WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM decisions WHERE id = ?').get(req.params.id);
  if (!existing || !canAccessEvent(req.member, existing.event_id))
    return res.status(404).json({ error: 'decision not found' });
  if (!canContribute(req.member, getProjectIdForEvent(existing.event_id)))
    return res.status(403).json({ error: 'read-only access to this project' });
  db.prepare('DELETE FROM decisions WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
