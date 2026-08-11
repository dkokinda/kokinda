import { Router } from 'express';
import { graphRequest } from '../graph/client.js';
import { asyncRoute } from '../lib/errors.js';

/**
 * Every container a plan could plausibly live in. New Planner shows plans from
 * several backing stores in one list, and they are not all reachable through
 * the same Graph surface — some are not reachable through Graph at all.
 */
const PROBES = [
  { name: 'group-backed plans', path: '/me/planner/plans' },
  { name: 'roster-backed plans', path: '/me/planner/rosterPlans', beta: true },
  { name: 'plannerUser favourites/recents', path: '/me/planner?$expand=favoritePlans,recentPlans', beta: true },
  { name: 'group memberships', path: '/me/memberOf?$select=id,displayName' },
  { name: 'to-do lists', path: '/me/todo/lists' },
];

const label = (item) => item?.title ?? item?.displayName ?? item?.name ?? item?.id ?? '(unnamed)';

function summarize(body) {
  if (Array.isArray(body?.value)) {
    return { count: body.value.length, items: body.value.slice(0, 10).map(label) };
  }
  // plannerUser is a single object whose interesting parts are expanded arrays.
  const expanded = {};
  for (const key of ['favoritePlans', 'recentPlans']) {
    if (Array.isArray(body?.[key])) expanded[key] = body[key].map(label);
  }
  return Object.keys(expanded).length ? expanded : { keys: Object.keys(body ?? {}) };
}

export function diagnosticsRouter() {
  const router = Router();

  /**
   * Read-only sweep. Each probe reports independently so one failure maps to
   * one container instead of blanking the whole picture.
   */
  router.get(
    '/plan-sources',
    asyncRoute(async (req, res) => {
      const results = await Promise.all(
        PROBES.map(async ({ name, path, beta }) => {
          try {
            return { name, path, ok: true, ...summarize(await graphRequest(path, { beta })) };
          } catch (err) {
            return { name, path, ok: false, status: err.status ?? null, error: err.message };
          }
        })
      );
      res.json({ results });
    })
  );

  return router;
}
