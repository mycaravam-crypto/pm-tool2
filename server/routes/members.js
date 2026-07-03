import { Router } from 'express';
import { db } from '../db/connection.js';
import { hashPassword } from '../utils/password.js';

const router = Router();

// Never select password_hash out to a client — has_password is the only signal
// the UI gets about whether a member can log in.
const MEMBER_COLUMNS = `
  m.id, m.name, m.email, m.stakeholder_id,
  m.notify_assigned, m.notify_overdue_action_items, m.notify_upcoming_deadlines,
  m.created_at, s.name AS stakeholder_name,
  (m.password_hash IS NOT NULL) AS has_password
`;

const getMemberStmt = db.prepare(`
  SELECT ${MEMBER_COLUMNS}
  FROM members m LEFT JOIN stakeholders s ON s.id = m.stakeholder_id
  WHERE m.id = ?
`);

router.get('/', (req, res) => {
  res.json(db.prepare(`
    SELECT ${MEMBER_COLUMNS}
    FROM members m LEFT JOIN stakeholders s ON s.id = m.stakeholder_id
    ORDER BY m.name
  `).all());
});

router.post('/', (req, res) => {
  const {
    name, email, stakeholder_id, password,
    notify_assigned = true, notify_overdue_action_items = true, notify_upcoming_deadlines = true
  } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'name and email are required' });
  if (password && password.length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' });
  if (stakeholder_id && !db.prepare('SELECT id FROM stakeholders WHERE id = ?').get(stakeholder_id)) {
    return res.status(400).json({ error: 'stakeholder_id does not reference an existing stakeholder' });
  }
  try {
    const info = db.prepare(`
      INSERT INTO members (name, email, stakeholder_id, password_hash, notify_assigned, notify_overdue_action_items, notify_upcoming_deadlines)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      name, email, stakeholder_id || null, password ? hashPassword(password) : null,
      notify_assigned ? 1 : 0, notify_overdue_action_items ? 1 : 0, notify_upcoming_deadlines ? 1 : 0
    );
    res.status(201).json(getMemberStmt.get(info.lastInsertRowid));
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: 'a member with that email already exists' });
    throw e;
  }
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'member not found' });
  const {
    name = existing.name, email = existing.email, stakeholder_id = existing.stakeholder_id,
    notify_assigned = existing.notify_assigned, notify_overdue_action_items = existing.notify_overdue_action_items,
    notify_upcoming_deadlines = existing.notify_upcoming_deadlines,
    password
  } = req.body;
  if (password && password.length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' });
  if (stakeholder_id && !db.prepare('SELECT id FROM stakeholders WHERE id = ?').get(stakeholder_id)) {
    return res.status(400).json({ error: 'stakeholder_id does not reference an existing stakeholder' });
  }
  // Blank password on an edit means "leave it as-is," not "remove the password" —
  // clearing credentials needs to be an explicit, unambiguous action, which this
  // basic version doesn't expose a control for.
  const password_hash = password ? hashPassword(password) : existing.password_hash;
  try {
    db.prepare(`
      UPDATE members SET name = ?, email = ?, stakeholder_id = ?, password_hash = ?, notify_assigned = ?,
        notify_overdue_action_items = ?, notify_upcoming_deadlines = ? WHERE id = ?
    `).run(
      name, email, stakeholder_id || null, password_hash,
      notify_assigned ? 1 : 0, notify_overdue_action_items ? 1 : 0, notify_upcoming_deadlines ? 1 : 0,
      req.params.id
    );
    res.json(getMemberStmt.get(req.params.id));
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: 'a member with that email already exists' });
    throw e;
  }
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'member not found' });
  db.prepare('DELETE FROM members WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

router.get('/:id/projects', (req, res) => {
  const rows = db.prepare(`
    SELECT p.id, p.name, p.color_hex FROM member_projects mp
    JOIN projects p ON p.id = mp.project_id
    WHERE mp.member_id = ? ORDER BY p.name
  `).all(req.params.id);
  res.json(rows);
});

router.post('/:id/projects', (req, res) => {
  const { project_id } = req.body;
  if (!project_id) return res.status(400).json({ error: 'project_id is required' });
  try {
    db.prepare('INSERT INTO member_projects (member_id, project_id) VALUES (?, ?)').run(req.params.id, project_id);
    res.status(201).json({ member_id: Number(req.params.id), project_id });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return res.status(400).json({ error: 'already subscribed to this project' });
    throw e;
  }
});

router.delete('/:id/projects/:projectId', (req, res) => {
  db.prepare('DELETE FROM member_projects WHERE member_id = ? AND project_id = ?').run(req.params.id, req.params.projectId);
  res.status(204).end();
});

export default router;
