import crypto from 'node:crypto';
import { Router } from 'express';
import { db } from '../db/connection.js';
import { COOKIE_NAME, findSession } from '../middleware/requireAuth.js';
import { verifyPassword } from '../utils/password.js';

const router = Router();
const SESSION_DAYS = 7;

function createSession(memberId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  db.prepare('INSERT INTO sessions (token, member_id, expires_at) VALUES (?, ?, ?)').run(token, memberId, expiresAt);
  return { token, expiresAt };
}

function setSessionCookie(res, token, expiresAt) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    expires: new Date(expiresAt),
    path: '/',
  });
}

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const member = db.prepare('SELECT * FROM members WHERE email = ?').get(email);
  if (!member || !verifyPassword(password, member.password_hash)) {
    return res.status(401).json({ error: 'invalid email or password' });
  }

  const { token, expiresAt } = createSession(member.id);
  setSessionCookie(res, token, expiresAt);
  res.json({
    id: member.id,
    name: member.name,
    email: member.email,
    stakeholder_id: member.stakeholder_id,
    role: member.role,
  });
});

router.post('/logout', (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.status(204).end();
});

router.get('/me', (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  const session = token ? findSession(token) : null;
  if (!session) return res.status(401).json({ error: 'not logged in' });
  const member = db
    .prepare('SELECT id, name, email, stakeholder_id, role FROM members WHERE id = ?')
    .get(session.member_id);
  if (!member) return res.status(401).json({ error: 'not logged in' });
  res.json(member);
});

export default router;
