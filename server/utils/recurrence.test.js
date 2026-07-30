import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateOccurrenceDates, MAX_OCCURRENCES, validateRecurrence } from '#server/utils/recurrence.js';

test('generateOccurrenceDates: daily', () => {
  assert.deepEqual(generateOccurrenceDates('2026-01-30', 'daily', 1, 3), ['2026-01-30', '2026-01-31', '2026-02-01']);
});

test('generateOccurrenceDates: daily with interval > 1', () => {
  assert.deepEqual(generateOccurrenceDates('2026-01-01', 'daily', 3, 3), ['2026-01-01', '2026-01-04', '2026-01-07']);
});

test('generateOccurrenceDates: weekly', () => {
  assert.deepEqual(generateOccurrenceDates('2026-01-01', 'weekly', 1, 3), ['2026-01-01', '2026-01-08', '2026-01-15']);
});

test('generateOccurrenceDates: monthly clamps to the target month last day', () => {
  // Jan 31 + 1 month should land on Feb 28 (2026 is not a leap year), not
  // overflow into March — see the "same day each month" comment in
  // recurrence.js.
  assert.deepEqual(generateOccurrenceDates('2026-01-31', 'monthly', 1, 2), ['2026-01-31', '2026-02-28']);
});

test('generateOccurrenceDates: monthly on a normal day of month', () => {
  assert.deepEqual(generateOccurrenceDates('2026-03-15', 'monthly', 1, 3), ['2026-03-15', '2026-04-15', '2026-05-15']);
});

test('validateRecurrence: accepts a valid rule', () => {
  assert.equal(validateRecurrence({ frequency: 'weekly', interval: 2, count: 5 }), null);
});

test('validateRecurrence: rejects an unknown frequency', () => {
  assert.match(validateRecurrence({ frequency: 'yearly', interval: 1, count: 3 }), /frequency/);
});

test('validateRecurrence: rejects a non-positive interval', () => {
  assert.match(validateRecurrence({ frequency: 'daily', interval: 0, count: 3 }), /interval/);
});

test('validateRecurrence: rejects a count below 2', () => {
  assert.match(validateRecurrence({ frequency: 'daily', interval: 1, count: 1 }), /count/);
});

test('validateRecurrence: rejects a count above MAX_OCCURRENCES', () => {
  assert.match(validateRecurrence({ frequency: 'daily', interval: 1, count: MAX_OCCURRENCES + 1 }), /count/);
});
