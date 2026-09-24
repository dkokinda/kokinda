'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ClaudeResponder } = require('../src/anthropic/responder');

test('extracts and trims the text block from the Claude response', async () => {
  const fakeClient = {
    messages: {
      create: async (params) => {
        assert.equal(params.model, 'claude-opus-5');
        assert.equal(params.messages[params.messages.length - 1].role, 'user');
        return {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: '  a thoughtful reply  ' }],
        };
      },
    },
  };

  const responder = new ClaudeResponder({ client: fakeClient, model: 'claude-opus-5' });
  const reply = await responder.generateReply([{ role: 'user', content: 'hey' }]);
  assert.equal(reply, 'a thoughtful reply');
});

test('leaves room for thinking and asks for low effort', async () => {
  let seenParams;
  const fakeClient = {
    messages: {
      create: async (params) => {
        seenParams = params;
        return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] };
      },
    },
  };

  const responder = new ClaudeResponder({ client: fakeClient });
  await responder.generateReply([{ role: 'user', content: 'hey' }]);

  // max_tokens caps thinking + text, so a 1-line reply still needs headroom.
  assert.ok(seenParams.max_tokens >= 4096);
  assert.deepEqual(seenParams.output_config, { effort: 'low' });
});

test('returns an empty string if the response has no text block', async () => {
  const fakeClient = {
    messages: {
      create: async () => ({ stop_reason: 'end_turn', content: [] }),
    },
  };

  const responder = new ClaudeResponder({ client: fakeClient });
  const reply = await responder.generateReply([{ role: 'user', content: 'hey' }]);
  assert.equal(reply, '');
});

test('returns an empty string when Claude declines the request', async () => {
  const fakeClient = {
    messages: {
      create: async () => ({
        stop_reason: 'refusal',
        stop_details: { type: 'refusal', category: 'cyber', explanation: 'declined' },
        content: [{ type: 'text', text: 'partial text that must not be sent' }],
      }),
    },
  };

  const responder = new ClaudeResponder({ client: fakeClient });
  const reply = await responder.generateReply([{ role: 'user', content: 'hey' }]);
  assert.equal(reply, '');
});
