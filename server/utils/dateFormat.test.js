import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDate } from '#server/utils/dateFormat.js';

test('formatDate: converts YYYY-MM-DD to DD.MM.YYYY', () => {
  assert.equal(formatDate('2026-07-28'), '28.07.2026');
});

test('formatDate: passes through falsy input unchanged', () => {
  assert.equal(formatDate(''), '');
  assert.equal(formatDate(null), null);
  assert.equal(formatDate(undefined), undefined);
});

test('formatDate: passes through a string with no dashes unchanged', () => {
  // split('-') on a dash-less string leaves month/day undefined, tripping
  // the "!y || !m || !d" guard.
  assert.equal(formatDate('nodate'), 'nodate');
});
