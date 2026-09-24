import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { resetTokenCache } from '../src/adobe/auth.js';
import { getJob } from '../src/lib/jobStore.js';
import { config } from '../src/config.js';

const ORIGINAL_FETCH = globalThis.fetch;

function installFetch(routes) {
  globalThis.fetch = async (url, init) => {
    if (url === config.adobe.tokenUrl) {
      return { ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
    }
    const route = routes[url];
    if (!route) throw new Error(`Unexpected fetch to ${url}`);
    return typeof route === 'function' ? route(init) : route;
  };
}

async function waitUntilSettled(jobId, { timeoutMs = 1000, intervalMs = 10 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = getJob(jobId);
    if (job.status !== 'pending') return job;
    if (Date.now() >= deadline) throw new Error(`job ${jobId} never left pending`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

describe('routes', () => {
  let app;

  beforeEach(() => {
    resetTokenCache();
    config.adobe.clientId = 'test-client-id';
    config.adobe.clientSecret = 'test-client-secret';
    config.adobe.orgId = 'test-org';
    app = createApp();
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
  });

  test('POST /api/templates/generate submits a rendition job and reports success once polled', async () => {
    const submitUrl = `${config.adobe.apiBaseUrl}${config.adobe.operations.createRendition}`;
    const statusUrl = `${config.adobe.apiBaseUrl}${config.adobe.operations.status}/adobe-gen-1`;
    installFetch({
      [submitUrl]: { ok: true, json: async () => ({ jobId: 'adobe-gen-1' }) },
      [statusUrl]: { ok: true, json: async () => ({ status: 'succeeded', output: [{ url: 'https://x/out.pdf' }] }) },
    });

    const res = await request(app)
      .post('/api/templates/generate')
      .send({ templateUrl: 'https://example.com/template.indt', fields: { name: 'Ada' }, format: 'pdf' });

    assert.equal(res.status, 202);
    assert.ok(res.body.jobId);

    const job = await waitUntilSettled(res.body.jobId);
    assert.equal(job.status, 'succeeded');
    assert.equal(job.result.output[0].url, 'https://x/out.pdf');
  });

  test('POST /api/templates/generate rejects an invalid body', async () => {
    const res = await request(app).post('/api/templates/generate').send({ format: 'pdf' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'invalid_request');
  });

  test('POST /api/convert/pdf-to-indd submits a conversion job', async () => {
    const submitUrl = `${config.adobe.apiBaseUrl}${config.adobe.operations.convertPdfToIndd}`;
    const statusUrl = `${config.adobe.apiBaseUrl}${config.adobe.operations.status}/adobe-conv-1`;
    installFetch({
      [submitUrl]: { ok: true, json: async () => ({ jobId: 'adobe-conv-1' }) },
      [statusUrl]: { ok: true, json: async () => ({ status: 'succeeded', output: [{ url: 'https://x/out.indd' }] }) },
    });

    const res = await request(app).post('/api/convert/pdf-to-indd').send({ pdfUrl: 'https://example.com/doc.pdf' });
    assert.equal(res.status, 202);

    const job = await waitUntilSettled(res.body.jobId);
    assert.equal(job.status, 'succeeded');
    assert.equal(job.kind, 'convert');
  });

  test('POST /api/merge submits a data-merge job and surfaces failures', async () => {
    const submitUrl = `${config.adobe.apiBaseUrl}${config.adobe.operations.mergeData}`;
    const statusUrl = `${config.adobe.apiBaseUrl}${config.adobe.operations.status}/adobe-merge-1`;
    installFetch({
      [submitUrl]: { ok: true, json: async () => ({ jobId: 'adobe-merge-1' }) },
      [statusUrl]: { ok: true, json: async () => ({ status: 'failed', error: 'missing merge field: orderTotal' }) },
    });

    const res = await request(app)
      .post('/api/merge')
      .send({ templateUrl: 'https://example.com/template.indt', dataUrl: 'https://example.com/data.csv' });
    assert.equal(res.status, 202);

    const job = await waitUntilSettled(res.body.jobId);
    assert.equal(job.status, 'failed');
    assert.match(job.error, /orderTotal/);
  });

  test('POST /api/merge/tags returns the merge fields found in a template', async () => {
    const submitUrl = `${config.adobe.apiBaseUrl}${config.adobe.operations.mergeDataTags}`;
    installFetch({
      [submitUrl]: { ok: true, json: async () => ({ tags: ['firstName', 'orderTotal'] }) },
    });

    const res = await request(app).post('/api/merge/tags').send({ templateUrl: 'https://example.com/template.indt' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.tags, ['firstName', 'orderTotal']);
  });

  test('propagates Adobe API errors from submission with the upstream status code', async () => {
    const submitUrl = `${config.adobe.apiBaseUrl}${config.adobe.operations.createRendition}`;
    installFetch({
      [submitUrl]: { ok: false, status: 422, json: async () => ({ message: 'template not found' }) },
    });

    const res = await request(app)
      .post('/api/templates/generate')
      .send({ templateUrl: 'https://example.com/missing.indt' });

    assert.equal(res.status, 422);
    assert.equal(res.body.error, 'adobe_api_error');
  });

  test('GET /api/jobs/:id 404s for an unknown job', async () => {
    const res = await request(app).get('/api/jobs/does-not-exist');
    assert.equal(res.status, 404);
  });
});
