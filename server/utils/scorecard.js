import { db } from '../db/connection.js';

const todayStmt = () => new Date().toISOString().slice(0, 10);

const highSeverityOpenCount = db.prepare(`
  SELECT COUNT(*) AS n
  FROM pain_points pp
  JOIN events e ON e.id = pp.event_id
  WHERE e.project_id = ? AND pp.severity = 'High' AND pp.resolved = 0
`);

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

  return { schedule, cost, quality };
}
