import { Router } from 'express';
import { db } from '../db/connection.js';
import { getAccessibleProjectIds } from '../utils/access.js';

const router = Router();

router.get('/summary', (req, res) => {
  const { project_ids } = req.query;
  let ids;
  if (project_ids) {
    ids = project_ids.split(',').map(Number).filter(Number.isFinite);
  } else {
    ids = db
      .prepare("SELECT id FROM projects WHERE status = 'active'")
      .all()
      .map((r) => r.id);
  }

  // Same defensive re-filter as GET /api/events — the portfolio badge (no
  // project_ids given) must default to "my accessible active projects," not
  // literally every active project in the system.
  const accessibleIds = getAccessibleProjectIds(req.member);
  if (accessibleIds !== null) ids = ids.filter((id) => accessibleIds.includes(id));

  if (ids.length === 0) {
    return res.json({
      overdue_action_items: 0,
      open_high_severity_pain_points: 0,
      upcoming_deadlines: 0,
      at_risk_goals: 0,
      unlinked_requirements: 0,
    });
  }

  const placeholders = ids.map(() => '?').join(',');
  const today = new Date().toISOString().slice(0, 10);
  const in14Days = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  const overdueActionItems = db
    .prepare(`
    SELECT COUNT(*) AS n FROM action_items a
    JOIN events e ON e.id = a.event_id
    WHERE e.project_id IN (${placeholders}) AND a.done = 0 AND a.due_date IS NOT NULL AND a.due_date < ?
  `)
    .get(...ids, today).n;

  const openHighSeverity = db
    .prepare(`
    SELECT COUNT(*) AS n FROM pain_points p
    JOIN events e ON e.id = p.event_id
    WHERE e.project_id IN (${placeholders}) AND p.severity = 'High' AND p.resolved = 0
  `)
    .get(...ids).n;

  const upcomingDeadlines = db
    .prepare(`
    SELECT COUNT(*) AS n FROM events e
    WHERE e.project_id IN (${placeholders}) AND e.type IN ('milestone', 'deadline')
      AND e.date BETWEEN ? AND ?
  `)
    .get(...ids, today, in14Days).n;

  // "At risk" covers both overdue and due-within-14-days in one number, same
  // as the timeline's amber nudge treats both as "needs attention now" — unlike
  // upcoming_deadlines above, which only looks forward.
  const atRiskGoals = db
    .prepare(`
    SELECT COUNT(*) AS n FROM goals g
    WHERE g.project_id IN (${placeholders}) AND g.achieved = 0 AND g.target_date IS NOT NULL AND g.target_date <= ?
  `)
    .get(...ids, in14Days).n;

  // Scope-creep signal (PLAN.md §11): a requirement with no linked goal has no
  // stated outcome it serves. Deliberately just the "unlinked" half of a
  // broader "unlinked and/or added after the schedule baseline" idea — the
  // baseline-comparison variant needs new date-comparison logic and has no
  // seed-data example to demo it yet (see PLAN.md §11's "Future ideas").
  const unlinkedRequirements = db
    .prepare(`
    SELECT COUNT(*) AS n FROM requirements r
    WHERE r.project_id IN (${placeholders}) AND r.goal_id IS NULL
  `)
    .get(...ids).n;

  res.json({
    overdue_action_items: overdueActionItems,
    open_high_severity_pain_points: openHighSeverity,
    upcoming_deadlines: upcomingDeadlines,
    at_risk_goals: atRiskGoals,
    unlinked_requirements: unlinkedRequirements,
  });
});

export default router;
