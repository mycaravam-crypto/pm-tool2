import { Router } from 'express';
import { db } from '../db/connection.js';
import { getAccessibleProjectIds } from '../utils/access.js';
import { runDigest } from '../utils/digest.js';

const router = Router();

router.get('/', (req, res) => {
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const accessibleIds = getAccessibleProjectIds(req.member);

  // Shows every notification to anyone logged in (not just the one it's
  // addressed to) — that's existing, intentional behavior. What's new is
  // scoping *which projects'* notifications a non-admin can see: a row with no
  // project_id (none should be produced going forward, but old/system rows may
  // exist) stays visible to everyone; a project-tagged row is filtered the same
  // way events.js's list endpoint filters by project access.
  let rows;
  if (accessibleIds === null) {
    rows = db
      .prepare(`
      SELECT n.*, m.name AS member_name, m.email AS member_email
      FROM notifications n JOIN members m ON m.id = n.member_id
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT ?
    `)
      .all(limit);
  } else {
    const placeholders = accessibleIds.map(() => '?').join(',') || 'NULL';
    rows = db
      .prepare(`
      SELECT n.*, m.name AS member_name, m.email AS member_email
      FROM notifications n JOIN members m ON m.id = n.member_id
      WHERE n.project_id IS NULL OR n.project_id IN (${placeholders})
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT ?
    `)
      .all(...accessibleIds, limit);
  }
  res.json(rows);
});

// Supplements the nightly cron job (server/cron.js) with an on-demand trigger —
// useful for demos/testing without waiting for the schedule. Both call the same
// shared runDigest() so the generation logic never drifts between the two.
router.post('/run-digest', (_req, res) => {
  const generated = runDigest();
  res.json({ generated: generated.length });
});

export default router;
