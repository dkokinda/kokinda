import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { resetTokenCache, setRefreshToken } from '../src/graph/auth.js';

const ORIGINAL_FETCH = globalThis.fetch;

function installFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    if (url === `${config.graph.authorityHost}/${config.graph.tenantId}/oauth2/v2.0/token`) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'tok', expires_in: 3600 }) };
    }
    const method = init.method ?? 'GET';
    const path = url.replace(config.graph.baseUrl, '');
    calls.push({ method, path });
    const route = routes[`${method} ${path}`];
    if (!route) throw new Error(`Unexpected fetch: ${method} ${path}`);
    return { ok: route.ok ?? true, status: route.status ?? 200, json: async () => route.body ?? {} };
  };
  globalThis.fetch.calls = calls;
  return calls;
}

const BOARD_ROUTES = {
  'GET /planner/plans/plan-1': { body: { id: 'plan-1', title: 'RCGC' } },
  'GET /planner/plans/plan-1/buckets': { body: { value: [{ id: 'b1', name: 'Membership' }] } },
  'GET /planner/plans/plan-1/tasks': {
    body: { value: [{ id: 't1', title: 'Renew insurance', bucketId: 'b1', percentComplete: 50 }] },
  },
};

describe('GET /api/board/:planId', () => {
  let app;

  beforeEach(() => {
    resetTokenCache();
    config.graph.clientId = 'test-client-id';
    config.graph.authMode = 'device_code';
    setRefreshToken('rt');
    app = createApp();
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
  });

  test('returns plan, buckets and tasks in one response', async () => {
    installFetch(BOARD_ROUTES);

    const res = await request(app).get('/api/board/plan-1');

    assert.equal(res.status, 200);
    assert.equal(res.body.plan.title, 'RCGC');
    assert.equal(res.body.buckets[0].name, 'Membership');
    assert.equal(res.body.tasks[0].id, 't1');
  });

  test('skips the per-task details fetch unless asked for it', async () => {
    const calls = installFetch(BOARD_ROUTES);

    const res = await request(app).get('/api/board/plan-1');

    assert.deepEqual(res.body.details, {});
    assert.equal(calls.some((c) => c.path.endsWith('/details')), false);
  });

  test('includes notes keyed by task id when includeDetails=true', async () => {
    installFetch({
      ...BOARD_ROUTES,
      'GET /planner/tasks/t1/details': { body: { description: '[2026-08-10] chased broker' } },
    });

    const res = await request(app).get('/api/board/plan-1?includeDetails=true');

    assert.equal(res.body.details.t1.description, '[2026-08-10] chased broker');
  });

  test('nulls one unreadable task\'s details rather than failing the whole board', async () => {
    installFetch({
      ...BOARD_ROUTES,
      'GET /planner/tasks/t1/details': { ok: false, status: 403, body: { error: { message: 'nope' } } },
    });

    const res = await request(app).get('/api/board/plan-1?includeDetails=true');

    assert.equal(res.status, 200);
    assert.equal(res.body.details.t1, null);
    assert.equal(res.body.tasks.length, 1);
  });

  test('propagates a failure to load the plan itself', async () => {
    installFetch({
      'GET /planner/plans/plan-x': { ok: false, status: 404, body: { error: { message: 'not found' } } },
      'GET /planner/plans/plan-x/buckets': { body: { value: [] } },
      'GET /planner/plans/plan-x/tasks': { body: { value: [] } },
    });

    const res = await request(app).get('/api/board/plan-x');

    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'graph_api_error');
  });
});

describe('static UI', () => {
  let app;

  beforeEach(() => {
    app = createApp();
  });

  test('serves the tracker page from the same origin as the API', async () => {
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.text, /Project tracker/);
  });
});
