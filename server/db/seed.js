import { db } from './connection.js';
import { notifyAssigned } from '../utils/notify.js';
import { hashPassword } from '../utils/password.js';

const clear = db.transaction(() => {
  for (const table of [
    'sessions', 'notifications', 'member_projects', 'members',
    'pain_points', 'action_items', 'decisions', 'event_participants',
    'events', 'project_stakeholders', 'events', 'projects', 'stakeholders'
  ]) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
  db.prepare(`DELETE FROM sqlite_sequence`).run();
});

const seed = db.transaction(() => {
  clear();

  const insertStakeholder = db.prepare(
    'INSERT INTO stakeholders (name, email, role) VALUES (?, ?, ?)'
  );
  const alice = insertStakeholder.run('Alice Chen', 'alice@example.com', 'Product Manager').lastInsertRowid;
  const bob = insertStakeholder.run('Bob Martinez', 'bob@example.com', 'Engineer').lastInsertRowid;
  const carol = insertStakeholder.run('Carol Nguyen', 'carol@example.com', 'Designer').lastInsertRowid;
  const dave = insertStakeholder.run('Dave Okafor', 'dave@example.com', 'Marketing Lead').lastInsertRowid;

  const insertProject = db.prepare(`
    INSERT INTO projects (name, description, color_hex, status, start_date, target_end_date, budget_planned, budget_spent)
    VALUES (@name, @description, @color_hex, 'active', @start_date, @target_end_date, @budget_planned, @budget_spent)
  `);
  const website = insertProject.run({
    name: 'Website Redesign',
    description: 'Full redesign of the public marketing site and component library.',
    color_hex: '#3B82F6',
    start_date: '2026-01-15',
    target_end_date: '2026-09-30',
    budget_planned: 50000,
    budget_spent: 32000
  }).lastInsertRowid;
  const campaign = insertProject.run({
    name: 'Marketing Campaign',
    description: 'Q3 product launch campaign across paid social and print.',
    color_hex: '#10B981',
    start_date: '2026-03-01',
    target_end_date: '2026-07-10',
    budget_planned: 20000,
    budget_spent: 21000
  }).lastInsertRowid;

  const insertPS = db.prepare(
    'INSERT INTO project_stakeholders (project_id, stakeholder_id, project_role) VALUES (?, ?, ?)'
  );
  insertPS.run(website, alice, 'lead');
  insertPS.run(website, bob, 'member');
  insertPS.run(website, carol, 'member');
  insertPS.run(campaign, dave, 'lead');
  insertPS.run(campaign, alice, 'sponsor');
  insertPS.run(campaign, carol, 'member');

  const insertEvent = db.prepare(`
    INSERT INTO events (project_id, title, date, type, summary, status)
    VALUES (@project_id, @title, @date, @type, @summary, @status)
  `);
  const insertParticipant = db.prepare(
    'INSERT INTO event_participants (event_id, stakeholder_id) VALUES (?, ?)'
  );
  const insertDecision = db.prepare(
    'INSERT INTO decisions (event_id, text, decided_by) VALUES (?, ?, ?)'
  );
  const insertActionItem = db.prepare(
    'INSERT INTO action_items (event_id, text, assignee_id, done, due_date) VALUES (?, ?, ?, ?, ?)'
  );
  const insertPainPoint = db.prepare(
    'INSERT INTO pain_points (event_id, text, severity, owner_id, resolved, resolved_at) VALUES (?, ?, ?, ?, ?, ?)'
  );

  function addEvent({ project_id, title, date, type, summary, status = 'pending', participants = [] }) {
    const id = insertEvent.run({ project_id, title, date, type, summary, status }).lastInsertRowid;
    for (const stakeholderId of participants) insertParticipant.run(id, stakeholderId);
    return id;
  }

  // --- Website Redesign events ---
  const e1 = addEvent({
    project_id: website, title: 'Project Kickoff', date: '2026-01-20', type: 'kickoff',
    summary: 'Initial kickoff meeting with stakeholders.', participants: [alice, bob, carol]
  });
  insertActionItem.run(e1, 'Set up project tracking board', bob, 1, '2026-01-25');

  const e2 = addEvent({
    project_id: website, title: 'Design Workshop', date: '2026-05-05', type: 'workshop',
    summary: 'Collaborative workshop to align on design direction.', participants: [alice, carol]
  });
  insertDecision.run(e2, 'Adopt a new shared component library for consistency', alice);
  insertActionItem.run(e2, 'Finalize component library selection', bob, 0, '2026-06-01');
  insertPainPoint.run(e2, 'Design handoff to engineering is inconsistent', 'Medium', carol, 0, null);

  addEvent({
    project_id: website, title: 'Sprint Review', date: '2026-07-05', type: 'review',
    summary: 'Review of latest sprint deliverables.', participants: [bob, carol]
  });

  addEvent({
    project_id: website, title: 'Design Freeze', date: '2026-08-15', type: 'milestone',
    summary: 'All design assets finalized and locked.'
  });

  addEvent({
    project_id: website, title: 'Requirements Sign-off', date: '2026-02-15', type: 'milestone',
    summary: 'Stakeholders signed off on the final requirements doc.', status: 'achieved'
  });

  addEvent({
    project_id: website, title: 'Accessibility Audit Deadline', date: '2026-06-25', type: 'deadline',
    summary: 'Third-party accessibility audit was due.'
    // left at the default 'pending' status on purpose — the date has passed
    // and nobody marked it achieved/missed, which is exactly the "needs attention" case.
  });

  const e5 = addEvent({
    project_id: website, title: 'Q2 Retro', date: '2026-06-20', type: 'retro',
    summary: 'Retrospective on Q2 progress.', participants: [alice, bob, carol]
  });
  insertDecision.run(e5, 'Adopt bi-weekly design reviews going forward', alice);

  // --- Marketing Campaign events ---
  const e6 = addEvent({
    project_id: campaign, title: 'Campaign Kickoff', date: '2026-03-05', type: 'kickoff',
    summary: 'Launch planning kickoff.', participants: [dave, alice]
  });
  insertPainPoint.run(e6, 'Unclear campaign KPIs at kickoff', 'Low', dave, 1, '2026-03-06');

  addEvent({
    project_id: campaign, title: 'Mid-campaign Sync', date: '2026-04-15', type: 'sync',
    summary: 'Check-in on campaign metrics.', participants: [dave, carol]
  });

  addEvent({
    project_id: campaign, title: 'Creative Concept Deadline', date: '2026-05-01', type: 'deadline',
    summary: 'Agency was due to deliver final creative concepts.', status: 'missed'
  });

  const e8 = addEvent({
    project_id: campaign, title: 'Creative Review', date: '2026-07-05', type: 'review',
    summary: 'Review of campaign creative assets.', participants: [dave, carol]
  });
  insertPainPoint.run(e8, 'Creative assets delivered late from agency', 'High', dave, 0, null);

  const e9 = addEvent({
    project_id: campaign, title: 'Messaging Workshop', date: '2026-06-10', type: 'workshop',
    summary: 'Refine campaign messaging.', participants: [dave, alice, carol]
  });
  insertDecision.run(e9, 'Shift budget toward paid social over print', dave);
  insertActionItem.run(e9, 'Update media plan with new channel mix', carol, 0, '2026-07-01');
  insertPainPoint.run(e9, 'Budget approval process is too slow', 'High', alice, 0, null);

  const e10 = addEvent({
    project_id: campaign, title: 'Campaign Launch Deadline', date: '2026-07-10', type: 'deadline',
    summary: 'Hard deadline for campaign go-live.'
  });
  insertActionItem.run(e10, 'Prepare launch day checklist', dave, 0, '2026-07-09');

  // --- Members (notification subscribers — deliberately separate from Stakeholders) ---
  const insertMember = db.prepare(`
    INSERT INTO members (name, email, stakeholder_id, password_hash, notify_assigned, notify_overdue_action_items, notify_upcoming_deadlines)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMemberProject = db.prepare('INSERT INTO member_projects (member_id, project_id) VALUES (?, ?)');

  const DEMO_PASSWORD = 'chronos123';
  const demoHash = hashPassword(DEMO_PASSWORD);

  const memberAlice = insertMember.run('Alice Chen', 'alice@example.com', alice, demoHash, 1, 1, 1).lastInsertRowid;
  const memberBob = insertMember.run('Bob Martinez', 'bob@example.com', bob, demoHash, 1, 0, 0).lastInsertRowid; // wants "assigned to you" only
  const memberDave = insertMember.run('Dave Okafor', 'dave@example.com', dave, demoHash, 1, 1, 1).lastInsertRowid;
  // Grace isn't a project stakeholder, and (unlike the other three) has no
  // password — she's a pure notification subscriber, not a login account. Shows
  // that password_hash being optional is a real, exercised capability, not just
  // a schema nullable nobody uses.
  const memberGrace = insertMember.run('Grace Park', 'grace@example.com', null, null, 0, 1, 1).lastInsertRowid;

  insertMemberProject.run(memberAlice, website);
  insertMemberProject.run(memberAlice, campaign);
  insertMemberProject.run(memberBob, website);
  insertMemberProject.run(memberDave, campaign);
  insertMemberProject.run(memberGrace, website);
  insertMemberProject.run(memberGrace, campaign);

  // Seed writes go straight to SQL, bypassing the route-level notifyAssigned() hooks —
  // these two calls stand in for that, showing what the real-time "assigned to you"
  // trigger produces for two of the assignments already seeded above.
  notifyAssigned(bob, 'New action item assigned to you',
    '"Finalize component library selection" (Website Redesign — Design Workshop) — due 2026-06-01');
  notifyAssigned(dave, 'New pain point assigned to you',
    '"Creative assets delivered late from agency" (High severity — Marketing Campaign — Creative Review)');
});

seed();

console.log('Seed complete: 2 projects, 4 stakeholders, 13 events, 4 members, 2 sample notifications.');
console.log('Use the "Run Digest Now" button in the Notifications modal to generate overdue/deadline digests.');
console.log('');
console.log('Demo logins (password: chronos123): alice@example.com, bob@example.com, dave@example.com');
console.log('grace@example.com has no password — notification-only, cannot log in.');
