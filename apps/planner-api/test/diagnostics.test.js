import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { resetTokenCache, setRefreshToken } from '../src/graph/auth.js';

const ORIGINAL_FETCH = globalThis.fetch;

function installFetch(routes) {
  globalThis.fetch = async (url, init = {}) => {
    if (url === `${config.graph.authorityHost}/${config.graph.tenantId}/oauth2/v2.0/token`) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'tok', expires_in: 3600 }) };
    }
    const route = routes[String(url)];
    if (!route) return { ok: false, status: 404, json: async () => ({ error: { message: 'no route' } }) };
    return { ok: route.ok ?? true, status: route.status ?? 200, json: async () => route.body ?? {} };
  };
}

const V1 = () => config.graph.baseUrl;
const BETA = () => config.graph.betaUrl;

describe('GET /api/diagnostics/plan-sources', () => {
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

  test('reports each container separately, naming what it found', async () => {
    installFetch({
      [`${V1()}/me/planner/plans`]: { body: { value: [] } },
      [`${BETA()}/me/planner/rosterPlans`]: { body: { value: [{ id: 'r1', title: 'RCGC Marketing' }] } },
      [`${BETA()}/me/planner?$expand=favoritePlans,recentPlans`]: {
        body: { favoritePlans: [], recentPlans: [{ id: 'r1', title: 'RCGC Marketing' }] },
      },
      [`${V1()}/me/memberOf?$select=id,displayName`]: { body: { value: [{ id: 'g1', displayName: 'Marketing' }] } },
      [`${V1()}/me/todo/lists`]: { body: { value: [{ id: 'l1', displayName: 'Tasks' }] } },
    });

    const res = await request(app).get('/api/diagnostics/plan-sources');
    const byName = Object.fromEntries(res.body.results.map((r) => [r.name, r]));

    assert.equal(res.status, 200);
    assert.equal(byName['group-backed plans'].count, 0);
    assert.deepEqual(byName['roster-backed plans'].items, ['RCGC Marketing']);
    assert.deepEqual(byName['plannerUser favourites/recents'].recentPlans, ['RCGC Marketing']);
    assert.deepEqual(byName['group memberships'].items, ['Marketing']);
    assert.deepEqual(byName['to-do lists'].items, ['Tasks']);
  });

  test('one failing probe does not take down the others', async () => {
    installFetch({
      [`${V1()}/me/planner/plans`]: { body: { value: [{ id: 'g1', title: 'Kept' }] } },
      [`${BETA()}/me/planner/rosterPlans`]: { ok: false, status: 403, body: { error: { message: 'Insufficient privileges' } } },
    });

    const res = await request(app).get('/api/diagnostics/plan-sources');
    const byName = Object.fromEntries(res.body.results.map((r) => [r.name, r]));

    assert.equal(res.status, 200);
    assert.deepEqual(byName['group-backed plans'].items, ['Kept']);
    assert.equal(byName['roster-backed plans'].ok, false);
    assert.equal(byName['roster-backed plans'].status, 403);
    assert.match(byName['roster-backed plans'].error, /Insufficient privileges/);
  });
});
