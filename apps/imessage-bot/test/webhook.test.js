'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/server');
const { ConversationStore } = require('../src/store/conversationStore');

function makeFakeResponder(replyText) {
  return {
    calls: [],
    async generateReply(messages) {
      // Snapshot the array — the store may mutate the same reference
      // (e.g. appending the assistant reply) after this call returns.
      this.calls.push([...messages]);
      return replyText;
    },
  };
}

function makeFakeBluebubbles() {
  return {
    sent: [],
    async sendMessage(chatGuid, message) {
      this.sent.push({ chatGuid, message });
      return { ok: true };
    },
  };
}

test('responds to a new incoming message with a generated reply', async () => {
  const store = new ConversationStore();
  const responder = makeFakeResponder('Hey! Good to hear from you.');
  const bluebubbles = makeFakeBluebubbles();
  const app = createApp({ store, responder, bluebubbles, webhookToken: 'secret' });

  const res = await request(app)
    .post('/webhook/bluebubbles?token=secret')
    .send({
      type: 'new-message',
      data: {
        text: 'hi there',
        isFromMe: false,
        chats: [{ guid: 'iMessage;-;+15551234567' }],
      },
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.handled, true);
  assert.equal(bluebubbles.sent.length, 1);
  assert.equal(bluebubbles.sent[0].chatGuid, 'iMessage;-;+15551234567');
  assert.equal(bluebubbles.sent[0].message, 'Hey! Good to hear from you.');
  assert.equal(store.getHistory('iMessage;-;+15551234567').length, 2);
  assert.equal(responder.calls[0][responder.calls[0].length - 1].content, 'hi there');
});

test('ignores messages sent from the owner (isFromMe)', async () => {
  const store = new ConversationStore();
  const responder = makeFakeResponder('should not be called');
  const bluebubbles = makeFakeBluebubbles();
  const app = createApp({ store, responder, bluebubbles, webhookToken: 'secret' });

  const res = await request(app)
    .post('/webhook/bluebubbles?token=secret')
    .send({
      type: 'new-message',
      data: { text: 'hi', isFromMe: true, chats: [{ guid: 'chat-1' }] },
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.handled, false);
  assert.equal(bluebubbles.sent.length, 0);
});

test('ignores non "new-message" event types', async () => {
  const app = createApp({
    store: new ConversationStore(),
    responder: makeFakeResponder('x'),
    bluebubbles: makeFakeBluebubbles(),
    webhookToken: 'secret',
  });

  const res = await request(app)
    .post('/webhook/bluebubbles?token=secret')
    .send({ type: 'updated-message', data: {} });

  assert.equal(res.status, 200);
  assert.equal(res.body.handled, false);
});

test('rejects requests with a missing or wrong webhook token', async () => {
  const app = createApp({
    store: new ConversationStore(),
    responder: makeFakeResponder('x'),
    bluebubbles: makeFakeBluebubbles(),
    webhookToken: 'secret',
  });

  const missing = await request(app).post('/webhook/bluebubbles').send({});
  assert.equal(missing.status, 401);

  const wrong = await request(app).post('/webhook/bluebubbles?token=nope').send({});
  assert.equal(wrong.status, 401);
});

test('keeps separate conversation history per chat', async () => {
  const store = new ConversationStore();
  const responder = makeFakeResponder('ok');
  const bluebubbles = makeFakeBluebubbles();
  const app = createApp({ store, responder, bluebubbles, webhookToken: 'secret' });

  await request(app).post('/webhook/bluebubbles?token=secret').send({
    type: 'new-message',
    data: { text: 'hi from chat A', isFromMe: false, chats: [{ guid: 'chat-A' }] },
  });
  await request(app).post('/webhook/bluebubbles?token=secret').send({
    type: 'new-message',
    data: { text: 'hi from chat B', isFromMe: false, chats: [{ guid: 'chat-B' }] },
  });

  assert.equal(store.getHistory('chat-A').length, 2);
  assert.equal(store.getHistory('chat-B').length, 2);
});

test('allowlist: replies to a contact on the list', async () => {
  const store = new ConversationStore();
  const responder = makeFakeResponder('hey!');
  const bluebubbles = makeFakeBluebubbles();
  const app = createApp({
    store,
    responder,
    bluebubbles,
    webhookToken: 'secret',
    allowedContacts: ['+15555550123'],
  });

  const res = await request(app)
    .post('/webhook/bluebubbles?token=secret')
    .send({
      type: 'new-message',
      data: {
        text: 'hi',
        isFromMe: false,
        handle: { address: '+15555550123' },
        chats: [{ guid: 'chat-allowed' }],
      },
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.handled, true);
  assert.equal(bluebubbles.sent.length, 1);
});

test('allowlist: ignores a contact not on the list', async () => {
  const store = new ConversationStore();
  const responder = makeFakeResponder('should not be called');
  const bluebubbles = makeFakeBluebubbles();
  const app = createApp({
    store,
    responder,
    bluebubbles,
    webhookToken: 'secret',
    allowedContacts: ['+15555550123'],
  });

  const res = await request(app)
    .post('/webhook/bluebubbles?token=secret')
    .send({
      type: 'new-message',
      data: {
        text: 'hi',
        isFromMe: false,
        handle: { address: '+19998887777' },
        chats: [{ guid: 'chat-blocked' }],
      },
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.handled, false);
  assert.equal(res.body.reason, 'sender-not-allowed');
  assert.equal(bluebubbles.sent.length, 0);
  assert.deepEqual(store.getHistory('chat-blocked'), []);
});

test('allowlist: replies to everyone when unset (default)', async () => {
  const store = new ConversationStore();
  const responder = makeFakeResponder('hey!');
  const bluebubbles = makeFakeBluebubbles();
  const app = createApp({ store, responder, bluebubbles, webhookToken: 'secret' });

  const res = await request(app)
    .post('/webhook/bluebubbles?token=secret')
    .send({
      type: 'new-message',
      data: {
        text: 'hi',
        isFromMe: false,
        handle: { address: '+19998887777' },
        chats: [{ guid: 'chat-anyone' }],
      },
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.handled, true);
  assert.equal(bluebubbles.sent.length, 1);
});

test('health endpoint reports ok', async () => {
  const app = createApp({
    store: new ConversationStore(),
    responder: makeFakeResponder('x'),
    bluebubbles: makeFakeBluebubbles(),
    webhookToken: 'secret',
  });

  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
});
