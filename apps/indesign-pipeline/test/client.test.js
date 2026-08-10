import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { submitOperation, getJobStatus, AdobeApiError } from '../src/adobe/client.js';
import { resetTokenCache } from '../src/adobe/auth.js';
import { config } from '../src/config.js';

function fakeFetch(routes) {
  return async (url, init) => {
    if (url === config.adobe.tokenUrl) {
      return { ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
    }
    const route = routes[url];
    if (!route) throw new Error(`Unexpected fetch to ${url}`);
    return typeof route === 'function' ? route(init) : route;
  };
}

describe('submitOperation / getJobStatus', () => {
  beforeEach(() => {
    resetTokenCache();
    config.adobe.clientId = 'test-client-id';
    config.adobe.clientSecret = 'test-client-secret';
    config.adobe.orgId = 'test-org';
  });

  test('submitOperation posts the payload and returns the parsed JSON body', async () => {
    const url = `${config.adobe.apiBaseUrl}/v3/create-rendition`;
    let seenInit;
    const fetchImpl = fakeFetch({
      [url]: (init) => {
        seenInit = init;
        return { ok: true, json: async () => ({ jobId: 'abc-123' }) };
      },
    });

    const result = await submitOperation('/v3/create-rendition', { params: { foo: 'bar' } }, { fetchImpl });

    assert.deepEqual(result, { jobId: 'abc-123' });
    assert.equal(seenInit.method, 'POST');
    assert.equal(seenInit.headers['x-api-key'], 'test-client-id');
    assert.equal(seenInit.headers['x-gw-ims-org-id'], 'test-org');
    assert.equal(seenInit.headers.Authorization, 'Bearer tok');
    assert.deepEqual(JSON.parse(seenInit.body), { params: { foo: 'bar' } });
  });

  test('submitOperation throws AdobeApiError on a non-ok response', async () => {
    const url = `${config.adobe.apiBaseUrl}/v3/create-rendition`;
    const fetchImpl = fakeFetch({
      [url]: { ok: false, status: 422, json: async () => ({ message: 'bad template' }) },
    });

    await assert.rejects(
      () => submitOperation('/v3/create-rendition', {}, { fetchImpl }),
      (err) => {
        assert.ok(err instanceof AdobeApiError);
        assert.equal(err.status, 422);
        assert.deepEqual(err.body, { message: 'bad template' });
        return true;
      }
    );
  });

  test('getJobStatus fetches the status endpoint for a job id', async () => {
    const url = `${config.adobe.apiBaseUrl}${config.adobe.operations.status}/job-1`;
    const fetchImpl = fakeFetch({
      [url]: { ok: true, json: async () => ({ status: 'succeeded', output: [{ url: 'https://x/out.pdf' }] }) },
    });

    const status = await getJobStatus('job-1', { fetchImpl });
    assert.equal(status.status, 'succeeded');
  });
});
