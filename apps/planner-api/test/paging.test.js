import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { resetTokenCache, setRefreshToken } from '../src/graph/auth.js';
import { graphRequestAll } from '../src/graph/client.js';

const ORIGINAL_FETCH = globalThis.fetch;

/** Answers by exact URL, so a malformed one shows up as an unhandled request. */
function installFetch(routes) {
  const seen = [];
  globalThis.fetch = async (url) => {
    if (String(url) === `${config.graph.authorityHost}/${config.graph.tenantId}/oauth2/v2.0/token`) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: 'tok', expires_in: 3600 }) };
    }
    seen.push(String(url));
    const route = routes[String(url)];
    if (!route) throw new Error(`Unexpected fetch: ${url}`);
    return { ok: true, status: 200, json: async () => route };
  };
  globalThis.fetch.seen = seen;
  return seen;
}

describe('paging', () => {
  const REAL_BASE = config.graph.baseUrl;

  beforeEach(() => {
    config.graph.baseUrl = REAL_BASE;
    resetTokenCache();
    config.graph.clientId = 'test-client-id';
    config.graph.authMode = 'device_code';
    setRefreshToken('rt');
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    config.graph.baseUrl = REAL_BASE;
  });

  test('follows a nextLink that shares the configured base', async () => {
    const seen = installFetch({
      [`${config.graph.baseUrl}/planner/plans/p1/tasks`]: {
        value: [{ id: 'a' }],
        '@odata.nextLink': `${config.graph.baseUrl}/planner/plans/p1/tasks?$skiptoken=2`,
      },
      [`${config.graph.baseUrl}/planner/plans/p1/tasks?$skiptoken=2`]: { value: [{ id: 'b' }] },
    });

    const items = await graphRequestAll('/planner/plans/p1/tasks');

    assert.deepEqual(items.map((i) => i.id), ['a', 'b']);
    assert.equal(seen.length, 2);
  });

  test('follows a nextLink that does not start with the configured base', async () => {
    // The old code stripped the base by string replace and let graphRequest
    // prefix it again. When the paging link lives somewhere else entirely — a
    // national cloud, or any custom GRAPH_BASE_URL — the replace did nothing
    // and the base was prepended to a full URL, fetching a nonsense address.
    config.graph.baseUrl = 'https://graph.example.test/v1.0';
    const elsewhere = 'https://graph.microsoft.com/v1.0/planner/plans/p1/tasks?$skiptoken=2';
    const seen = installFetch({
      'https://graph.example.test/v1.0/planner/plans/p1/tasks': {
        value: [{ id: 'a' }],
        '@odata.nextLink': elsewhere,
      },
      [elsewhere]: { value: [{ id: 'b' }] },
    });

    const items = await graphRequestAll('/planner/plans/p1/tasks');

    assert.deepEqual(items.map((i) => i.id), ['a', 'b']);
    assert.equal(seen[1], elsewhere, 'the paging link must be requested verbatim');
  });

  test('does not mangle a nextLink that contains the base further along', async () => {
    // replace() rewrites the first match anywhere, not just a prefix.
    config.graph.baseUrl = 'https://graph.example.test/v1.0';
    const tricky = 'https://gateway.example.test/proxy?to=https://graph.example.test/v1.0/planner/plans/p1/tasks';
    const seen = installFetch({
      'https://graph.example.test/v1.0/planner/plans/p1/tasks': { value: [], '@odata.nextLink': tricky },
      [tricky]: { value: [{ id: 'z' }] },
    });

    const items = await graphRequestAll('/planner/plans/p1/tasks');

    assert.deepEqual(items.map((i) => i.id), ['z']);
    assert.equal(seen[1], tricky);
  });

  test('a beta listing pages against beta, not v1.0', async () => {
    const seen = installFetch({
      [`${config.graph.betaUrl}/me/planner/rosterPlans`]: {
        value: [{ id: 'r1' }],
        '@odata.nextLink': `${config.graph.betaUrl}/me/planner/rosterPlans?$skiptoken=2`,
      },
      [`${config.graph.betaUrl}/me/planner/rosterPlans?$skiptoken=2`]: { value: [{ id: 'r2' }] },
    });

    const items = await graphRequestAll('/me/planner/rosterPlans', { beta: true });

    assert.deepEqual(items.map((i) => i.id), ['r1', 'r2']);
    assert.ok(seen.every((u) => u.startsWith(config.graph.betaUrl)));
  });
});
