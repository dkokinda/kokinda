'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { BlueBubblesClient } = require('../src/bluebubbles/client');

test('sends a text message via the BlueBubbles REST API', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({ status: 200 }),
    };
  };

  const client = new BlueBubblesClient({
    serverUrl: 'http://localhost:1234/',
    password: 'secret',
    fetchImpl: fakeFetch,
  });

  await client.sendMessage('chat-1', 'hello there');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://localhost:1234/api/v1/message/text?password=secret');
  assert.equal(calls[0].options.method, 'POST');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.chatGuid, 'chat-1');
  assert.equal(body.message, 'hello there');
  assert.equal(body.method, 'apple-script');
});

test('uses private-api as the send method when configured', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ status: 200 }) };
  };

  const client = new BlueBubblesClient({
    serverUrl: 'http://localhost:1234',
    password: 'secret',
    sendMethod: 'private-api',
    fetchImpl: fakeFetch,
  });

  await client.sendMessage('chat-1', 'hi');

  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.method, 'private-api');
});

test('rejects an unknown sendMethod', () => {
  assert.throws(
    () => new BlueBubblesClient({ serverUrl: 'http://localhost:1234', password: 'secret', sendMethod: 'carrier-pigeon' }),
    /Invalid BlueBubbles sendMethod/,
  );
});

test('throws with the response body on a non-ok response', async () => {
  const fakeFetch = async () => ({
    ok: false,
    status: 500,
    text: async () => 'boom',
  });

  const client = new BlueBubblesClient({
    serverUrl: 'http://localhost:1234',
    password: 'secret',
    fetchImpl: fakeFetch,
  });

  await assert.rejects(() => client.sendMessage('chat-1', 'hi'), /BlueBubbles sendMessage failed \(500\): boom/);
});

test('requires serverUrl and password', () => {
  assert.throws(() => new BlueBubblesClient({ password: 'secret' }), /serverUrl is required/);
  assert.throws(() => new BlueBubblesClient({ serverUrl: 'http://localhost' }), /password is required/);
});
