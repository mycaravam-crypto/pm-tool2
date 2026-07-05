import crypto from 'node:crypto';
import { Router } from 'express';
import { db } from '../db/connection.js';
import { COOKIE_NAME, findSession } from '../middleware/requireAuth.js';
import { sendEmail } from '../utils/mailer.js';
import { hashPassword, verifyPassword } from '../utils/password.js';

const router = Router();
const SESSION_DAYS = 7;
const RESET_TOKEN_HOURS = 1;

function createSession(memberId) {
  const token = crypto.randomBytes(32).toString('hex');
  // expires_at is computed by SQLite itself (not new Date().toISOString()) so it's
  // stored in the same "YYYY-MM-DD HH:MM:SS" format datetime('now') produces. Mixing
  // formats broke expiry checks entirely: the ISO 'T' separator (0x54) sorts after
  // ' ' (0x20), so `expires_at > datetime('now')` was true for any same-UTC-day
  // timestamp regardless of the actual time — see findSession below.
  db.prepare(`
    INSERT INTO sessions (token, member_id, expires_at) VALUES (?, ?, datetime('now', ?))
  `).run(token, memberId, `+${SESSION_DAYS} days`);
  // For the cookie's `expires` attribute only — an approximate hint to the browser,
  // not the security boundary (findSession's server-side check is authoritative).
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
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

// Self-service signup — a fresh member row with no stakeholder_id, which means
// they're committed to zero projects (see utils/access.js) until an admin adds
// them as a project stakeholder. Logging in immediately is safe for exactly
// that reason: signing up, by itself, can't grant access to anything.
router.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, and password are required' });
  if (password.length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' });

  let memberId;
  try {
    const info = db
      .prepare('INSERT INTO members (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(name, email, hashPassword(password), 'member');
    memberId = info.lastInsertRowid;
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE')
      return res.status(400).json({ error: 'a member with that email already exists' });
    throw e;
  }

  const member = db.prepare('SELECT id, name, email, stakeholder_id, role FROM members WHERE id = ?').get(memberId);
  const { token, expiresAt } = createSession(memberId);
  setSessionCookie(res, token, expiresAt);
  res.status(201).json(member);
});

// Always responds 200 regardless of whether the email matches an account, to
// avoid leaking which emails are registered. Works whether or not the member
// already has a password set — it doubles as a "set your first password" path
// for an admin-created member who hasn't logged in yet.
router.post('/forgot-password', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });

  const member = db.prepare('SELECT id, name, email FROM members WHERE email = ?').get(email);
  if (member) {
    const token = crypto.randomBytes(32).toString('hex');
    // Computed by SQLite (see createSession's comment above) so the format matches
    // datetime('now') at the comparison in /reset-password below — a JS-computed
    // ISO string there made the 1-hour expiry never actually take effect.
    db.prepare(`
      INSERT INTO password_resets (member_id, token, expires_at) VALUES (?, ?, datetime('now', ?))
    `).run(member.id, token, `+${RESET_TOKEN_HOURS} hours`);
    sendEmail({
      to: member.email,
      subject: 'Reset your ChronosPM password',
      text: `Hi ${member.name},\n\nUse this link to reset your password (valid for ${RESET_TOKEN_HOURS} hour): ${
        process.env.CLIENT_ORIGIN || 'http://localhost:5173'
      }/?reset_token=${token}\n\nIf you didn't request this, you can ignore this email.`,
    });
  }
  res.status(200).json({ ok: true });
});

router.post('/reset-password', (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'token and password are required' });
  if (password.length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' });

  const reset = db
    .prepare("SELECT * FROM password_resets WHERE token = ? AND used_at IS NULL AND expires_at > datetime('now')")
    .get(token);
  if (!reset) return res.status(400).json({ error: 'reset link is invalid or has expired' });

  const apply = db.transaction(() => {
    db.prepare('UPDATE members SET password_hash = ? WHERE id = ?').run(hashPassword(password), reset.member_id);
    db.prepare("UPDATE password_resets SET used_at = datetime('now') WHERE id = ?").run(reset.id);
    // A stolen old session shouldn't survive a password reset.
    db.prepare('DELETE FROM sessions WHERE member_id = ?').run(reset.member_id);
  });
  apply();

  res.status(200).json({ ok: true });
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
