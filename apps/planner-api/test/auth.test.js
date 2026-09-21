import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getAccessToken, pollForDeviceToken, requestDeviceCode, resetTokenCache, setRefreshToken } from '../src/graph/auth.js';
import { config, deviceCodeUrl, tokenUrl } from '../src/config.js';

function fakeFetch(...responses) {
  const calls = [];
  const queue = [...responses];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, form: new URLSearchParams(init.body.toString()) });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    return {
      ok: next.ok ?? true,
      status: next.status ?? (next.ok === false ? 400 : 200),
      text: async () => JSON.stringify(next.body ?? {}),
    };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

describe('getAccessToken', () => {
  beforeEach(() => {
    resetTokenCache();
    config.graph.clientId = 'test-client-id';
    config.graph.clientSecret = '';
    config.graph.tenantId = 'organizations';
    config.graph.authMode = 'device_code';
    setRefreshToken('cached-refresh-token');
  });

  test('exchanges the cached refresh token for an access token in delegated mode', async () => {
    const fetchImpl = fakeFetch({ body: { access_token: 'tok-1', expires_in: 3600 } });

    const token = await getAccessToken({ fetchImpl, now: 0 });

    assert.equal(token, 'tok-1');
    assert.equal(fetchImpl.calls[0].url, tokenUrl());
    assert.equal(fetchImpl.calls[0].form.get('grant_type'), 'refresh_token');
    assert.equal(fetchImpl.calls[0].form.get('refresh_token'), 'cached-refresh-token');
  });

  test('persists the rotated refresh token so the next run can still sign in', async () => {
    const fetchImpl = fakeFetch({ body: { access_token: 'tok-1', expires_in: 3600, refresh_token: 'rotated' } });

    await getAccessToken({ fetchImpl, now: 0 });
    resetTokenCache();
    setRefreshToken('rotated');
    await getAccessToken({ fetchImpl, now: 0 });

    assert.equal(fetchImpl.calls[1].form.get('refresh_token'), 'rotated');
  });

  test('uses the client_credentials grant with the .default scope in app-only mode', async () => {
    config.graph.authMode = 'client_credentials';
    config.graph.clientSecret = 'test-secret';
    const fetchImpl = fakeFetch({ body: { access_token: 'app-tok', expires_in: 3600 } });

    const token = await getAccessToken({ fetchImpl, now: 0 });

    assert.equal(token, 'app-tok');
    assert.equal(fetchImpl.calls[0].form.get('grant_type'), 'client_credentials');
    assert.equal(fetchImpl.calls[0].form.get('scope'), 'https://graph.microsoft.com/.default');
  });

  test('reuses a cached token until it is near expiry', async () => {
    const fetchImpl = fakeFetch({ body: { access_token: 'tok-2', expires_in: 3600 } });

    await getAccessToken({ fetchImpl, now: 0 });
    const token = await getAccessToken({ fetchImpl, now: 1000 });

    assert.equal(token, 'tok-2');
    assert.equal(fetchImpl.calls.length, 1, 'should not re-request while cached token is fresh');
  });

  test('refreshes once the cached token is within the expiry safety margin', async () => {
    const fetchImpl = fakeFetch({ body: { access_token: 'tok-3', expires_in: 3600 } });

    await getAccessToken({ fetchImpl, now: 0 });
    await getAccessToken({ fetchImpl, now: 3600 * 1000 });

    assert.equal(fetchImpl.calls.length, 2);
  });

  test('surfaces the identity platform error description', async () => {
    const fetchImpl = fakeFetch({ ok: false, status: 400, body: { error_description: 'AADSTS70008: expired' } });

    await assert.rejects(() => getAccessToken({ fetchImpl, now: 0 }), /AADSTS70008/);
  });

  test('explains how to sign in when no refresh token is cached', async () => {
    setRefreshToken(null);
    await assert.rejects(() => getAccessToken({ fetchImpl: fakeFetch({ body: {} }), now: 0 }), /npm run login/);
  });

  test('throws when the client id is not configured', async () => {
    config.graph.clientId = '';
    await assert.rejects(() => getAccessToken({ fetchImpl: fakeFetch({ body: {} }), now: 0 }), /GRAPH_CLIENT_ID/);
  });

  test('requires a secret for app-only mode', async () => {
    config.graph.authMode = 'client_credentials';
    config.graph.clientSecret = '';
    await assert.rejects(() => getAccessToken({ fetchImpl: fakeFetch({ body: {} }), now: 0 }), /GRAPH_CLIENT_SECRET/);
  });
});

describe('device code flow', () => {
  beforeEach(() => {
    resetTokenCache();
    config.graph.clientId = 'test-client-id';
    config.graph.clientSecret = '';
    config.graph.authMode = 'device_code';
    setRefreshToken(null);
  });

  test('requests a user code from the devicecode endpoint', async () => {
    const fetchImpl = fakeFetch({ body: { user_code: 'ABCD-EFGH', device_code: 'dev-1', interval: 5 } });

    const device = await requestDeviceCode({ fetchImpl });

    assert.equal(device.user_code, 'ABCD-EFGH');
    assert.equal(fetchImpl.calls[0].url, deviceCodeUrl());
  });

  test('keeps polling while authorization is pending, then returns the token', async () => {
    const fetchImpl = fakeFetch(
      { ok: false, status: 400, body: { error: 'authorization_pending' } },
      { body: { access_token: 'tok', expires_in: 3600, refresh_token: 'rt' } }
    );

    const result = await pollForDeviceToken('dev-1', { fetchImpl, intervalMs: 0, sleep: async () => {} });

    assert.equal(result.access_token, 'tok');
    assert.equal(fetchImpl.calls.length, 2);
  });

  test('backs off when the identity platform asks it to slow down', async () => {
    const waits = [];
    const fetchImpl = fakeFetch(
      { ok: false, status: 400, body: { error: 'slow_down' } },
      { body: { access_token: 'tok', expires_in: 3600 } }
    );

    await pollForDeviceToken('dev-1', {
      fetchImpl,
      intervalMs: 5000,
      sleep: async (ms) => waits.push(ms),
    });

    assert.deepEqual(waits, [10_000]);
  });

  test('throws on a terminal error rather than polling forever', async () => {
    const fetchImpl = fakeFetch({ ok: false, status: 400, body: { error: 'expired_token' } });

    await assert.rejects(
      () => pollForDeviceToken('dev-1', { fetchImpl, intervalMs: 0, sleep: async () => {} }),
      /expired_token/
    );
  });
});
