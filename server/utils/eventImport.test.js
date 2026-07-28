import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EVENT_STATUSES, EVENT_TYPES, parseEventsCsv, validateEventRow } from './eventImport.js';

test('parseEventsCsv: parses a well-formed CSV into records with lowercased, trimmed headers', () => {
  const { records, error } = parseEventsCsv('Title, Date ,Type\nKickoff,2026-01-01,kickoff');
  assert.equal(error, undefined);
  assert.equal(records.length, 1);
  assert.deepEqual(records[0], { title: 'Kickoff', date: '2026-01-01', type: 'kickoff' });
});

test('parseEventsCsv: skips empty lines', () => {
  const { records } = parseEventsCsv('title,date,type\nA,2026-01-01,sync\n\nB,2026-01-02,sync');
  assert.equal(records.length, 2);
});

test('parseEventsCsv: returns an error for unparseable CSV', () => {
  const { records, error } = parseEventsCsv('title,date,type\n"unterminated quote,2026-01-01,sync');
  assert.equal(records, undefined);
  assert.ok(error);
});

test('validateEventRow: flags every required field missing', () => {
  const { errors } = validateEventRow({}, new Map());
  assert.ok(errors.some((e) => /title/.test(e)));
  assert.ok(errors.some((e) => /date is required/.test(e)));
  assert.ok(errors.some((e) => /type is required/.test(e)));
});

test('validateEventRow: rejects a malformed date and an invalid type', () => {
  const { errors } = validateEventRow({ title: 'x', date: '01/01/2026', type: 'meeting' }, new Map());
  assert.ok(errors.some((e) => /YYYY-MM-DD/.test(e)));
  assert.ok(errors.some((e) => e.includes(EVENT_TYPES[0])));
});

test('validateEventRow: rejects an invalid status but defaults to pending when omitted', () => {
  const missingStatus = validateEventRow({ title: 'x', date: '2026-01-01', type: 'sync' }, new Map());
  assert.equal(missingStatus.status, 'pending');
  assert.equal(missingStatus.errors.length, 0);

  const badStatus = validateEventRow({ title: 'x', date: '2026-01-01', type: 'sync', status: 'cancelled' }, new Map());
  assert.ok(badStatus.errors.some((e) => e.includes(EVENT_STATUSES[0])));
});

test('validateEventRow: matches participants case-insensitively and warns about unknown names', () => {
  const stakeholderByName = new Map([['ada lovelace', { id: 7, name: 'Ada Lovelace' }]]);
  const row = validateEventRow(
    { title: 'x', date: '2026-01-01', type: 'sync', participants: 'ADA LOVELACE; Bob Nobody' },
    stakeholderByName,
  );
  assert.deepEqual(row.participantIds, [7]);
  assert.equal(row.errors.length, 0);
  assert.ok(row.warnings.some((w) => w.includes('Bob Nobody')));
});

test('validateEventRow: blank optional fields normalize to null/empty rather than throwing', () => {
  const row = validateEventRow(
    { title: 'x', date: '2026-01-01', type: 'sync', summary: '  ', participants: '' },
    new Map(),
  );
  assert.equal(row.summary, null);
  assert.deepEqual(row.participantIds, []);
  assert.deepEqual(row.warnings, []);
});
