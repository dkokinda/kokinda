import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { resetTokenCache, setRefreshToken } from '../src/graph/auth.js';

const ORIGINAL_FETCH = globalThis.fetch;

/** Routes are keyed by the full URL so v1.0 and beta stay distinguishable. */
function installFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    if (url === `${config.graph.authorityHost}/${config.graph.tenantId}/oauth2/v2.0/token`) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'tok', expires_in: 3600 }) };
    }
    calls.push(String(url));
    const route = routes[String(url)];
    if (!route) throw new Error(`Unexpected fetch: ${url}`);
    return { ok: route.ok ?? true, status: route.status ?? 200, json: async () => route.body ?? {} };
  };
  globalThis.fetch.calls = calls;
  return calls;
}

const V1 = () => config.graph.baseUrl;
const BETA = () => config.graph.betaUrl;

describe('plan discovery across both containers', () => {
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

  test('returns roster-backed plans that /me/planner/plans cannot see', async () => {
    installFetch({
      [`${V1()}/me/planner/plans`]: { body: { value: [] } },
      [`${BETA()}/me/planner/rosterPlans`]: { body: { value: [{ id: 'r1', title: 'RCGC Marketing — Derek' }] } },
    });

    const res = await request(app).get('/api/plans');

    assert.equal(res.status, 200);
    assert.equal(res.body.value.length, 1);
    assert.equal(res.body.value[0].title, 'RCGC Marketing — Derek');
  });

  test('queries rosterPlans against the beta host, not v1.0', async () => {
    const calls = installFetch({
      [`${V1()}/me/planner/plans`]: { body: { value: [] } },
      [`${BETA()}/me/planner/rosterPlans`]: { body: { value: [] } },
    });

    await request(app).get('/api/plans');

    assert.ok(calls.includes(`${BETA()}/me/planner/rosterPlans`), 'rosterPlans must go to /beta');
  });

  test('merges both containers and de-duplicates a plan present in each', async () => {
    installFetch({
      [`${V1()}/me/planner/plans`]: { body: { value: [{ id: 'g1', title: 'Group plan' }, { id: 'dup', title: 'Both' }] } },
      [`${BETA()}/me/planner/rosterPlans`]: { body: { value: [{ id: 'dup', title: 'Both' }, { id: 'r1', title: 'Roster plan' }] } },
    });

    const res = await request(app).get('/api/plans');

    assert.deepEqual(res.body.value.map((p) => p.id).sort(), ['dup', 'g1', 'r1']);
  });

  test('still returns group plans when the beta endpoint is unavailable', async () => {
    installFetch({
      [`${V1()}/me/planner/plans`]: { body: { value: [{ id: 'g1', title: 'Group plan' }] } },
      [`${BETA()}/me/planner/rosterPlans`]: { ok: false, status: 404, body: { error: { message: 'not found' } } },
    });

    const res = await request(app).get('/api/plans');

    assert.equal(res.status, 200);
    assert.equal(res.body.value[0].id, 'g1');
  });

  test('propagates a failure of the group endpoint rather than silently emptying', async () => {
    installFetch({
      [`${V1()}/me/planner/plans`]: { ok: false, status: 403, body: { error: { message: 'Insufficient privileges' } } },
      [`${BETA()}/me/planner/rosterPlans`]: { body: { value: [] } },
    });

    const res = await request(app).get('/api/plans');

    assert.equal(res.status, 403);
    assert.match(res.body.message, /Insufficient privileges/);
  });

  test('?groupId= still scopes to that group alone and skips discovery', async () => {
    const calls = installFetch({
      [`${V1()}/groups/group-1/planner/plans`]: { body: { value: [{ id: 'p2' }] } },
    });

    const res = await request(app).get('/api/plans?groupId=group-1');

    assert.equal(res.body.value[0].id, 'p2');
    assert.equal(calls.some((c) => c.includes('rosterPlans')), false);
  });
});
