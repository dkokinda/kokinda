import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { resetTokenCache, setRefreshToken } from '../src/graph/auth.js';
import { graphRequestAll } from '../src/graph/client.js';
import { buildAssignments, buildChecklist, deleteTask, listPlanTasks, updateTask } from '../src/graph/planner.js';

const ORIGINAL_FETCH = globalThis.fetch;

/** Records every Graph call and answers from a { "METHOD /path": response } map. */
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

describe('planner payload shaping', () => {
  test('expands assignedTo into Planner\'s keyed assignment map', () => {
    assert.deepEqual(buildAssignments(['user-1']), {
      'user-1': { '@odata.type': '#microsoft.graph.plannerAssignment', orderHint: ' !' },
    });
  });

  test('expands a checklist array into a keyed map, defaulting isChecked', () => {
    const checklist = buildChecklist([{ id: 'item-1', title: 'Call back' }]);
    assert.deepEqual(checklist['item-1'], {
      '@odata.type': 'microsoft.graph.plannerChecklistItem',
      title: 'Call back',
      isChecked: false,
    });
  });

  test('generates unique keys when checklist items have no id', () => {
    const checklist = buildChecklist([{ title: 'a' }, { title: 'b' }]);
    assert.equal(Object.keys(checklist).length, 2);
  });
});

describe('optimistic concurrency', () => {
  beforeEach(() => {
    resetTokenCache();
    config.graph.clientId = 'test-client-id';
    config.graph.authMode = 'device_code';
    setRefreshToken('rt');
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
  });

  test('reads the current etag and sends it as If-Match when none is supplied', async () => {
    const calls = installFetch({
      'GET /planner/tasks/task-1': { body: { id: 'task-1', '@odata.etag': 'W/"etag-1"' } },
      'PATCH /planner/tasks/task-1': { body: { id: 'task-1', percentComplete: 50 } },
    });

    await updateTask('task-1', { percentComplete: 50 });

    const patch = calls.find((c) => c.method === 'PATCH');
    assert.equal(patch.headers['If-Match'], 'W/"etag-1"');
    assert.equal(patch.headers.Prefer, 'return=representation', 'needed or Graph answers 204 with no body');
  });

  test('skips the extra read when the caller already knows the etag', async () => {
    const calls = installFetch({
      'PATCH /planner/tasks/task-1': { body: { id: 'task-1' } },
    });

    await updateTask('task-1', { title: 'Renamed' }, { etag: 'W/"caller-etag"' });

    assert.equal(calls.filter((c) => c.method === 'GET').length, 0);
    assert.equal(calls[0].headers['If-Match'], 'W/"caller-etag"');
  });

  test('sends If-Match on delete too', async () => {
    const calls = installFetch({
      'GET /planner/tasks/task-2': { body: { id: 'task-2', '@odata.etag': 'W/"etag-2"' } },
      'DELETE /planner/tasks/task-2': { status: 204 },
    });

    await deleteTask('task-2');

    assert.equal(calls.find((c) => c.method === 'DELETE').headers['If-Match'], 'W/"etag-2"');
  });

  test('refuses to update when Graph returns a resource with no etag', async () => {
    installFetch({ 'GET /planner/tasks/task-3': { body: { id: 'task-3' } } });

    await assert.rejects(() => updateTask('task-3', { title: 'x' }), /no @odata.etag/);
  });
});

describe('pagination', () => {
  beforeEach(() => {
    resetTokenCache();
    config.graph.clientId = 'test-client-id';
    config.graph.authMode = 'device_code';
    setRefreshToken('rt');
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
  });

  test('follows @odata.nextLink so callers see every task', async () => {
    installFetch({
      'GET /planner/plans/plan-1/tasks': {
        body: {
          value: [{ id: 'a' }],
          '@odata.nextLink': `${config.graph.baseUrl}/planner/plans/plan-1/tasks?$skiptoken=2`,
        },
      },
      'GET /planner/plans/plan-1/tasks?$skiptoken=2': { body: { value: [{ id: 'b' }] } },
    });

    const tasks = await listPlanTasks('plan-1');

    assert.deepEqual(tasks.map((t) => t.id), ['a', 'b']);
  });

  test('returns an empty list rather than throwing when a collection is empty', async () => {
    installFetch({ 'GET /me/planner/plans': { body: { value: [] } } });
    assert.deepEqual(await graphRequestAll('/me/planner/plans'), []);
  });
});
