import { db } from '#server/db/connection.js';
import { formatDate } from '#server/utils/dateFormat.js';
import { sendEmail } from '#server/utils/mailer.js';
import { getFullNotification } from '#server/utils/notify.js';
import { computeScorecard } from '#server/utils/scorecard.js';
import { broadcastNotification } from '#server/ws.js';

const insertNotification = db.prepare(`
  INSERT INTO notifications (member_id, type, subject, body, project_id) VALUES (?, ?, ?, ?, ?)
`);

const STATUS_LABELS = { green: 'On Track', amber: 'At Risk', red: 'Critical', 'n/a': 'N/A' };

const overdueActionItemCount = db.prepare(`
  SELECT COUNT(*) AS n FROM action_items a JOIN events e ON e.id = a.event_id
  WHERE e.project_id = ? AND a.done = 0 AND a.due_date IS NOT NULL AND a.due_date < ?
`);
const highSeverityOpenCount = db.prepare(`
  SELECT COUNT(*) AS n FROM pain_points p JOIN events e ON e.id = p.event_id
  WHERE e.project_id = ? AND p.severity = 'High' AND p.resolved = 0
`);
const upcomingMilestoneCount = db.prepare(`
  SELECT COUNT(*) AS n FROM events WHERE project_id = ? AND type IN ('milestone', 'deadline')
    AND date BETWEEN ? AND ?
`);
const goalsProgress = db.prepare('SELECT achieved FROM goals WHERE project_id = ?');

// One project's status, in the same "here's where things stand" shape as the PDF
// Situation Report (client/src/lib/pdfReports.js) but as plain text for email —
// generating an actual PDF server-side would mean duplicating jsPDF's browser-only
// rendering, not worth it for a scheduled summary read in an inbox, not printed.
function buildProjectSummary(project) {
  const today = new Date().toISOString().slice(0, 10);
  const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const scorecard = computeScorecard(project);
  const overdueActions = overdueActionItemCount.get(project.id, today).n;
  const highSeverityPain = highSeverityOpenCount.get(project.id).n;
  const upcoming = upcomingMilestoneCount.get(project.id, today, in14).n;
  const goals = goalsProgress.all(project.id);
  const achievedGoals = goals.filter((g) => g.achieved).length;

  const lines = [
    project.name,
    `  Schedule: ${STATUS_LABELS[scorecard.schedule]} · Cost: ${STATUS_LABELS[scorecard.cost]} · Quality: ${STATUS_LABELS[scorecard.quality]} · Scope: ${STATUS_LABELS[scorecard.scope]}`,
    `  ${overdueActions} overdue action item(s), ${highSeverityPain} open high-severity pain point(s), ${upcoming} upcoming milestone/deadline(s) in the next 14 days`,
  ];
  if (project.target_end_date) lines.push(`  Target end date: ${formatDate(project.target_end_date)}`);
  if (project.budget_planned != null) {
    lines.push(`  Budget: ${project.budget_spent} of ${project.budget_planned} spent`);
  }
  if (goals.length > 0) lines.push(`  Goals: ${achievedGoals} of ${goals.length} achieved`);
  return lines.join('\n');
}

// Weekly (or however STATUS_REPORT_CRON_SCHEDULE is set, see cron.js) status summary,
// reusing the nightly digest's subscription model (member_projects) with its own
// notification type/cadence/content. One notification row per (member, project) —
// same shape as the nightly digest, so the log stays genuinely project-scoped and
// filterable by project access — but batched into a single combined email per
// member, covering every one of their subscribed projects at once rather than
// firing off a separate email per project. Archived/completed projects are
// excluded; a status report on a project nobody's actively running isn't useful
// signal.
export function runStatusReportDigest() {
  const activeProjects = db.prepare("SELECT * FROM projects WHERE status = 'active'").all();
  if (activeProjects.length === 0) return [];

  const members = db.prepare('SELECT * FROM members WHERE notify_status_report = 1').all();
  const generatedIds = [];

  const run = db.transaction(() => {
    for (const member of members) {
      const subscribedProjectIds = new Set(
        db
          .prepare('SELECT project_id FROM member_projects WHERE member_id = ?')
          .all(member.id)
          .map((r) => r.project_id),
      );
      const projects = activeProjects.filter((p) => subscribedProjectIds.has(p.id));
      for (const project of projects) {
        const info = insertNotification.run(
          member.id,
          'status_report',
          `Status report: ${project.name}`,
          buildProjectSummary(project),
          project.id,
        );
        generatedIds.push(info.lastInsertRowid);
      }
    }
  });
  run();

  // Broadcast/email after the transaction commits — a rollback should never produce
  // a push or email for data that didn't land.
  const notifications = generatedIds.map((id) => getFullNotification.get(id));
  const byMember = new Map();
  for (const notification of notifications) {
    broadcastNotification(notification);
    if (!byMember.has(notification.member_id)) byMember.set(notification.member_id, []);
    byMember.get(notification.member_id).push(notification);
  }
  for (const memberNotifications of byMember.values()) {
    const { member_email } = memberNotifications[0];
    const subject =
      memberNotifications.length === 1
        ? memberNotifications[0].subject
        : `Status report: ${memberNotifications.length} projects`;
    const text = memberNotifications.map((n) => n.body).join('\n\n');
    sendEmail({ to: member_email, subject, text });
  }

  return notifications;
}
