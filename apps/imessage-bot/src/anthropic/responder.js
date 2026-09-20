'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const { config } = require('../config');

const DEFAULT_MODEL = config.anthropic.model;

// Hard cap on thinking *plus* reply text. Claude Opus 5 thinks by default,
// so this has to leave room for that on top of a one-line text message.
const MAX_REPLY_TOKENS = 4096;

// A short casual reply doesn't need deep reasoning; low effort keeps
// latency and cost down without turning thinking off (which degrades
// output quality on Opus 5).
const REPLY_EFFORT = 'low';

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
      output_config: { effort: REPLY_EFFORT },
      system: SYSTEM_PROMPT,
      messages,
    });

    // Safety classifiers can decline a request with a normal 200 response.
    // Returning '' means the webhook handler sends nothing for this message.
    if (response.stop_reason === 'refusal') {
      const category = response.stop_details ? response.stop_details.category : null;
      console.warn(`Claude declined to generate a reply (category: ${category || 'unknown'})`);
      return '';
    }

    const textBlock = response.content.find((block) => block.type === 'text');
    return textBlock ? textBlock.text.trim() : '';
  }
}

module.exports = { ClaudeResponder, SYSTEM_PROMPT };
