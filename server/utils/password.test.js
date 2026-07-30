import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword, verifyPassword } from '#server/utils/password.js';

test('hashPassword/verifyPassword: round-trips the correct password', () => {
  const stored = hashPassword('correct horse battery staple');
  assert.equal(verifyPassword('correct horse battery staple', stored), true);
});

test('verifyPassword: rejects a wrong password', () => {
  const stored = hashPassword('correct horse battery staple');
  assert.equal(verifyPassword('wrong password', stored), false);
});

test('hashPassword: salts each hash differently', () => {
  const a = hashPassword('same password');
  const b = hashPassword('same password');
  assert.notEqual(a, b);
  // ... but both still verify against the same plaintext.
  assert.equal(verifyPassword('same password', a), true);
  assert.equal(verifyPassword('same password', b), true);
});

test('verifyPassword: returns false, does not throw, for a missing/malformed stored value', () => {
  assert.equal(verifyPassword('anything', null), false);
  assert.equal(verifyPassword('anything', undefined), false);
  assert.equal(verifyPassword('anything', 'not-salt-colon-hash-shaped'), false);
});
