import { db } from '../db/connection.js';
import { isAdmin } from '../utils/access.js';

export const COOKIE_NAME = 'sid';

export function findSession(token) {
  return db.prepare("SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')").get(token);
}

// Gates every /api/* route except /api/auth/* (mounted before this in index.js —
// you obviously can't require a session to create one). Attaches req.member,
// including its role, so downstream routes/middleware (requireAdmin below,
// utils/access.js) can act on it.
export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  const session = token ? findSession(token) : null;
  if (!session) return res.status(401).json({ error: 'authentication required' });

  const member = db
    .prepare('SELECT id, name, email, stakeholder_id, role FROM members WHERE id = ?')
    .get(session.member_id);
  if (!member) return res.status(401).json({ error: 'authentication required' });

  req.member = member;
  next();
}

// Mount after requireAuth — depends on req.member being set. Used both as a
// whole-router gate (Stakeholder Directory, Members management — see PLAN.md
// Section 3.H) and per-route (project create/delete).
export function requireAdmin(req, res, next) {
  if (!isAdmin(req.member)) return res.status(403).json({ error: 'admin access required' });
  next();
}
