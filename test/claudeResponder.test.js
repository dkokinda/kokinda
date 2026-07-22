'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ClaudeResponder } = require('../src/anthropic/responder');

test('extracts and trims the text block from the Claude response', async () => {
  const fakeClient = {
    messages: {
      create: async (params) => {
        assert.equal(params.model, 'claude-opus-4-8');
        assert.equal(params.messages[params.messages.length - 1].role, 'user');
        return {
          content: [{ type: 'text', text: '  a thoughtful reply  ' }],
        };
      },
    },
  };

  const responder = new ClaudeResponder({ client: fakeClient, model: 'claude-opus-4-8' });
  const reply = await responder.generateReply([{ role: 'user', content: 'hey' }]);
  assert.equal(reply, 'a thoughtful reply');
});

test('returns an empty string if the response has no text block', async () => {
  const fakeClient = {
    messages: {
      create: async () => ({ content: [] }),
    },
  };

  const responder = new ClaudeResponder({ client: fakeClient });
  const reply = await responder.generateReply([{ role: 'user', content: 'hey' }]);
  assert.equal(reply, '');
});
