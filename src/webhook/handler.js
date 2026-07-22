'use strict';

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

/**
 * Handles BlueBubbles "new-message" webhook events: appends the incoming
 * text to that chat's history, asks Claude for a reply grounded in the
 * conversation so far, then sends the reply back through BlueBubbles.
 */
class BlueBubblesWebhookHandler {
  constructor({ store, responder, bluebubbles }) {
    this.store = store;
    this.responder = responder;
    this.bluebubbles = bluebubbles;
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

    this.store.appendMessage(chatGuid, 'user', data.text);

    const reply = await this.responder.generateReply(this.store.getHistory(chatGuid));
    if (reply) {
      this.store.appendMessage(chatGuid, 'assistant', reply);
      await this.bluebubbles.sendMessage(chatGuid, reply);
    }

    return { handled: true, chatGuid, reply };
  }
}

module.exports = { BlueBubblesWebhookHandler, isTrustworthyIncomingMessage, extractChatGuid };
