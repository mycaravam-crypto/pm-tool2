import { db } from '../db/connection.js';

export function isAdmin(member) {
  return member?.role === 'admin';
}

const getProjectIdsForStakeholder = db.prepare('SELECT project_id FROM project_stakeholders WHERE stakeholder_id = ?');

// "Committed to a project" means the member's linked Stakeholder identity is
// actually assigned to it (project_stakeholders), not merely subscribed to its
// digests (member_projects — a deliberately separate, weaker relationship, see
// PLAN.md Section 3.F). A member with no stakeholder_id is committed to nothing.
//
// Returns null for admins (sentinel meaning "unrestricted"), otherwise an array
// of accessible project ids — possibly empty.
export function getAccessibleProjectIds(member) {
  if (isAdmin(member)) return null;
  if (!member?.stakeholder_id) return [];
  return getProjectIdsForStakeholder.all(member.stakeholder_id).map((r) => r.project_id);
}

export function canAccessProject(member, projectId) {
  const ids = getAccessibleProjectIds(member);
  return ids === null || ids.includes(Number(projectId));
}

const getEventProjectId = db.prepare('SELECT project_id FROM events WHERE id = ?');

// Decisions/action items/pain points don't carry a project_id of their own —
// they're scoped through the event they belong to. Used by their routes to
// check access without each one re-implementing the same join.
export function canAccessEvent(member, eventId) {
  const row = getEventProjectId.get(eventId);
  return !!row && canAccessProject(member, row.project_id);
}

// Resolves an event's project_id — used alongside canAccessEvent wherever a
// route needs the id itself (e.g. to run canContribute or to tag a
// notification), not just a yes/no access check.
export function getProjectIdForEvent(eventId) {
  return getEventProjectId.get(eventId)?.project_id ?? null;
}

const getProjectRoleStmt = db.prepare(
  'SELECT project_role FROM project_stakeholders WHERE project_id = ? AND stakeholder_id = ?',
);

// Returns 'admin' for admins, the project_role string (lead/sponsor/member/
// stakeholder) for a committed member, or null if not committed at all.
export function getProjectRole(member, projectId) {
  if (isAdmin(member)) return 'admin';
  if (!member?.stakeholder_id) return null;
  return getProjectRoleStmt.get(projectId, member.stakeholder_id)?.project_role ?? null;
}

// Write access to a project's operational records (events, decisions, action
// items, pain points, requirements, goals). Every committed role can
// contribute except 'stakeholder' — the RACI "Informed" tier (PLAN.md Section
// 3), which is deliberately read-only.
export function canContribute(member, projectId) {
  const role = getProjectRole(member, projectId);
  return role !== null && role !== 'stakeholder';
}

// Write access to the project's own settings (name/dates/budget/status, lead
// reassignment, team membership) — restricted to the people accountable for
// those outcomes, not every contributor.
export function canManageProject(member, projectId) {
  const role = getProjectRole(member, projectId);
  return role === 'admin' || role === 'lead' || role === 'sponsor';
}

// Shared by decisions/action items/pain points to build the "(project — event)"
// context for their assignment notifications, and to get project_id for
// project-scoping the notification log (routes/notifications.js).
export const getEventContext = db.prepare(`
  SELECT e.project_id, e.title AS event_title, p.name AS project_name
  FROM events e JOIN projects p ON p.id = e.project_id WHERE e.id = ?
`);
