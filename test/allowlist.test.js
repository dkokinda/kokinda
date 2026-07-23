'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAllowedContacts, isContactAllowed } = require('../src/webhook/allowlist');

test('parseAllowedContacts splits, trims, and lowercases entries', () => {
  const parsed = parseAllowedContacts(' +15555550123 , Someone@Example.com ,, ');
  assert.deepEqual(parsed, ['+15555550123', 'someone@example.com']);
});

test('parseAllowedContacts returns an empty array for blank/undefined input', () => {
  assert.deepEqual(parseAllowedContacts(''), []);
  assert.deepEqual(parseAllowedContacts(undefined), []);
});

test('isContactAllowed allows everyone when no allowlist is configured', () => {
  assert.equal(isContactAllowed('+15555550123', []), true);
  assert.equal(isContactAllowed(null, []), true);
});

test('isContactAllowed matches a configured contact case-insensitively', () => {
  const allowed = parseAllowedContacts('+15555550123,Someone@Example.com');
  assert.equal(isContactAllowed('+15555550123', allowed), true);
  assert.equal(isContactAllowed('someone@example.com', allowed), true);
  assert.equal(isContactAllowed('SOMEONE@EXAMPLE.COM', allowed), true);
});

test('isContactAllowed rejects a contact not on the list, or a missing address', () => {
  const allowed = parseAllowedContacts('+15555550123');
  assert.equal(isContactAllowed('+19998887777', allowed), false);
  assert.equal(isContactAllowed(null, allowed), false);
  assert.equal(isContactAllowed(undefined, allowed), false);
});
