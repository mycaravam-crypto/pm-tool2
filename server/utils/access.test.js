import assert from 'node:assert/strict';
import { test } from 'node:test';
import { db } from '../db/connection.js';
import {
  canAccessProject,
  canContribute,
  canDeleteProjectItems,
  canManageProject,
  getAccessibleProjectIds,
  getProjectRole,
  isAdmin,
} from './access.js';

const insertProject = db.prepare('INSERT INTO projects (name) VALUES (?)');
const insertStakeholder = db.prepare('INSERT INTO stakeholders (name) VALUES (?)');
const assignToProject = db.prepare(
  'INSERT INTO project_stakeholders (project_id, stakeholder_id, project_role) VALUES (?, ?, ?)',
);

function makeProject() {
  return insertProject.run(`Project ${Math.random()}`).lastInsertRowid;
}
function makeStakeholder() {
  return insertStakeholder.run(`Stakeholder ${Math.random()}`).lastInsertRowid;
}

test('isAdmin', () => {
  assert.equal(isAdmin({ role: 'admin' }), true);
  assert.equal(isAdmin({ role: 'member' }), false);
  assert.equal(isAdmin(null), false);
  assert.equal(isAdmin(undefined), false);
});

test('getAccessibleProjectIds: admin gets the "unrestricted" sentinel (null)', () => {
  const admin = { role: 'admin' };
  assert.equal(getAccessibleProjectIds(admin), null);
});

test('getAccessibleProjectIds: a member with no stakeholder_id is committed to nothing', () => {
  const member = { role: 'member', stakeholder_id: null };
  assert.deepEqual(getAccessibleProjectIds(member), []);
});

test('getAccessibleProjectIds: returns only the projects the stakeholder is assigned to', () => {
  const stakeholderId = makeStakeholder();
  const projectA = makeProject();
  const projectB = makeProject();
  makeProject(); // projectC — deliberately not assigned, must not appear below
  assignToProject.run(projectA, stakeholderId, 'member');
  assignToProject.run(projectB, stakeholderId, 'lead');

  const member = { role: 'member', stakeholder_id: stakeholderId };
  assert.deepEqual(getAccessibleProjectIds(member).sort(), [projectA, projectB].sort());
});

test('canAccessProject: admin can access any project id, committed member only their own', () => {
  const stakeholderId = makeStakeholder();
  const project = makeProject();
  const otherProject = makeProject();
  assignToProject.run(project, stakeholderId, 'member');

  const admin = { role: 'admin' };
  const member = { role: 'member', stakeholder_id: stakeholderId };

  assert.equal(canAccessProject(admin, otherProject), true);
  assert.equal(canAccessProject(member, project), true);
  assert.equal(canAccessProject(member, otherProject), false);
});

test('getProjectRole: admin, committed roles, and not-committed-at-all', () => {
  const stakeholderId = makeStakeholder();
  const project = makeProject();
  assignToProject.run(project, stakeholderId, 'sponsor');

  const admin = { role: 'admin' };
  const sponsor = { role: 'member', stakeholder_id: stakeholderId };
  const stranger = { role: 'member', stakeholder_id: makeStakeholder() };

  assert.equal(getProjectRole(admin, project), 'admin');
  assert.equal(getProjectRole(sponsor, project), 'sponsor');
  assert.equal(getProjectRole(stranger, project), null);
});

test('canContribute: every committed role except plain stakeholder', () => {
  const project = makeProject();
  for (const role of ['lead', 'sponsor', 'member']) {
    const stakeholderId = makeStakeholder();
    assignToProject.run(project, stakeholderId, role);
    assert.equal(canContribute({ role: 'member', stakeholder_id: stakeholderId }, project), true, role);
  }

  const readOnlyStakeholderId = makeStakeholder();
  assignToProject.run(project, readOnlyStakeholderId, 'stakeholder');
  assert.equal(canContribute({ role: 'member', stakeholder_id: readOnlyStakeholderId }, project), false);
});

test('canDeleteProjectItems: only lead or admin', () => {
  const project = makeProject();
  const leadId = makeStakeholder();
  const memberId = makeStakeholder();
  assignToProject.run(project, leadId, 'lead');
  assignToProject.run(project, memberId, 'member');

  assert.equal(canDeleteProjectItems({ role: 'admin' }, project), true);
  assert.equal(canDeleteProjectItems({ role: 'member', stakeholder_id: leadId }, project), true);
  assert.equal(canDeleteProjectItems({ role: 'member', stakeholder_id: memberId }, project), false);
});

test('canManageProject: admin, lead, or sponsor — not a plain member or stakeholder', () => {
  const project = makeProject();
  const leadId = makeStakeholder();
  const sponsorId = makeStakeholder();
  const memberId = makeStakeholder();
  assignToProject.run(project, leadId, 'lead');
  assignToProject.run(project, sponsorId, 'sponsor');
  assignToProject.run(project, memberId, 'member');

  assert.equal(canManageProject({ role: 'admin' }, project), true);
  assert.equal(canManageProject({ role: 'member', stakeholder_id: leadId }, project), true);
  assert.equal(canManageProject({ role: 'member', stakeholder_id: sponsorId }, project), true);
  assert.equal(canManageProject({ role: 'member', stakeholder_id: memberId }, project), false);
});
