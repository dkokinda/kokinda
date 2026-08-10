'use strict';

require('dotenv').config();

const express = require('express');
const { ConversationStore } = require('./store/conversationStore');
const { BlueBubblesClient } = require('./bluebubbles/client');
const { ClaudeResponder } = require('./anthropic/responder');
const { BlueBubblesWebhookHandler } = require('./webhook/handler');
const { parseAllowedContacts } = require('./webhook/allowlist');

function createApp({ store, bluebubbles, responder, webhookToken, allowedContacts } = {}) {
  const app = express();
  app.use(express.json());

  const resolvedStore = store || new ConversationStore();
  const resolvedBluebubbles =
    bluebubbles ||
    new BlueBubblesClient({
      serverUrl: process.env.BLUEBUBBLES_SERVER_URL,
      password: process.env.BLUEBUBBLES_PASSWORD,
      sendMethod: process.env.BLUEBUBBLES_SEND_METHOD,
    });
  const resolvedResponder = responder || new ClaudeResponder();
  const resolvedToken = webhookToken !== undefined ? webhookToken : process.env.WEBHOOK_TOKEN;
  const resolvedAllowedContacts =
    allowedContacts !== undefined ? allowedContacts : parseAllowedContacts(process.env.ALLOWED_CONTACTS);

  const handler = new BlueBubblesWebhookHandler({
    store: resolvedStore,
    responder: resolvedResponder,
    bluebubbles: resolvedBluebubbles,
    allowedContacts: resolvedAllowedContacts,
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/webhook/bluebubbles', async (req, res) => {
    if (resolvedToken && req.query.token !== resolvedToken) {
      res.status(401).json({ error: 'invalid token' });
      return;
    }

    try {
      const result = await handler.handleEvent(req.body);
      res.status(200).json(result);
    } catch (err) {
      console.error('Failed to handle BlueBubbles webhook event', err);
      res.status(500).json({ error: 'internal error' });
    }
  });

  return app;
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  try {
    const app = createApp();
    app.listen(port, () => {
      console.log(`iMessage bot listening on port ${port}`);
    });
  } catch (err) {
    console.error('Failed to start iMessage bot:', err.message);
    process.exit(1);
  }
}

module.exports = { createApp };
