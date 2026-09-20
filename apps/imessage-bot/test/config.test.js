'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../src/config');

test('falls back to defaults when nothing is set', () => {
  const config = loadConfig({});

  assert.equal(config.port, 3000);
  assert.equal(config.webhookToken, '');
  assert.deepEqual(config.allowedContacts, []);
  assert.equal(config.bluebubbles.serverUrl, '');
  assert.equal(config.bluebubbles.password, '');
  assert.equal(config.bluebubbles.sendMethod, 'apple-script');
  assert.equal(config.anthropic.model, 'claude-opus-5');
  assert.equal(config.conversation.maxHistoryMessages, 30);
});

test('reads every value from the environment', () => {
  const config = loadConfig({
    PORT: '8080',
    WEBHOOK_TOKEN: 'secret',
    ALLOWED_CONTACTS: '+15555550123, Someone@Example.com',
    BLUEBUBBLES_SERVER_URL: 'http://mac.local:1234',
    BLUEBUBBLES_PASSWORD: 'hunter2',
    BLUEBUBBLES_SEND_METHOD: 'private-api',
    ANTHROPIC_MODEL: 'claude-sonnet-5',
    MAX_HISTORY_MESSAGES: '12',
  });

  assert.equal(config.port, 8080);
  assert.equal(config.webhookToken, 'secret');
  assert.deepEqual(config.allowedContacts, ['+15555550123', 'someone@example.com']);
  assert.equal(config.bluebubbles.serverUrl, 'http://mac.local:1234');
  assert.equal(config.bluebubbles.password, 'hunter2');
  assert.equal(config.bluebubbles.sendMethod, 'private-api');
  assert.equal(config.anthropic.model, 'claude-sonnet-5');
  assert.equal(config.conversation.maxHistoryMessages, 12);
});

test('treats blank values as unset rather than overriding defaults', () => {
  const config = loadConfig({
    PORT: '',
    BLUEBUBBLES_SEND_METHOD: '   ',
    ANTHROPIC_MODEL: '',
    MAX_HISTORY_MESSAGES: '',
    ALLOWED_CONTACTS: '  ',
  });

  assert.equal(config.port, 3000);
  assert.equal(config.bluebubbles.sendMethod, 'apple-script');
  assert.equal(config.anthropic.model, 'claude-opus-5');
  assert.equal(config.conversation.maxHistoryMessages, 30);
  assert.deepEqual(config.allowedContacts, []);
});

test('ignores non-numeric and non-positive numeric values', () => {
  const config = loadConfig({ PORT: 'not-a-port', MAX_HISTORY_MESSAGES: '0' });

  assert.equal(config.port, 3000);
  assert.equal(config.conversation.maxHistoryMessages, 30);
});
