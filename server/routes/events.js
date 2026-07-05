import { Router } from 'express';
import { db } from '../db/connection.js';
import { canAccessProject, canContribute, getAccessibleProjectIds } from '../utils/access.js';
import { parseEventsCsv, validateEventRow } from '../utils/eventImport.js';
import { notifyAssigned } from '../utils/notify.js';

const router = Router();

const getEventStmt = db.prepare('SELECT * FROM events WHERE id = ?');
const getProjectStmt = db.prepare('SELECT id, name, color_hex FROM projects WHERE id = ?');
const getParticipantsStmt = db.prepare(`
  SELECT s.id, s.name FROM event_participants ep
  JOIN stakeholders s ON s.id = ep.stakeholder_id
  WHERE ep.event_id = ?
`);
const getDecisionsStmt = db.prepare(`
  SELECT d.*, s.name AS decided_by_name FROM decisions d
  LEFT JOIN stakeholders s ON s.id = d.decided_by
  WHERE d.event_id = ? ORDER BY d.created_at
`);
const getActionItemsStmt = db.prepare(`
  SELECT a.*, s.name AS assignee_name FROM action_items a
  LEFT JOIN stakeholders s ON s.id = a.assignee_id
  WHERE a.event_id = ? ORDER BY a.created_at
`);
const getPainPointsStmt = db.prepare(`
  SELECT p.*, s.name AS owner_name FROM pain_points p
  LEFT JOIN stakeholders s ON s.id = p.owner_id
  WHERE p.event_id = ? ORDER BY p.created_at
`);

function serializeEvent(event) {
  return {
    ...event,
    project: getProjectStmt.get(event.project_id),
    participants: getParticipantsStmt.all(event.id),
    decisions: getDecisionsStmt.all(event.id),
    action_items: getActionItemsStmt.all(event.id),
    pain_points: getPainPointsStmt.all(event.id),
  };
}

router.get('/', (req, res) => {
  const { project_ids } = req.query;
  if (!project_ids) return res.json([]);
  let ids = project_ids.split(',').map(Number).filter(Number.isFinite);
  // Defensive, not just cosmetic: re-filter server-side regardless of what the
  // client asked for, so a direct API call with someone else's project_ids can't
  // pull their events even if the UI would never construct such a request.
  const accessibleIds = getAccessibleProjectIds(req.member);
  if (accessibleIds !== null) ids = ids.filter((id) => accessibleIds.includes(id));
  if (ids.length === 0) return res.json([]);
  const placeholders = ids.map(() => '?').join(',');
  const events = db.prepare(`SELECT * FROM events WHERE project_id IN (${placeholders}) ORDER BY date`).all(...ids);
  res.json(events.map(serializeEvent));
});

router.post('/', (req, res) => {
  const {
    project_id,
    title,
    date,
    type,
    summary,
    status = 'pending',
    participants = [],
    decisions = [],
    action_items = [],
    pain_points = [],
  } = req.body;
  if (!project_id || !title || !date || !type) {
    return res.status(400).json({ error: 'project_id, title, date, and type are required' });
  }
  if (!canAccessProject(req.member, project_id)) return res.status(404).json({ error: 'project not found' });
  if (!canContribute(req.member, project_id))
    return res.status(403).json({ error: 'read-only access to this project' });

  const create = db.transaction(() => {
    const info = db
      .prepare(`
      INSERT INTO events (project_id, title, date, type, summary, status) VALUES (?, ?, ?, ?, ?, ?)
    `)
      .run(project_id, title, date, type, summary ?? null, status);
    const eventId = info.lastInsertRowid;

    for (const stakeholderId of participants) {
      db.prepare('INSERT INTO event_participants (event_id, stakeholder_id) VALUES (?, ?)').run(eventId, stakeholderId);
    }
    for (const d of decisions) {
      db.prepare('INSERT INTO decisions (event_id, text, decided_by) VALUES (?, ?, ?)').run(
        eventId,
        d.text,
        d.decided_by ?? null,
      );
    }
    for (const a of action_items) {
      db.prepare('INSERT INTO action_items (event_id, text, assignee_id, due_date) VALUES (?, ?, ?, ?)').run(
        eventId,
        a.text,
        a.assignee_id ?? null,
        a.due_date ?? null,
      );
    }
    for (const p of pain_points) {
      db.prepare('INSERT INTO pain_points (event_id, text, severity, owner_id) VALUES (?, ?, ?, ?)').run(
        eventId,
        p.text,
        p.severity,
        p.owner_id ?? null,
      );
    }
    return eventId;
  });

  const id = create();

  // Notify after the transaction commits, not inside it — a rollback shouldn't leave
  // a "you were assigned" notification for data that never actually landed.
  const projectName = getProjectStmt.get(project_id)?.name ?? '';
  for (const d of decisions) {
    if (d.decided_by)
      notifyAssigned(
        d.decided_by,
        'A decision was logged under your name',
        `"${d.text}" (${projectName} — ${title})`,
        project_id,
      );
  }
  for (const a of action_items) {
    if (a.assignee_id)
      notifyAssigned(
        a.assignee_id,
        'New action item assigned to you',
        `"${a.text}" (${projectName} — ${title})${a.due_date ? ` — due ${a.due_date}` : ''}`,
        project_id,
      );
  }
  for (const p of pain_points) {
    if (p.owner_id)
      notifyAssigned(
        p.owner_id,
        'New pain point assigned to you',
        `"${p.text}" (${p.severity} severity — ${projectName} — ${title})`,
        project_id,
      );
  }

  res.status(201).json(serializeEvent(getEventStmt.get(id)));
});

const getProjectStakeholdersForImportStmt = db.prepare(`
  SELECT s.id, s.name FROM project_stakeholders ps
  JOIN stakeholders s ON s.id = ps.stakeholder_id
  WHERE ps.project_id = ?
`);

// Bulk-create events from a pasted/uploaded CSV, for getting an ongoing
// project's existing schedule into the timeline without hand-entering every
// row. `commit: false` (the default) only validates and returns a preview —
// nothing is written until the caller re-submits with `commit: true`, so the
// UI can show per-row errors/warnings before anything lands. All rows in a
// commit are inserted in one transaction, mirroring `POST /` above; nested
// decisions/action items/pain points aren't importable in this form — those
// stay hand-entered per event once it exists.
router.post('/import', (req, res) => {
  const { project_id, csv, commit = false } = req.body;
  if (!project_id || !csv) return res.status(400).json({ error: 'project_id and csv are required' });
  if (!canAccessProject(req.member, project_id)) return res.status(404).json({ error: 'project not found' });
  if (!canContribute(req.member, project_id))
    return res.status(403).json({ error: 'read-only access to this project' });

  const { records, error } = parseEventsCsv(csv);
  if (error) return res.status(400).json({ error });
  if (records.length === 0) return res.status(400).json({ error: 'CSV has no data rows' });

  const stakeholderByName = new Map(
    getProjectStakeholdersForImportStmt.all(project_id).map((s) => [s.name.toLowerCase(), s]),
  );

  const rows = records.map((record, i) => ({ row: i + 2, ...validateEventRow(record, stakeholderByName) }));
  const validRows = rows.filter((r) => r.errors.length === 0);

  if (!commit) {
    return res.json({
      preview: true,
      totalRows: rows.length,
      validCount: validRows.length,
      rows: rows.map(({ title, date, type, summary, status, participantIds, ...rest }) => ({
        title,
        date,
        type,
        summary,
        status,
        ...rest,
      })),
    });
  }

  const insertEvent = db.prepare(`
    INSERT INTO events (project_id, title, date, type, summary, status) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertParticipant = db.prepare('INSERT INTO event_participants (event_id, stakeholder_id) VALUES (?, ?)');

  const importAll = db.transaction(() => {
    for (const row of validRows) {
      const info = insertEvent.run(project_id, row.title, row.date, row.type, row.summary, row.status);
      for (const stakeholderId of row.participantIds) insertParticipant.run(info.lastInsertRowid, stakeholderId);
    }
  });
  importAll();

  res.status(201).json({
    imported: validRows.length,
    skipped: rows.filter((r) => r.errors.length > 0).map(({ row, errors }) => ({ row, errors })),
  });
});

router.put('/:id', (req, res) => {
  const event = getEventStmt.get(req.params.id);
  if (!event || !canAccessProject(req.member, event.project_id))
    return res.status(404).json({ error: 'event not found' });
  if (!canContribute(req.member, event.project_id))
    return res.status(403).json({ error: 'read-only access to this project' });

  const {
    title = event.title,
    date = event.date,
    type = event.type,
    summary = event.summary,
    status = event.status,
    participants,
  } = req.body;

  const update = db.transaction(() => {
    db.prepare(`
      UPDATE events SET title = ?, date = ?, type = ?, summary = ?, status = ?, updated_at = datetime('now') WHERE id = ?
    `).run(title, date, type, summary, status, req.params.id);

    if (Array.isArray(participants)) {
      db.prepare('DELETE FROM event_participants WHERE event_id = ?').run(req.params.id);
      for (const stakeholderId of participants) {
        db.prepare('INSERT INTO event_participants (event_id, stakeholder_id) VALUES (?, ?)').run(
          req.params.id,
          stakeholderId,
        );
      }
    }
  });
  update();

  res.json(serializeEvent(getEventStmt.get(req.params.id)));
});

router.delete('/:id', (req, res) => {
  const event = getEventStmt.get(req.params.id);
  if (!event || !canAccessProject(req.member, event.project_id))
    return res.status(404).json({ error: 'event not found' });
  if (!canContribute(req.member, event.project_id))
    return res.status(403).json({ error: 'read-only access to this project' });
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;
