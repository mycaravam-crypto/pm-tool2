import { db } from '../db/connection.js';

const todayStmt = () => new Date().toISOString().slice(0, 10);

const highSeverityOpenCount = db.prepare(`
  SELECT COUNT(*) AS n
  FROM pain_points pp
  JOIN events e ON e.id = pp.event_id
  WHERE e.project_id = ? AND pp.severity = 'High' AND pp.resolved = 0
`);

const projectGoals = db.prepare('SELECT target_date, achieved FROM goals WHERE project_id = ?');

export function computeScorecard(project) {
  const today = todayStmt();

  let schedule = 'n/a';
  if (project.target_end_date) {
    if (project.status !== 'completed' && project.target_end_date < today) {
      schedule = 'red';
    } else if (project.status !== 'completed') {
      const daysOut = (new Date(project.target_end_date) - new Date(today)) / 86400000;
      schedule = daysOut <= 14 ? 'amber' : 'green';
    } else {
      schedule = 'green';
    }
  }

  let cost = 'n/a';
  if (project.budget_planned != null && project.budget_planned > 0) {
    const ratio = project.budget_spent / project.budget_planned;
    if (ratio > 1) cost = 'red';
    else if (ratio >= 0.9) cost = 'amber';
    else cost = 'green';
  }

  const highOpen = highSeverityOpenCount.get(project.id).n;
  const quality = highOpen >= 3 ? 'red' : highOpen >= 1 ? 'amber' : 'green';

  // Scope: the 4th leg of the iron triangle (PLAN.md §3), alongside Schedule/
  // Cost/Quality above — red/amber mirror Schedule's own overdue/due-soon
  // thresholds, just against goals.target_date/achieved instead of the
  // project's own target_end_date.
  const goals = projectGoals.all(project.id);
  let scope = 'n/a';
  if (goals.length > 0) {
    const open = goals.filter((g) => !g.achieved && g.target_date);
    const overdue = open.some((g) => g.target_date < today);
    const dueSoon = open.some((g) => (new Date(g.target_date) - new Date(today)) / 86400000 <= 14);
    scope = overdue ? 'red' : dueSoon ? 'amber' : 'green';
  }

  return { schedule, cost, quality, scope };
}
