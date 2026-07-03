import { db } from '../db/connection.js';

export const COOKIE_NAME = 'sid';

export function findSession(token) {
  return db.prepare("SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')").get(token);
}

// Gates every /api/* route except /api/auth/* (mounted before this in index.js —
// you obviously can't require a session to create one). No roles/permissions here,
// only "is there a valid session at all" — see PLAN.md's non-goals for this phase.
export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  const session = token ? findSession(token) : null;
  if (!session) return res.status(401).json({ error: 'authentication required' });

  const member = db.prepare('SELECT id, name, email, stakeholder_id FROM members WHERE id = ?').get(session.member_id);
  if (!member) return res.status(401).json({ error: 'authentication required' });

  req.member = member;
  next();
}
