# kokinda

## iMessage bot

A Node.js/Express service that responds to incoming iMessages with unique, context-aware replies generated per-chat by Claude. It receives new-message events from a [BlueBubbles](https://bluebubbles.app) server (the Mac-side bridge that exposes iMessage send/receive over HTTP), keeps a separate conversation history per chat, and sends the generated reply back through BlueBubbles.

### Setup

1. Run a BlueBubbles server on a Mac and register this service's `/webhook/bluebubbles?token=<WEBHOOK_TOKEN>` URL as its webhook target. BlueBubbles' Private API (which needs SIP disabled) is optional — leave it off and the bot sends via AppleScript automation instead (`BLUEBUBBLES_SEND_METHOD=apple-script`, the default).
2. Copy `.env.example` to `.env` and fill in `BLUEBUBBLES_SERVER_URL`, `BLUEBUBBLES_PASSWORD`, `WEBHOOK_TOKEN`, and `ANTHROPIC_API_KEY`.
3. `npm install`
4. `npm start`

### Restricting who it replies to

By default the bot replies to every incoming message. To limit it to specific people, set `ALLOWED_CONTACTS` in `.env` to a comma-separated list of phone numbers (E.164 format, e.g. `+15555550123`) and/or email addresses — whatever form BlueBubbles reports for that contact's iMessage handle:

```
ALLOWED_CONTACTS=+15555550123,someone@example.com
```

Messages from anyone not on the list are ignored entirely (no reply, no history kept). Leave it blank to keep replying to everyone.

### Tests

`npm test` runs the `node:test` suite (mocked BlueBubbles/Claude clients — no live credentials needed).