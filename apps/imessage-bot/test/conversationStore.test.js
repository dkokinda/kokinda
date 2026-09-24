'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ConversationStore } = require('../src/store/conversationStore');

test('trims history to the configured max length', () => {
  const store = new ConversationStore(4);
  for (let i = 0; i < 10; i += 1) {
    store.appendMessage('chat-1', 'user', `message ${i}`);
  }
  const history = store.getHistory('chat-1');
  assert.equal(history.length, 4);
  assert.equal(history[0].content, 'message 6');
  assert.equal(history[3].content, 'message 9');
});

test('keeps separate history per chat guid', () => {
  const store = new ConversationStore();
  store.appendMessage('chat-A', 'user', 'hi from A');
  store.appendMessage('chat-B', 'user', 'hi from B');

  assert.equal(store.getHistory('chat-A').length, 1);
  assert.equal(store.getHistory('chat-B').length, 1);
  assert.equal(store.getHistory('chat-A')[0].content, 'hi from A');
});

test('reset clears history for a chat', () => {
  const store = new ConversationStore();
  store.appendMessage('chat-1', 'user', 'hi');
  store.reset('chat-1');
  assert.deepEqual(store.getHistory('chat-1'), []);
});

test('getHistory on an unknown chat returns an empty array', () => {
  const store = new ConversationStore();
  assert.deepEqual(store.getHistory('never-seen'), []);
});
