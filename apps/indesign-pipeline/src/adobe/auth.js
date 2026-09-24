import { config } from '../config.js';

let cachedToken = null;
let cachedExpiryMs = 0;

/**
 * OAuth Server-to-Server (client_credentials) against Adobe IMS.
 * Tokens are valid for 24h; cached in-memory with a 60s safety margin.
 */
export async function getAccessToken({ fetchImpl = fetch, now = Date.now() } = {}) {
  if (cachedToken && now < cachedExpiryMs - 60_000) {
    return cachedToken;
  }

  if (!config.adobe.clientId || !config.adobe.clientSecret) {
    throw new Error(
      'ADOBE_CLIENT_ID and ADOBE_CLIENT_SECRET must be set (Adobe Developer Console OAuth Server-to-Server credentials).'
    );
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.adobe.clientId,
    client_secret: config.adobe.clientSecret,
    scope: config.adobe.scopes,
  });

  const res = await fetchImpl(config.adobe.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Adobe IMS token request failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  cachedToken = json.access_token;
  cachedExpiryMs = now + Number(json.expires_in ?? 86_400) * 1000;
  return cachedToken;
}

export function resetTokenCache() {
  cachedToken = null;
  cachedExpiryMs = 0;
}
