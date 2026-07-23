'use strict';

const VALID_SEND_METHODS = new Set(['apple-script', 'private-api']);

/**
 * Thin REST client for a BlueBubbles server — the Mac-side bridge that
 * exposes sending/receiving iMessages over HTTP. Docs: https://bluebubbles.app
 *
 * `sendMethod` defaults to 'apple-script', which works out of the box via
 * macOS Accessibility automation. Use 'private-api' only once BlueBubbles'
 * Private API is actually enabled (requires disabling SIP) — sending with
 * 'private-api' while it's not connected fails.
 */
class BlueBubblesClient {
  constructor({ serverUrl, password, sendMethod = 'apple-script', fetchImpl = fetch } = {}) {
    if (!serverUrl) throw new Error('BlueBubbles serverUrl is required');
    if (!password) throw new Error('BlueBubbles password is required');
    if (!VALID_SEND_METHODS.has(sendMethod)) {
      throw new Error(`Invalid BlueBubbles sendMethod "${sendMethod}" (expected apple-script or private-api)`);
    }
    this.serverUrl = serverUrl.replace(/\/+$/, '');
    this.password = password;
    this.sendMethod = sendMethod;
    this.fetch = fetchImpl;
  }

  async sendMessage(chatGuid, message) {
    const url = `${this.serverUrl}/api/v1/message/text?password=${encodeURIComponent(this.password)}`;
    const response = await this.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatGuid,
        message,
        method: this.sendMethod,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`BlueBubbles sendMessage failed (${response.status}): ${body}`);
    }

    return response.json();
  }
}

module.exports = { BlueBubblesClient };
