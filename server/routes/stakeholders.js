import { Router } from 'express';
import { db } from '../db/connection.js';

const router = Router();

// Overload signal: computed on the fly across all stakeholders in a handful of
// grouped queries (not per-row, to avoid N+1) — same "computed, not stored"
// philosophy as the project RAG scorecard (see utils/scorecard.js). "Overloaded"
// is deliberately a rough heuristic: lead on 2+ active projects at once (the
// accountable-owner role, doubled up), or 5+ open items (action items + pain
// points) assigned across all projects.
const activeLeadCountsStmt = db.prepare(`
  SELECT ps.stakeholder_id AS id, COUNT(*) AS n
  FROM project_stakeholders ps
  JOIN projects p ON p.id = ps.project_id
  WHERE p.status = 'active' AND ps.project_role = 'lead'
  GROUP BY ps.stakeholder_id
`);
const activeProjectCountsStmt = db.prepare(`
  SELECT ps.stakeholder_id AS id, COUNT(*) AS n
  FROM project_stakeholders ps
  JOIN projects p ON p.id = ps.project_id
  WHERE p.status = 'active'
  GROUP BY ps.stakeholder_id
`);
const openActionItemCountsStmt = db.prepare(`
  SELECT assignee_id AS id, COUNT(*) AS n FROM action_items
  WHERE assignee_id IS NOT NULL AND done = 0
  GROUP BY assignee_id
`);
const openPainPointCountsStmt = db.prepare(`
  SELECT owner_id AS id, COUNT(*) AS n FROM pain_points
  WHERE owner_id IS NOT NULL AND resolved = 0
  GROUP BY owner_id
`);

const OVERLOAD_LEAD_THRESHOLD = 2;
const OVERLOAD_OPEN_ITEMS_THRESHOLD = 5;

function withWorkload(stakeholders) {
  const toMap = (rows) => new Map(rows.map((r) => [r.id, r.n]));
  const activeLeadCounts = toMap(activeLeadCountsStmt.all());
  const activeProjectCounts = toMap(activeProjectCountsStmt.all());
  const openActionItems = toMap(openActionItemCountsStmt.all());
  const openPainPoints = toMap(openPainPointCountsStmt.all());

  return stakeholders.map((s) => {
    const active_project_count = activeProjectCounts.get(s.id) ?? 0;
    const active_lead_count = activeLeadCounts.get(s.id) ?? 0;
    const open_item_count = (openActionItems.get(s.id) ?? 0) + (openPainPoints.get(s.id) ?? 0);
    return {
      ...s,
      active_project_count,
      open_item_count,
      overloaded: active_lead_count >= OVERLOAD_LEAD_THRESHOLD || open_item_count >= OVERLOAD_OPEN_ITEMS_THRESHOLD,
    };
  });
}

router.get('/', (_req, res) => {
  res.json(withWorkload(db.prepare('SELECT * FROM stakeholders ORDER BY name').all()));
});

router.post('/', (req, res) => {
  const { name, email, role } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const info = db
      .prepare('INSERT INTO stakeholders (name, email, role) VALUES (?, ?, ?)')
      .run(name, email || null, role || null);
    res.status(201).json(db.prepare('SELECT * FROM stakeholders WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE')
      return res.status(400).json({ error: 'a stakeholder with that email already exists' });
    throw e;
  }
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM stakeholders WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'stakeholder not found' });
  const { name = existing.name, email = existing.email, role = existing.role } = req.body;
  try {
    db.prepare('UPDATE stakeholders SET name = ?, email = ?, role = ? WHERE id = ?').run(
      name,
      email || null,
      role || null,
      req.params.id,
    );
    res.json(db.prepare('SELECT * FROM stakeholders WHERE id = ?').get(req.params.id));
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE')
      return res.status(400).json({ error: 'a stakeholder with that email already exists' });
    throw e;
  }
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM stakeholders WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'stakeholder not found' });

  const ledProjects = db
    .prepare(`
    SELECT p.name FROM project_stakeholders ps
    JOIN projects p ON p.id = ps.project_id
    WHERE ps.stakeholder_id = ? AND ps.project_role = 'lead'
  `)
    .all(req.params.id);
  if (ledProjects.length > 0) {
    return res.status(400).json({
      error: `reassign the lead on ${ledProjects.map((p) => p.name).join(', ')} before deleting this stakeholder`,
    });
  }

  db.prepare('DELETE FROM stakeholders WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
