import rateLimit from 'express-rate-limit';

// Brute-force/enumeration protection on the auth surface only — the rest of the
// API is behind a session already, so it isn't the same kind of unauthenticated
// attack surface. Keyed by IP (express-rate-limit's default), which is enough
// for a single-container deployment with no separate rate-limit store.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});
