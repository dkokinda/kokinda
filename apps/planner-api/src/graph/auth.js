import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { config, deviceCodeUrl, tokenUrl } from '../config.js';

let cachedToken = null;
let cachedExpiryMs = 0;

/** In-memory override for the refresh token, so tests never touch disk. */
let refreshTokenOverride;

export function resetTokenCache() {
  cachedToken = null;
  cachedExpiryMs = 0;
  refreshTokenOverride = undefined;
}

/** Seed the delegated refresh token directly, bypassing the on-disk cache. */
export function setRefreshToken(token) {
  refreshTokenOverride = token;
}

export function readRefreshToken() {
  if (refreshTokenOverride !== undefined) return refreshTokenOverride;
  if (!existsSync(config.graph.tokenCachePath)) return null;
  try {
    return JSON.parse(readFileSync(config.graph.tokenCachePath, 'utf8')).refresh_token ?? null;
  } catch {
    return null;
  }
}

export function writeRefreshToken(token) {
  if (refreshTokenOverride !== undefined) {
    refreshTokenOverride = token;
    return;
  }
  writeFileSync(config.graph.tokenCachePath, `${JSON.stringify({ refresh_token: token }, null, 2)}\n`, {
    mode: 0o600,
  });
}

async function postForm(url, form, fetchImpl) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
  });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    // Non-JSON error bodies are surfaced verbatim below.
  }
  return { ok: res.ok, status: res.status, json, text };
}

function identityError(what, { status, json, text }) {
  return new Error(`${what} failed (${status}): ${json.error_description ?? json.error ?? text}`);
}

async function clientCredentialsGrant(fetchImpl) {
  if (!config.graph.clientSecret) {
    throw new Error('GRAPH_CLIENT_SECRET must be set when GRAPH_AUTH_MODE=client_credentials.');
  }
  const result = await postForm(
    tokenUrl(),
    {
      grant_type: 'client_credentials',
      client_id: config.graph.clientId,
      client_secret: config.graph.clientSecret,
      // App-only tokens always use .default; per-scope consent does not apply.
      scope: 'https://graph.microsoft.com/.default',
    },
    fetchImpl
  );
  if (!result.ok) throw identityError('Microsoft identity client_credentials request', result);
  return result.json;
}

async function refreshTokenGrant(fetchImpl) {
  const refreshToken = readRefreshToken();
  if (!refreshToken) {
    throw new Error(
      `No cached refresh token at ${config.graph.tokenCachePath}. Run \`npm run login\` once to sign in.`
    );
  }
  const result = await postForm(
    tokenUrl(),
    {
      grant_type: 'refresh_token',
      client_id: config.graph.clientId,
      refresh_token: refreshToken,
      scope: config.graph.scopes,
      // Confidential clients must also present the secret on refresh.
      ...(config.graph.clientSecret ? { client_secret: config.graph.clientSecret } : {}),
    },
    fetchImpl
  );
  if (!result.ok) throw identityError('Microsoft identity refresh_token request', result);
  return result.json;
}

/**
 * Returns a Graph access token, minting one on first use and reusing it until
 * it is within 60s of expiry. Delegated mode rides a cached refresh token, so
 * the service runs unattended after a single `npm run login`.
 */
export async function getAccessToken({ fetchImpl = fetch, now = Date.now() } = {}) {
  if (cachedToken && now < cachedExpiryMs - 60_000) {
    return cachedToken;
  }
  if (!config.graph.clientId) {
    throw new Error('GRAPH_CLIENT_ID must be set (Azure app registration -> Application (client) ID).');
  }

  const json =
    config.graph.authMode === 'client_credentials'
      ? await clientCredentialsGrant(fetchImpl)
      : await refreshTokenGrant(fetchImpl);

  cachedToken = json.access_token;
  cachedExpiryMs = now + Number(json.expires_in ?? 3600) * 1000;
  // Entra rotates refresh tokens; persist the new one or the next run is locked out.
  if (json.refresh_token) writeRefreshToken(json.refresh_token);
  return cachedToken;
}

/** Step 1 of the device code flow: ask for a code the user types in a browser. */
export async function requestDeviceCode({ fetchImpl = fetch } = {}) {
  if (!config.graph.clientId) {
    throw new Error('GRAPH_CLIENT_ID must be set (Azure app registration -> Application (client) ID).');
  }
  const result = await postForm(
    deviceCodeUrl(),
    { client_id: config.graph.clientId, scope: config.graph.scopes },
    fetchImpl
  );
  if (!result.ok) throw identityError('Microsoft identity devicecode request', result);
  return result.json;
}

/**
 * Step 2: poll until the user finishes signing in. `authorization_pending` is
 * the expected response while we wait, and `slow_down` asks us to back off.
 */
export async function pollForDeviceToken(
  deviceCode,
  { fetchImpl = fetch, intervalMs = 5000, expiresInSec = 900, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}
) {
  const deadline = Date.now() + expiresInSec * 1000;
  let waitMs = intervalMs;

  for (;;) {
    const result = await postForm(
      tokenUrl(),
      {
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: config.graph.clientId,
        device_code: deviceCode,
      },
      fetchImpl
    );

    if (result.ok) {
      if (result.json.refresh_token) writeRefreshToken(result.json.refresh_token);
      return result.json;
    }

    const error = result.json.error;
    if (error === 'slow_down') {
      waitMs += 5000;
    } else if (error !== 'authorization_pending') {
      throw identityError('Microsoft identity device code exchange', result);
    }

    if (Date.now() >= deadline) {
      throw new Error('Device code expired before sign-in completed. Run `npm run login` again.');
    }
    await sleep(waitMs);
  }
}
