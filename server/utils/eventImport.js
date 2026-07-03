import { parse } from 'csv-parse/sync';

export const EVENT_TYPES = ['kickoff', 'sync', 'workshop', 'review', 'decision', 'retro', 'milestone', 'deadline'];
export const EVENT_STATUSES = ['pending', 'achieved', 'missed'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Recognized columns: title, date, type, summary, status, participants
// (participants is a `;`-separated list of stakeholder names, matched
// case-insensitively against the project's assigned stakeholders — `;` rather
// than `,` since the latter is already the CSV field delimiter).
export function parseEventsCsv(csvText) {
  try {
    const records = parse(csvText, {
      columns: (header) => header.map((h) => h.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true
    });
    return { records };
  } catch (e) {
    return { error: `Could not parse CSV: ${e.message}` };
  }
}

// stakeholderByName: Map of lowercased stakeholder name -> { id, name }, scoped
// to the target project (only those names are valid `participants` values).
export function validateEventRow(record, stakeholderByName) {
  const errors = [];
  const warnings = [];

  const title = (record.title || '').trim();
  const date = (record.date || '').trim();
  const type = (record.type || '').trim().toLowerCase();
  const summary = (record.summary || '').trim() || null;
  const status = (record.status || '').trim().toLowerCase() || 'pending';

  if (!title) errors.push('title is required');
  if (!date) errors.push('date is required');
  else if (!DATE_RE.test(date)) errors.push('date must be in YYYY-MM-DD format');
  if (!type) errors.push('type is required');
  else if (!EVENT_TYPES.includes(type)) errors.push(`type must be one of: ${EVENT_TYPES.join(', ')}`);
  if (!EVENT_STATUSES.includes(status)) errors.push(`status must be one of: ${EVENT_STATUSES.join(', ')}`);

  const participantIds = [];
  const rawParticipants = (record.participants || '').trim();
  if (rawParticipants) {
    for (const name of rawParticipants.split(';').map((s) => s.trim()).filter(Boolean)) {
      const match = stakeholderByName.get(name.toLowerCase());
      if (match) participantIds.push(match.id);
      else warnings.push(`participant "${name}" is not assigned to this project — skipped`);
    }
  }

  return { title, date, type, summary, status, participantIds, errors, warnings };
}
