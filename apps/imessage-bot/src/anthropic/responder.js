'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';
const MAX_REPLY_TOKENS = 1024;

const SYSTEM_PROMPT = `You are ghostwriting iMessage replies on behalf of the phone's owner. Each chat is a separate relationship with its own history — read the conversation you're given and reply the way the owner would naturally text back in this specific chat, not with a generic canned response.

Guidelines:
- Write one short, natural text message — the way a person texts, not an email.
- Be genuinely responsive to what was just said: react to specifics from the conversation instead of answering in the abstract.
- Match the tone and register already established in this chat (casual, playful, formal, etc.), and keep it consistent with the rest of the history.
- Never mention that you are an AI or that the message was generated.
- Reply with only the message text itself — no preamble, no quotation marks, no signature.`;

/**
 * Generates a reply for a single iMessage chat using the Claude API.
 * `messages` is the full per-chat history (alternating user/assistant
 * turns, ending in the latest incoming user message).
 */
class ClaudeResponder {
  constructor({ client, model = DEFAULT_MODEL } = {}) {
    this.client = client || new Anthropic();
    this.model = model;
  }

  async generateReply(messages) {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: MAX_REPLY_TOKENS,
      system: SYSTEM_PROMPT,
      messages,
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    return textBlock ? textBlock.text.trim() : '';
  }
}

module.exports = { ClaudeResponder, SYSTEM_PROMPT };
