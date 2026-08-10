'use strict';

const { isContactAllowed } = require('./allowlist');

function isTrustworthyIncomingMessage(data) {
  return (
    Boolean(data) &&
    data.isFromMe !== true &&
    typeof data.text === 'string' &&
    data.text.trim().length > 0
  );
}

function extractChatGuid(data) {
  if (Array.isArray(data.chats) && data.chats.length > 0 && data.chats[0].guid) {
    return data.chats[0].guid;
  }
  return null;
}

function extractSenderAddress(data) {
  if (data.handle && typeof data.handle.address === 'string') {
    return data.handle.address;
  }
  return null;
}

/**
 * Handles BlueBubbles "new-message" webhook events: appends the incoming
 * text to that chat's history, asks Claude for a reply grounded in the
 * conversation so far, then sends the reply back through BlueBubbles.
 *
 * `allowedContacts` (normalized handle addresses — see allowlist.js)
 * restricts replies to specific contacts. Leave it empty to reply to
 * everyone (the default).
 */
class BlueBubblesWebhookHandler {
  constructor({ store, responder, bluebubbles, allowedContacts = [] }) {
    this.store = store;
    this.responder = responder;
    this.bluebubbles = bluebubbles;
    this.allowedContacts = allowedContacts;
  }

  async handleEvent(event) {
    if (!event || event.type !== 'new-message') {
      return { handled: false, reason: 'ignored-event-type' };
    }

    const data = event.data;
    if (!isTrustworthyIncomingMessage(data)) {
      return { handled: false, reason: 'ignored-message' };
    }

    const chatGuid = extractChatGuid(data);
    if (!chatGuid) {
      return { handled: false, reason: 'missing-chat-guid' };
    }

    const senderAddress = extractSenderAddress(data);
    if (!isContactAllowed(senderAddress, this.allowedContacts)) {
      return { handled: false, reason: 'sender-not-allowed' };
    }

    this.store.appendMessage(chatGuid, 'user', data.text);

    const reply = await this.responder.generateReply(this.store.getHistory(chatGuid));
    if (reply) {
      this.store.appendMessage(chatGuid, 'assistant', reply);
      await this.bluebubbles.sendMessage(chatGuid, reply);
    }

    return { handled: true, chatGuid, reply };
  }
}

module.exports = {
  BlueBubblesWebhookHandler,
  isTrustworthyIncomingMessage,
  extractChatGuid,
  extractSenderAddress,
};
