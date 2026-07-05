import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate, todayStr } from './dateFormat.js';

const MARGIN = 14;
const PAGE_WIDTH = 210; // A4 portrait, mm
const PAGE_HEIGHT = 297;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// One accent color per "concern," reused for that concern's section marker and
// table header everywhere it appears — matches the kind-badge colors already
// used in the live app's Overview tab (AggregatedTabs.vue), so a reader who's
// used the app recognizes "cyan = requirement, fuchsia = goal" at a glance
// instead of every section looking like undifferentiated gray.
const ACCENT = {
  neutral: [71, 85, 105], // slate-600 — headers/dividers with no specific concern
  decision: [79, 70, 229], // indigo-600
  action: [2, 132, 199], // sky-600
  pain: [217, 119, 6], // amber-600
  requirement: [8, 145, 178], // cyan-600
  goal: [192, 38, 211], // fuchsia-600
};

const SLATE_50 = [248, 250, 252];
const SLATE_200 = [226, 232, 240];
const SLATE_400 = [148, 163, 184];
const SLATE_500 = [100, 116, 139];
const SLATE_600 = [71, 85, 105];
const SLATE_900 = [15, 23, 42];

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

// Dark banner + colored accent stripe, shared by both report types so they
// read as the same document family. `eyebrow` is the small caps label above
// the big title (e.g. "EVENT PROTOCOL"); `accentRgb` tints the stripe under
// the banner (project color, when there is one relevant to the whole document).
function drawHeaderBanner(doc, { eyebrow, title, accentRgb = ACCENT.neutral }) {
  doc.setFillColor(...SLATE_900);
  doc.rect(0, 0, PAGE_WIDTH, 30, 'F');
  doc.setFillColor(...accentRgb);
  doc.rect(0, 30, PAGE_WIDTH, 1.6, 'F');

  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE_400);
  doc.text(eyebrow.toUpperCase(), MARGIN, 11);

  doc.setFontSize(17);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(255, 255, 255);
  const titleLines = doc.splitTextToSize(title, CONTENT_WIDTH);
  doc.text(titleLines, MARGIN, 21);
  doc.setFont(undefined, 'normal');

  return 30 + 1.6 + (titleLines.length > 1 ? 6 : 0);
}

function addFooter(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...SLATE_200);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, 284, PAGE_WIDTH - MARGIN, 284);
    doc.setFontSize(8);
    doc.setTextColor(...SLATE_400);
    doc.text(`Generated ${formatDate(todayStr())} — ChronosPM`, MARGIN, 289);
    doc.text(`Page ${i} / ${pageCount}`, PAGE_WIDTH - MARGIN, 289, { align: 'right' });
  }
}

// Breaks to a new page if there's not enough room left for at least a section
// header and one table row, so a section title never gets orphaned alone at
// the bottom of a page with its table stranded on the next one.
function ensureRoom(doc, y, minSpace = 24) {
  if (y > PAGE_HEIGHT - minSpace) {
    doc.addPage();
    return 18;
  }
  return y;
}

// Every "concern" (decisions, action items, pain points, requirements, goals)
// gets a colored square marker + colored table header in its own accent color,
// so the parts of concern separate from each other visually instead of every
// section reading as the same gray block. Empty sections get a light shaded
// placeholder box instead of a bare line of italic text, keeping the same
// footprint/rhythm as a populated section.
function sectionTable(doc, y, title, head, rows, emptyLabel, accentKey = 'neutral') {
  const accent = ACCENT[accentKey];
  y = ensureRoom(doc, y);

  doc.setFillColor(...accent);
  doc.roundedRect(MARGIN, y - 3.3, 2.8, 2.8, 0.6, 0.6, 'F');
  doc.setFontSize(10.5);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...SLATE_900);
  doc.text(title, MARGIN + 5.5, y);
  doc.setFont(undefined, 'normal');
  y += 4.5;

  if (rows.length === 0) {
    doc.setFillColor(...SLATE_50);
    doc.roundedRect(MARGIN, y - 3.2, CONTENT_WIDTH, 8, 1, 1, 'F');
    doc.setFontSize(8.5);
    doc.setTextColor(...SLATE_400);
    doc.text(emptyLabel, MARGIN + 3, y + 1.8);
    return y + 13;
  }

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [head],
    body: rows,
    theme: 'striped',
    styles: { fontSize: 9, cellPadding: 2.3, textColor: [30, 41, 59] },
    headStyles: { fillColor: accent, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
    alternateRowStyles: { fillColor: SLATE_50 },
  });
  return doc.lastAutoTable.finalY + 10;
}

// Per-event "meeting minutes" style export: title/project/date block, participants,
// then the decisions/action items/pain points logged against that event.
export function generateEventProtocolPdf(event) {
  const doc = new jsPDF();
  const projectRgb = hexToRgb(event.project?.color_hex);

  let y = drawHeaderBanner(doc, { eyebrow: 'Event Protocol', title: event.title, accentRgb: projectRgb });
  y += 12;

  // Project / type / date meta row, with a small dot in the project's color so
  // this card-like block visually anchors to the accent stripe under the banner.
  doc.setFillColor(...projectRgb);
  doc.circle(MARGIN + 1.2, y - 1.3, 1.3, 'F');
  doc.setFontSize(10);
  doc.setTextColor(...SLATE_600);
  doc.text(`${event.project?.name ?? ''}   ·   ${event.type}   ·   ${formatDate(event.date)}`, MARGIN + 5, y);
  y += 6;

  if (event.status && event.status !== 'pending') {
    const statusRgb = event.status === 'achieved' ? [16, 150, 80] : [220, 38, 38];
    doc.setFillColor(...statusRgb);
    doc.roundedRect(MARGIN, y - 3.2, 22, 4.6, 1, 1, 'F');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text(event.status.toUpperCase(), MARGIN + 11, y - 0.1, { align: 'center' });
    y += 7;
  }

  if (event.summary) {
    doc.setFontSize(9.5);
    doc.setTextColor(...SLATE_900);
    const lines = doc.splitTextToSize(event.summary, CONTENT_WIDTH);
    doc.text(lines, MARGIN, y);
    y += lines.length * 5 + 3;
  }

  const participantNames = (event.participants || []).map((p) => p.name).join(', ');
  doc.setFontSize(8.5);
  doc.setTextColor(...SLATE_500);
  doc.text(`Participants: ${participantNames || '—'}`, MARGIN, y);
  y += 5;

  doc.setDrawColor(...SLATE_200);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 8;

  y = sectionTable(
    doc,
    y,
    'Decisions',
    ['Decision', 'Decided by'],
    (event.decisions || []).map((d) => [d.text, d.decided_by_name || '—']),
    'No decisions logged.',
    'decision',
  );
  y = sectionTable(
    doc,
    y,
    'Action Items',
    ['Task', 'Assignee', 'Due date', 'Done'],
    (event.action_items || []).map((a) => [
      a.text,
      a.assignee_name || '—',
      formatDate(a.due_date),
      a.done ? 'Yes' : 'No',
    ]),
    'No action items.',
    'action',
  );
  y = sectionTable(
    doc,
    y,
    'Pain Points',
    ['Pain Point', 'Severity', 'Owner', 'Resolved'],
    (event.pain_points || []).map((p) => [p.text, p.severity, p.owner_name || '—', p.resolved ? 'Yes' : 'No']),
    'No pain points.',
    'pain',
  );

  addFooter(doc);
  doc.save(`Protokoll_${slugify(event.title)}_${event.date}.pdf`);
}

// Portfolio-style status report scoped to whichever projects are currently
// selected in the sidebar — one card-like section per project plus a combined
// summary up top.
export function generateSituationReportPdf({ projects, events, summary }) {
  const doc = new jsPDF();

  let y = drawHeaderBanner(doc, { eyebrow: 'Status Report', title: 'Overall Situation Report' });
  y += 10;
  doc.setFontSize(9.5);
  doc.setTextColor(...SLATE_500);
  doc.text(`Generated ${formatDate(todayStr())}  ·  Projects: ${projects.map((p) => p.name).join(', ')}`, MARGIN, y);
  y += 9;

  doc.setFontSize(10.5);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...SLATE_900);
  doc.text('PORTFOLIO HEALTH', MARGIN, y);
  doc.setFont(undefined, 'normal');
  y += 4.5;
  const totalRequirements = projects.reduce((sum, p) => sum + (p.requirements?.length ?? 0), 0);
  const doneRequirements = projects.reduce((sum, p) => sum + (p.requirements?.filter((r) => r.done).length ?? 0), 0);
  const totalGoals = projects.reduce((sum, p) => sum + (p.goals?.length ?? 0), 0);
  const achievedGoals = projects.reduce((sum, p) => sum + (p.goals?.filter((g) => g.achieved).length ?? 0), 0);
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [
      [
        'Overdue action items',
        'Open high-severity pain points',
        'Upcoming milestones/deadlines (14d)',
        'Requirements fulfilled',
        'Goals achieved',
      ],
    ],
    body: [
      [
        summary.overdue_action_items,
        summary.open_high_severity_pain_points,
        summary.upcoming_deadlines,
        `${doneRequirements}/${totalRequirements}`,
        `${achievedGoals}/${totalGoals}`,
      ],
    ],
    theme: 'grid',
    styles: { fontSize: 9, halign: 'center', textColor: [30, 41, 59] },
    headStyles: { fillColor: ACCENT.neutral, fontSize: 8 },
  });
  y = doc.lastAutoTable.finalY + 14;

  for (const project of projects) {
    y = ensureRoom(doc, y, 55);

    const projectRgb = hexToRgb(project.color_hex);

    // Card-style header band for the project: light shaded strip with a
    // colored left accent bar, so each project's block reads as a distinct
    // unit instead of just another paragraph in the flow.
    doc.setFillColor(...SLATE_50);
    doc.rect(MARGIN, y - 5.5, CONTENT_WIDTH, 9.5, 'F');
    doc.setFillColor(...projectRgb);
    doc.rect(MARGIN, y - 5.5, 2, 9.5, 'F');
    doc.setFontSize(13);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...SLATE_900);
    doc.text(project.name, MARGIN + 6, y + 1);
    doc.setFont(undefined, 'normal');
    y += 9;

    doc.setFontSize(8.5);
    doc.setTextColor(...SLATE_500);
    doc.text(
      `Lead: ${project.lead?.name ?? '—'}   ·   Start: ${formatDate(project.start_date)}   ·   Target end: ${formatDate(project.target_end_date)}   ·   Budget: ${project.budget_spent ?? 0} / ${project.budget_planned ?? '—'}`,
      MARGIN,
      y,
    );
    y += 6;

    // Scorecard as small filled pills rather than a bare dot + text, giving
    // the RAG status more visual weight without overpowering the section.
    ['schedule', 'cost', 'quality'].forEach((key, i) => {
      const status = project.scorecard?.[key] ?? 'n/a';
      const [cr, cg, cb] = SCORECARD_COLORS[status] || SCORECARD_COLORS['n/a'];
      const x = MARGIN + i * 58;
      doc.setFillColor(cr, cg, cb);
      doc.roundedRect(x, y - 3.4, 3, 3, 0.7, 0.7, 'F');
      doc.setFontSize(8);
      doc.setTextColor(...SLATE_600);
      doc.text(`${key[0].toUpperCase()}${key.slice(1)}: ${SCORECARD_LABELS[status] || status}`, x + 5, y - 0.9);
    });
    y += 9;

    // Requirements/Goals track the "Scope" constraint (PLAN.md's PM Concept
    // Mapping), so they're placed right after the scorecard — ahead of the
    // work-in-progress tables below — showing only what's still outstanding,
    // with the done/total progress in each table's title.
    const projectRequirements = project.requirements ?? [];
    const openRequirements = projectRequirements.filter((r) => !r.done).map((r) => [r.text]);
    y = sectionTable(
      doc,
      y,
      `Requirements (${projectRequirements.length - openRequirements.length}/${projectRequirements.length} fulfilled)`,
      ['Outstanding Requirement'],
      openRequirements,
      projectRequirements.length === 0 ? 'No requirements defined.' : 'All requirements fulfilled.',
      'requirement',
    );

    const projectGoals = project.goals ?? [];
    const openGoals = projectGoals
      .filter((g) => !g.achieved)
      .map((g) => [g.text, g.target_date ? formatDate(g.target_date) : '—']);
    y = sectionTable(
      doc,
      y,
      `Goals (${projectGoals.length - openGoals.length}/${projectGoals.length} achieved)`,
      ['Outstanding Goal', 'Target Date'],
      openGoals,
      projectGoals.length === 0 ? 'No goals defined.' : 'All goals achieved.',
      'goal',
    );

    const projectEvents = events.filter((e) => e.project_id === project.id);
    const openActions = projectEvents.flatMap((e) =>
      e.action_items.filter((a) => !a.done).map((a) => [a.text, a.assignee_name || '—', formatDate(a.due_date)]),
    );
    const openPain = projectEvents.flatMap((e) =>
      e.pain_points.filter((p) => !p.resolved).map((p) => [p.text, p.severity, p.owner_name || '—']),
    );
    const decisions = projectEvents.flatMap((e) =>
      e.decisions.map((d) => [d.text, d.decided_by_name || '—', formatDate(e.date)]),
    );

    y = sectionTable(
      doc,
      y,
      'Open Action Items',
      ['Task', 'Assignee', 'Due date'],
      openActions,
      'None open.',
      'action',
    );
    y = sectionTable(
      doc,
      y,
      'Unresolved Pain Points',
      ['Pain Point', 'Severity', 'Owner'],
      openPain,
      'None open.',
      'pain',
    );
    y = sectionTable(doc, y, 'Decisions', ['Decision', 'Decided by', 'Date'], decisions, 'None logged.', 'decision');

    // Divider between projects, only when another one follows.
    if (project !== projects[projects.length - 1]) {
      y = ensureRoom(doc, y, 12);
      doc.setDrawColor(...SLATE_200);
      doc.setLineWidth(0.3);
      doc.line(MARGIN, y - 4, PAGE_WIDTH - MARGIN, y - 4);
      y += 4;
    }
  }

  addFooter(doc);
  doc.save(`Statusbericht_${todayStr()}.pdf`);
}
