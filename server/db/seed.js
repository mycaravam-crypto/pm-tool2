import { db } from './connection.js';

const clear = db.transaction(() => {
  for (const table of [
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
    INSERT INTO events (project_id, title, date, type, summary)
    VALUES (@project_id, @title, @date, @type, @summary)
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

  function addEvent({ project_id, title, date, type, summary, participants = [] }) {
    const id = insertEvent.run({ project_id, title, date, type, summary }).lastInsertRowid;
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
});

seed();

console.log('Seed complete: 2 projects, 4 stakeholders, 10 events.');
