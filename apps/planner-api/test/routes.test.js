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
    calls.push({ method, path, headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : undefined });

    const route = routes[`${method} ${path}`];
    if (!route) throw new Error(`Unexpected fetch: ${method} ${path}`);
    return { ok: route.ok ?? true, status: route.status ?? 200, json: async () => route.body ?? {} };
  };
  globalThis.fetch.calls = calls;
  return calls;
}

describe('routes', () => {
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

  test('GET /health does not touch Graph', async () => {
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
  });

  test('GET /me reports the identity behind the token', async () => {
    installFetch({ 'GET /me': { body: { userPrincipalName: 'derek@derekandthomas.com' } } });
    const res = await request(app).get('/me');
    assert.equal(res.status, 200);
    assert.equal(res.body.userPrincipalName, 'derek@derekandthomas.com');
  });

  test('GET /api/plans lists the signed-in user\'s plans', async () => {
    installFetch({ 'GET /me/planner/plans': { body: { value: [{ id: 'plan-1', title: 'RCGC' }] } } });
    const res = await request(app).get('/api/plans');
    assert.equal(res.status, 200);
    assert.equal(res.body.value[0].title, 'RCGC');
  });

  test('GET /api/plans?groupId= scopes to a group instead', async () => {
    installFetch({ 'GET /groups/group-1/planner/plans': { body: { value: [{ id: 'plan-2' }] } } });
    const res = await request(app).get('/api/plans?groupId=group-1');
    assert.equal(res.status, 200);
    assert.equal(res.body.value[0].id, 'plan-2');
  });

  test('GET /api/plans/:planId/tasks returns the plan\'s tasks', async () => {
    installFetch({ 'GET /planner/plans/plan-1/tasks': { body: { value: [{ id: 'task-1' }] } } });
    const res = await request(app).get('/api/plans/plan-1/tasks');
    assert.equal(res.status, 200);
    assert.equal(res.body.value.length, 1);
  });

  test('POST /api/tasks creates a task and expands assignedTo', async () => {
    const calls = installFetch({ 'POST /planner/tasks': { body: { id: 'task-new' } } });

    const res = await request(app)
      .post('/api/tasks')
      .send({ planId: 'plan-1', title: 'Chase Shari reply', assignedTo: ['user-1'] });

    assert.equal(res.status, 201);
    assert.equal(res.body.id, 'task-new');
    assert.deepEqual(calls[0].body.assignments, {
      'user-1': { '@odata.type': '#microsoft.graph.plannerAssignment', orderHint: ' !' },
    });
    assert.equal(calls[0].body.assignedTo, undefined, 'assignedTo is our field, not Graph\'s');
  });

  test('POST /api/tasks rejects a body with no planId', async () => {
    const res = await request(app).post('/api/tasks').send({ title: 'orphan' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'invalid_request');
  });

  test('PATCH /api/tasks/:taskId fetches the etag then updates', async () => {
    const calls = installFetch({
      'GET /planner/tasks/task-1': { body: { id: 'task-1', '@odata.etag': 'W/"e1"' } },
      'PATCH /planner/tasks/task-1': { body: { id: 'task-1', percentComplete: 100 } },
    });

    const res = await request(app).patch('/api/tasks/task-1').send({ percentComplete: 100 });

    assert.equal(res.status, 200);
    assert.equal(calls.at(-1).headers['If-Match'], 'W/"e1"');
  });

  test('PATCH /api/tasks/:taskId rejects an empty patch', async () => {
    const res = await request(app).patch('/api/tasks/task-1').send({});
    assert.equal(res.status, 400);
  });

  test('PATCH /api/tasks/:taskId/details converts a checklist array to Planner\'s map', async () => {
    const calls = installFetch({
      'GET /planner/tasks/task-1/details': { body: { '@odata.etag': 'W/"d1"' } },
      'PATCH /planner/tasks/task-1/details': { body: { description: 'notes' } },
    });

    const res = await request(app)
      .patch('/api/tasks/task-1/details')
      .send({ description: 'notes', checklist: [{ id: 'c1', title: 'Send draft', isChecked: true }] });

    assert.equal(res.status, 200);
    assert.deepEqual(calls.at(-1).body.checklist.c1, {
      '@odata.type': 'microsoft.graph.plannerChecklistItem',
      title: 'Send draft',
      isChecked: true,
    });
  });

  test('DELETE /api/tasks/:taskId passes a caller-supplied If-Match straight through', async () => {
    const calls = installFetch({ 'DELETE /planner/tasks/task-1': { status: 204 } });

    const res = await request(app).delete('/api/tasks/task-1').set('If-Match', 'W/"e9"');

    assert.equal(res.status, 204);
    assert.equal(calls[0].headers['If-Match'], 'W/"e9"');
    assert.equal(calls.filter((c) => c.method === 'GET').length, 0);
  });

  test('propagates a Graph 412 conflict with its status and message', async () => {
    installFetch({
      'GET /planner/tasks/task-1': { body: { id: 'task-1', '@odata.etag': 'W/"stale"' } },
      'PATCH /planner/tasks/task-1': {
        ok: false,
        status: 412,
        body: { error: { message: 'The precondition specified in the request was not met.' } },
      },
    });

    const res = await request(app).patch('/api/tasks/task-1').send({ title: 'x' });

    assert.equal(res.status, 412);
    assert.equal(res.body.error, 'graph_api_error');
    assert.match(res.body.message, /precondition/);
  });

  test('propagates a Graph 403 so a missing scope is obvious', async () => {
    installFetch({
      'GET /me/planner/plans': { ok: false, status: 403, body: { error: { message: 'Insufficient privileges' } } },
    });

    const res = await request(app).get('/api/plans');

    assert.equal(res.status, 403);
    assert.match(res.body.message, /Insufficient privileges/);
  });
});
