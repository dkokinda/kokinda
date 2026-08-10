import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getAccessToken, resetTokenCache } from '../src/adobe/auth.js';
import { config } from '../src/config.js';

function fakeFetch(response) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return response;
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

describe('getAccessToken', () => {
  beforeEach(() => {
    resetTokenCache();
    config.adobe.clientId = 'test-client-id';
    config.adobe.clientSecret = 'test-client-secret';
  });

  test('requests a token from the Adobe IMS endpoint with client_credentials', async () => {
    const fetchImpl = fakeFetch({
      ok: true,
      json: async () => ({ access_token: 'tok-1', expires_in: 3600 }),
    });

    const token = await getAccessToken({ fetchImpl, now: 0 });

    assert.equal(token, 'tok-1');
    assert.equal(fetchImpl.calls.length, 1);
    assert.equal(fetchImpl.calls[0].url, config.adobe.tokenUrl);
    const body = fetchImpl.calls[0].init.body.toString();
    assert.match(body, /grant_type=client_credentials/);
    assert.match(body, /client_id=test-client-id/);
  });

  test('reuses a cached token until it is near expiry', async () => {
    const fetchImpl = fakeFetch({
      ok: true,
      json: async () => ({ access_token: 'tok-2', expires_in: 3600 }),
    });

    await getAccessToken({ fetchImpl, now: 0 });
    const token = await getAccessToken({ fetchImpl, now: 1000 });

    assert.equal(token, 'tok-2');
    assert.equal(fetchImpl.calls.length, 1, 'should not re-request while cached token is fresh');
  });

  test('refreshes once the cached token is within the expiry safety margin', async () => {
    const fetchImpl = fakeFetch({
      ok: true,
      json: async () => ({ access_token: 'tok-3', expires_in: 3600 }),
    });

    await getAccessToken({ fetchImpl, now: 0 });
    await getAccessToken({ fetchImpl, now: 3600 * 1000 });

    assert.equal(fetchImpl.calls.length, 2, 'should re-request once within 60s of expiry');
  });

  test('throws with response body text when the IMS request fails', async () => {
    const fetchImpl = fakeFetch({
      ok: false,
      status: 401,
      text: async () => 'invalid_client',
    });

    await assert.rejects(() => getAccessToken({ fetchImpl, now: 0 }), /invalid_client/);
  });

  test('throws when client credentials are not configured', async () => {
    resetTokenCache();
    config.adobe.clientId = '';
    config.adobe.clientSecret = '';
    await assert.rejects(() => getAccessToken({ fetchImpl: fakeFetch({}) }), /ADOBE_CLIENT_ID/);
  });
});
