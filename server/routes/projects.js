import { Router } from 'express';
import { db } from '../db/connection.js';
import { computeScorecard } from '../utils/scorecard.js';
import { requireAdmin } from '../middleware/requireAuth.js';
import { getAccessibleProjectIds, canAccessProject } from '../utils/access.js';

const router = Router();

const getProjectStmt = db.prepare('SELECT * FROM projects WHERE id = ?');
const getLeadStmt = db.prepare(`
  SELECT s.id, s.name FROM project_stakeholders ps
  JOIN stakeholders s ON s.id = ps.stakeholder_id
  WHERE ps.project_id = ? AND ps.project_role = 'lead'
`);

function serializeProject(project) {
  const lead = getLeadStmt.get(project.id) || null;
  return { ...project, lead, scorecard: computeScorecard(project) };
}

// 404 (not 403) when a non-admin can't access a project — same response as the
// project genuinely not existing, so a non-admin probing IDs can't distinguish
// "doesn't exist" from "exists but isn't yours."
function requireProjectAccess(req, res) {
  const project = getProjectStmt.get(req.params.id);
  if (!project || !canAccessProject(req.member, project.id)) {
    res.status(404).json({ error: 'project not found' });
    return null;
  }
  return project;
}

router.get('/', (req, res) => {
  const { status } = req.query;
  let projects = status
    ? db.prepare('SELECT * FROM projects WHERE status = ? ORDER BY name').all(status)
    : db.prepare('SELECT * FROM projects ORDER BY name').all();

  const accessibleIds = getAccessibleProjectIds(req.member);
  if (accessibleIds !== null) projects = projects.filter(p => accessibleIds.includes(p.id));

  res.json(projects.map(serializeProject));
});

// Creating (and deleting, below) a project is portfolio-management, not
// project-participation — admin-only, unlike everything else in this router
// which is gated by commitment to the specific project instead.
router.post('/', requireAdmin, (req, res) => {
  const { name, description, color_hex, start_date, target_end_date, budget_planned, budget_spent, lead_stakeholder_id } = req.body;

  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!lead_stakeholder_id) return res.status(400).json({ error: 'lead_stakeholder_id is required' });

  const stakeholder = db.prepare('SELECT id FROM stakeholders WHERE id = ?').get(lead_stakeholder_id);
  if (!stakeholder) return res.status(400).json({ error: 'lead_stakeholder_id does not reference an existing stakeholder' });

  const create = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO projects (name, description, color_hex, start_date, target_end_date, budget_planned, budget_spent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      name, description ?? null, color_hex ?? '#3B82F6',
      start_date ?? null, target_end_date ?? null,
      budget_planned ?? null, budget_spent ?? 0
    );
    db.prepare(`
      INSERT INTO project_stakeholders (project_id, stakeholder_id, project_role)
      VALUES (?, ?, 'lead')
    `).run(info.lastInsertRowid, lead_stakeholder_id);
    return info.lastInsertRowid;
  });

  const id = create();
  res.status(201).json(serializeProject(getProjectStmt.get(id)));
});

router.put('/:id', (req, res) => {
  const project = requireProjectAccess(req, res);
  if (!project) return;

  const {
    name = project.name,
    description = project.description,
    color_hex = project.color_hex,
    status = project.status,
    start_date = project.start_date,
    target_end_date = project.target_end_date,
    budget_planned = project.budget_planned,
    budget_spent = project.budget_spent
  } = req.body;

  let actual_end_date = project.actual_end_date;
  if (status === 'completed' && !actual_end_date) {
    actual_end_date = new Date().toISOString().slice(0, 10);
  }

  db.prepare(`
    UPDATE projects SET name = ?, description = ?, color_hex = ?, status = ?,
      start_date = ?, target_end_date = ?, budget_planned = ?, budget_spent = ?, actual_end_date = ?
    WHERE id = ?
  `).run(name, description, color_hex, status, start_date, target_end_date, budget_planned, budget_spent, actual_end_date, req.params.id);

  res.json(serializeProject(getProjectStmt.get(req.params.id)));
});

router.put('/:id/lead', (req, res) => {
  const project = requireProjectAccess(req, res);
  if (!project) return;

  const { stakeholder_id } = req.body;
  const membership = db.prepare(
    'SELECT * FROM project_stakeholders WHERE project_id = ? AND stakeholder_id = ?'
  ).get(req.params.id, stakeholder_id);
  if (!membership) return res.status(400).json({ error: 'stakeholder must already be assigned to the project' });

  const reassign = db.transaction(() => {
    db.prepare(`
      UPDATE project_stakeholders SET project_role = 'member'
      WHERE project_id = ? AND project_role = 'lead'
    `).run(req.params.id);
    db.prepare(`
      UPDATE project_stakeholders SET project_role = 'lead'
      WHERE project_id = ? AND stakeholder_id = ?
    `).run(req.params.id, stakeholder_id);
  });
  reassign();

  res.json(serializeProject(getProjectStmt.get(req.params.id)));
});

router.delete('/:id', requireAdmin, (req, res) => {
  const project = getProjectStmt.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'project not found' });
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

router.get('/:id/stakeholders', (req, res) => {
  const project = requireProjectAccess(req, res);
  if (!project) return;
  const rows = db.prepare(`
    SELECT s.id, s.name, s.email, s.role, ps.project_role
    FROM project_stakeholders ps
    JOIN stakeholders s ON s.id = ps.stakeholder_id
    WHERE ps.project_id = ?
    ORDER BY CASE ps.project_role WHEN 'lead' THEN 0 WHEN 'sponsor' THEN 1 WHEN 'member' THEN 2 ELSE 3 END, s.name
  `).all(req.params.id);
  res.json(rows);
});

router.post('/:id/stakeholders', (req, res) => {
  const project = requireProjectAccess(req, res);
  if (!project) return;

  const { stakeholder_id, project_role = 'member' } = req.body;
  if (project_role === 'lead') {
    return res.status(400).json({ error: 'use PUT /api/projects/:id/lead to set the lead' });
  }
  if (!['sponsor', 'member', 'stakeholder'].includes(project_role)) {
    return res.status(400).json({ error: 'invalid project_role' });
  }

  db.prepare(`
    INSERT INTO project_stakeholders (project_id, stakeholder_id, project_role) VALUES (?, ?, ?)
  `).run(req.params.id, stakeholder_id, project_role);

  res.status(201).json({ project_id: Number(req.params.id), stakeholder_id, project_role });
});

router.patch('/:id/stakeholders/:stakeholderId', (req, res) => {
  const project = requireProjectAccess(req, res);
  if (!project) return;

  const { project_role } = req.body;
  if (project_role === 'lead') {
    return res.status(400).json({ error: 'use PUT /api/projects/:id/lead to change the lead' });
  }
  if (!['sponsor', 'member', 'stakeholder'].includes(project_role)) {
    return res.status(400).json({ error: 'invalid project_role' });
  }
  const info = db.prepare(`
    UPDATE project_stakeholders SET project_role = ? WHERE project_id = ? AND stakeholder_id = ?
  `).run(project_role, req.params.id, req.params.stakeholderId);
  if (info.changes === 0) return res.status(404).json({ error: 'assignment not found' });
  res.json({ project_id: Number(req.params.id), stakeholder_id: Number(req.params.stakeholderId), project_role });
});

router.delete('/:id/stakeholders/:stakeholderId', (req, res) => {
  const project = requireProjectAccess(req, res);
  if (!project) return;

  const membership = db.prepare(
    'SELECT * FROM project_stakeholders WHERE project_id = ? AND stakeholder_id = ?'
  ).get(req.params.id, req.params.stakeholderId);
  if (!membership) return res.status(404).json({ error: 'assignment not found' });
  if (membership.project_role === 'lead') {
    return res.status(400).json({ error: 'cannot remove the lead — reassign the lead first' });
  }
  db.prepare('DELETE FROM project_stakeholders WHERE project_id = ? AND stakeholder_id = ?')
    .run(req.params.id, req.params.stakeholderId);
  res.status(204).end();
});

export default router;
