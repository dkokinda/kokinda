'use strict';

const DEFAULT_MAX_HISTORY_MESSAGES = Number(process.env.MAX_HISTORY_MESSAGES) || 30;

/**
 * In-memory, per-chat message history so each iMessage conversation gets
 * its own context window when generating a reply. Keyed by BlueBubbles
 * chat GUID. State is process-local and does not survive a restart.
 */
class ConversationStore {
  constructor(maxHistoryMessages = DEFAULT_MAX_HISTORY_MESSAGES) {
    this.maxHistoryMessages = maxHistoryMessages;
    this.histories = new Map();
  }

  getHistory(chatGuid) {
    return this.histories.get(chatGuid) || [];
  }

  appendMessage(chatGuid, role, content) {
    const history = this.histories.get(chatGuid) || [];
    history.push({ role, content });
    if (history.length > this.maxHistoryMessages) {
      history.splice(0, history.length - this.maxHistoryMessages);
    }
    this.histories.set(chatGuid, history);
  }

  reset(chatGuid) {
    this.histories.delete(chatGuid);
  }
}

module.exports = { ConversationStore };
