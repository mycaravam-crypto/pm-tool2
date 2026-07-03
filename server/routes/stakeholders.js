import { Router } from 'express';
import { db } from '../db/connection.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM stakeholders ORDER BY name').all());
});

router.post('/', (req, res) => {
  const { name, email, role } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const info = db.prepare('INSERT INTO stakeholders (name, email, role) VALUES (?, ?, ?)')
      .run(name, email || null, role || null);
    res.status(201).json(db.prepare('SELECT * FROM stakeholders WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: 'a stakeholder with that email already exists' });
    throw e;
  }
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM stakeholders WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'stakeholder not found' });
  const { name = existing.name, email = existing.email, role = existing.role } = req.body;
  try {
    db.prepare('UPDATE stakeholders SET name = ?, email = ?, role = ? WHERE id = ?')
      .run(name, email || null, role || null, req.params.id);
    res.json(db.prepare('SELECT * FROM stakeholders WHERE id = ?').get(req.params.id));
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: 'a stakeholder with that email already exists' });
    throw e;
  }
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM stakeholders WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'stakeholder not found' });

  const ledProjects = db.prepare(`
    SELECT p.name FROM project_stakeholders ps
    JOIN projects p ON p.id = ps.project_id
    WHERE ps.stakeholder_id = ? AND ps.project_role = 'lead'
  `).all(req.params.id);
  if (ledProjects.length > 0) {
    return res.status(400).json({
      error: `reassign the lead on ${ledProjects.map(p => p.name).join(', ')} before deleting this stakeholder`
    });
  }

  db.prepare('DELETE FROM stakeholders WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
