'use strict';

/**
 * Thin REST client for a BlueBubbles server — the Mac-side bridge that
 * exposes sending/receiving iMessages over HTTP. Docs: https://bluebubbles.app
 */
class BlueBubblesClient {
  constructor({ serverUrl, password, fetchImpl = fetch } = {}) {
    if (!serverUrl) throw new Error('BlueBubbles serverUrl is required');
    if (!password) throw new Error('BlueBubbles password is required');
    this.serverUrl = serverUrl.replace(/\/+$/, '');
    this.password = password;
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
        method: 'private-api',
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
