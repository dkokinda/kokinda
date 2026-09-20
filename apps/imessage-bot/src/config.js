'use strict';

require('dotenv').config();

const { parseAllowedContacts } = require('./webhook/allowlist');

/**
 * Reads a string env var, treating unset and whitespace-only values as
 * absent so a stray `FOO=` in a `.env` file falls back to the default
 * rather than overriding it with an empty string.
 */
function readString(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed === '' ? fallback : trimmed;
}

/**
 * Reads a positive-number env var. Anything unset, non-numeric, or <= 0
 * falls back to the default.
 */
function readNumber(value, fallback) {
  const parsed = Number(readString(value, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Builds the app's configuration from an environment object. Exported for
 * tests; the app itself uses the `config` snapshot of `process.env` below.
 */
function loadConfig(env = process.env) {
  return {
    port: readNumber(env.PORT, 3000),
    webhookToken: readString(env.WEBHOOK_TOKEN),
    // Empty/unset means "reply to everyone" — see webhook/allowlist.js.
    allowedContacts: parseAllowedContacts(readString(env.ALLOWED_CONTACTS)),
    bluebubbles: {
      serverUrl: readString(env.BLUEBUBBLES_SERVER_URL),
      password: readString(env.BLUEBUBBLES_PASSWORD),
      // 'apple-script' works out of the box; 'private-api' needs BlueBubbles'
      // Private API enabled (which requires disabling SIP).
      sendMethod: readString(env.BLUEBUBBLES_SEND_METHOD, 'apple-script'),
    },
    anthropic: {
      model: readString(env.ANTHROPIC_MODEL, 'claude-opus-4-8'),
    },
    conversation: {
      maxHistoryMessages: readNumber(env.MAX_HISTORY_MESSAGES, 30),
    },
  };
}

const config = loadConfig();

module.exports = { config, loadConfig };
