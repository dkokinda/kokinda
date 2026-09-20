'use strict';

const express = require('express');
const { config } = require('./config');
const { ConversationStore } = require('./store/conversationStore');
const { BlueBubblesClient } = require('./bluebubbles/client');
const { ClaudeResponder } = require('./anthropic/responder');
const { BlueBubblesWebhookHandler } = require('./webhook/handler');

function createApp({ store, bluebubbles, responder, webhookToken, allowedContacts } = {}) {
  const app = express();
  app.use(express.json());

  const resolvedStore = store || new ConversationStore();
  const resolvedBluebubbles = bluebubbles || new BlueBubblesClient(config.bluebubbles);
  const resolvedResponder = responder || new ClaudeResponder();
  const resolvedToken = webhookToken !== undefined ? webhookToken : config.webhookToken;
  const resolvedAllowedContacts =
    allowedContacts !== undefined ? allowedContacts : config.allowedContacts;

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
  const { port } = config;
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
