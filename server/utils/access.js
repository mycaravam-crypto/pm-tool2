import { db } from '../db/connection.js';

export function isAdmin(member) {
  return member?.role === 'admin';
}

const getProjectIdsForStakeholder = db.prepare(
  'SELECT project_id FROM project_stakeholders WHERE stakeholder_id = ?'
);

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
  return getProjectIdsForStakeholder.all(member.stakeholder_id).map(r => r.project_id);
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
