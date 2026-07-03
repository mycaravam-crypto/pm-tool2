import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate, todayStr } from './dateFormat.js';

const MARGIN = 14;
const PAGE_WIDTH = 210; // A4 portrait, mm

function hexToRgb(hex) {
  const clean = (hex || '#64748b').replace('#', '');
  const n = parseInt(clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function slugify(text) {
  return (text || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

const SCORECARD_COLORS = { green: [16, 150, 80], amber: [217, 119, 6], red: [220, 38, 38], 'n/a': [148, 163, 184] };
const SCORECARD_LABELS = { green: 'Green', amber: 'Amber', red: 'Red', 'n/a': 'n/a' };

function addFooter(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Generated ${formatDate(todayStr())} — ChronosPM`, MARGIN, 290);
    doc.text(`Page ${i} / ${pageCount}`, PAGE_WIDTH - MARGIN, 290, { align: 'right' });
  }
}

function sectionTable(doc, y, title, head, rows, emptyLabel) {
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text(title, MARGIN, y);
  y += 4;
  if (rows.length === 0) {
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text(emptyLabel, MARGIN, y + 4);
    return y + 10;
  }
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [head],
    body: rows,
    theme: 'striped',
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [71, 85, 105] }
  });
  return doc.lastAutoTable.finalY + 8;
}

// Per-event "meeting minutes" style export: title/project/date block, participants,
// then the decisions/action items/pain points logged against that event.
export function generateEventProtocolPdf(event) {
  const doc = new jsPDF();
  const [r, g, b] = hexToRgb(event.project?.color_hex);

  doc.setFillColor(r, g, b);
  doc.rect(0, 0, PAGE_WIDTH, 8, 'F');

  let y = 22;
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text('Event Protocol', MARGIN, y);
  y += 9;

  doc.setFontSize(13);
  doc.text(event.title, MARGIN, y);
  y += 7;

  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`${event.project?.name ?? ''}  ·  ${event.type}  ·  ${formatDate(event.date)}`, MARGIN, y);
  y += 6;
  if (event.status && event.status !== 'pending') {
    doc.text(`Status: ${event.status}`, MARGIN, y);
    y += 6;
  }
  if (event.summary) {
    doc.setTextColor(30, 41, 59);
    const lines = doc.splitTextToSize(event.summary, PAGE_WIDTH - MARGIN * 2);
    doc.text(lines, MARGIN, y);
    y += lines.length * 5 + 2;
  }

  const participantNames = (event.participants || []).map((p) => p.name).join(', ');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Participants: ${participantNames || '—'}`, MARGIN, y);
  y += 10;

  y = sectionTable(
    doc, y, 'Decisions', ['Decision', 'Decided by'],
    (event.decisions || []).map((d) => [d.text, d.decided_by_name || '—']),
    'No decisions logged.'
  );
  y = sectionTable(
    doc, y, 'Action Items', ['Task', 'Assignee', 'Due date', 'Done'],
    (event.action_items || []).map((a) => [a.text, a.assignee_name || '—', formatDate(a.due_date), a.done ? 'Yes' : 'No']),
    'No action items.'
  );
  y = sectionTable(
    doc, y, 'Pain Points', ['Pain Point', 'Severity', 'Owner', 'Resolved'],
    (event.pain_points || []).map((p) => [p.text, p.severity, p.owner_name || '—', p.resolved ? 'Yes' : 'No']),
    'No pain points.'
  );

  addFooter(doc);
  doc.save(`Protokoll_${slugify(event.title)}_${event.date}.pdf`);
}

// Portfolio-style status report scoped to whichever projects are currently
// selected in the sidebar — one section per project plus a combined summary.
export function generateSituationReportPdf({ projects, events, summary }) {
  const doc = new jsPDF();

  let y = 20;
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text('Overall Situation Report', MARGIN, y);
  y += 8;
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated ${formatDate(todayStr())}  ·  Projects: ${projects.map((p) => p.name).join(', ')}`, MARGIN, y);
  y += 10;

  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text('Portfolio Health (selected projects)', MARGIN, y);
  y += 6;
  const totalRequirements = projects.reduce((sum, p) => sum + (p.requirements?.length ?? 0), 0);
  const doneRequirements = projects.reduce((sum, p) => sum + (p.requirements?.filter((r) => r.done).length ?? 0), 0);
  const totalGoals = projects.reduce((sum, p) => sum + (p.goals?.length ?? 0), 0);
  const achievedGoals = projects.reduce((sum, p) => sum + (p.goals?.filter((g) => g.achieved).length ?? 0), 0);
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Overdue action items', 'Open high-severity pain points', 'Upcoming milestones/deadlines (14d)', 'Requirements fulfilled', 'Goals achieved']],
    body: [[
      summary.overdue_action_items, summary.open_high_severity_pain_points, summary.upcoming_deadlines,
      `${doneRequirements}/${totalRequirements}`, `${achievedGoals}/${totalGoals}`
    ]],
    theme: 'grid',
    styles: { fontSize: 9, halign: 'center' },
    headStyles: { fillColor: [71, 85, 105] }
  });
  y = doc.lastAutoTable.finalY + 12;

  for (const project of projects) {
    if (y > 250) { doc.addPage(); y = 20; }

    const [r, g, b] = hexToRgb(project.color_hex);
    doc.setFillColor(r, g, b);
    doc.circle(MARGIN + 1.5, y - 1.5, 1.8, 'F');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(project.name, MARGIN + 7, y);
    y += 6;

    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Lead: ${project.lead?.name ?? '—'}   ·   Start: ${formatDate(project.start_date)}   ·   Target end: ${formatDate(project.target_end_date)}`,
      MARGIN, y
    );
    y += 5;
    doc.text(
      `Budget: ${project.budget_spent ?? 0} / ${project.budget_planned ?? '—'}`,
      MARGIN, y
    );
    y += 6;

    ['schedule', 'cost', 'quality'].forEach((key, i) => {
      const status = project.scorecard?.[key] ?? 'n/a';
      const [cr, cg, cb] = SCORECARD_COLORS[status] || SCORECARD_COLORS['n/a'];
      doc.setFillColor(cr, cg, cb);
      doc.circle(MARGIN + 2 + i * 38, y - 1.5, 1.6, 'F');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(`${key[0].toUpperCase()}${key.slice(1)}: ${SCORECARD_LABELS[status] || status}`, MARGIN + 6 + i * 38, y);
    });
    y += 9;

    // Requirements/Goals track the "Scope" constraint (PLAN.md's PM Concept
    // Mapping), so they're placed right after the scorecard — ahead of the
    // work-in-progress tables below — showing only what's still outstanding,
    // with the done/total progress in each table's title.
    const projectRequirements = project.requirements ?? [];
    const openRequirements = projectRequirements.filter((r) => !r.done).map((r) => [r.text]);
    y = sectionTable(
      doc, y, `Requirements (${projectRequirements.length - openRequirements.length}/${projectRequirements.length} fulfilled)`,
      ['Outstanding Requirement'], openRequirements,
      projectRequirements.length === 0 ? 'No requirements defined.' : 'All requirements fulfilled.'
    );

    const projectGoals = project.goals ?? [];
    const openGoals = projectGoals.filter((g) => !g.achieved).map((g) => [g.text, g.target_date ? formatDate(g.target_date) : '—']);
    y = sectionTable(
      doc, y, `Goals (${projectGoals.length - openGoals.length}/${projectGoals.length} achieved)`,
      ['Outstanding Goal', 'Target Date'], openGoals,
      projectGoals.length === 0 ? 'No goals defined.' : 'All goals achieved.'
    );

    const projectEvents = events.filter((e) => e.project_id === project.id);
    const openActions = projectEvents.flatMap((e) => e.action_items.filter((a) => !a.done).map((a) => [a.text, a.assignee_name || '—', formatDate(a.due_date)]));
    const openPain = projectEvents.flatMap((e) => e.pain_points.filter((p) => !p.resolved).map((p) => [p.text, p.severity, p.owner_name || '—']));
    const decisions = projectEvents.flatMap((e) => e.decisions.map((d) => [d.text, d.decided_by_name || '—', formatDate(e.date)]));

    y = sectionTable(doc, y, 'Open Action Items', ['Task', 'Assignee', 'Due date'], openActions, 'None open.');
    y = sectionTable(doc, y, 'Unresolved Pain Points', ['Pain Point', 'Severity', 'Owner'], openPain, 'None open.');
    y = sectionTable(doc, y, 'Decisions', ['Decision', 'Decided by', 'Date'], decisions, 'None logged.');
    y += 4;
  }

  addFooter(doc);
  doc.save(`Statusbericht_${todayStr()}.pdf`);
}
