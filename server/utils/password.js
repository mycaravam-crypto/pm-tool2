import crypto from 'node:crypto';

const KEYLEN = 64;

// scrypt via Node's built-in crypto — no bcrypt/argon2 dependency needed for a
// "basic" login. Stored as "salt:hash", both hex.
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, KEYLEN);
  const stored_ = Buffer.from(hash, 'hex');
  if (candidate.length !== stored_.length) return false;
  return crypto.timingSafeEqual(candidate, stored_);
}
