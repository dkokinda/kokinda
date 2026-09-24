import { Router } from 'express';
import {
  getPlan,
  listBuckets,
  listGroupPlans,
  listMyPlans,
  listMyReferencedPlans,
  listMyRosterPlans,
  listPlanTasks,
} from '../graph/planner.js';
import { asyncRoute } from '../lib/errors.js';

export function plansRouter() {
  const router = Router();

  // ?groupId= scopes to one Microsoft 365 group. Without it we ask for the
  // signed-in user's plans, which app-only tokens cannot do (there is no "me").
  router.get(
    '/',
    asyncRoute(async (req, res) => {
      const { groupId } = req.query;
      if (groupId) return res.json({ value: await listGroupPlans(groupId) });

      const warnings = [];

      /** A discovery source that must never take the others down with it. */
      const optional = (label, promise) =>
        promise.catch((err) => {
          console.warn(`[plans] ${label} lookup failed: ${err.message}`);
          warnings.push(`${label} could not be listed — ${err.message}`);
          return [];
        });

      const [group, roster, referenced] = await Promise.all([
        listMyPlans(),
        // Roster-backed plans are beta-only, so treat the endpoint as optional:
        // losing them is better than losing the group-backed plans as well if
        // beta is unavailable in this tenant. Report the reason though — a
        // swallowed failure here is indistinguishable from having no shared
        // plans, which sends you looking in entirely the wrong place.
        optional('Shared (roster-backed) plans', listMyRosterPlans()),
        // Favourites and recents can name a plan neither container lists.
        optional('Favourite/recent plans', listMyReferencedPlans()),
      ]);

      const byId = new Map([...group, ...roster, ...referenced].map((plan) => [plan.id, plan]));
      res.json({
        value: [...byId.values()],
        counts: { group: group.length, roster: roster.length, referenced: referenced.length },
        warnings,
      });
    })
  );

  router.get(
    '/:planId',
    asyncRoute(async (req, res) => {
      res.json(await getPlan(req.params.planId));
    })
  );

  router.get(
    '/:planId/buckets',
    asyncRoute(async (req, res) => {
      res.json({ value: await listBuckets(req.params.planId) });
    })
  );

  router.get(
    '/:planId/tasks',
    asyncRoute(async (req, res) => {
      res.json({ value: await listPlanTasks(req.params.planId) });
    })
  );

  return router;
}
