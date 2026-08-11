import { Router } from 'express';
import {
  getPlan,
  listBuckets,
  listGroupPlans,
  listMyPlans,
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
      const [group, roster] = await Promise.all([
        listMyPlans(),
        // Roster-backed plans are beta-only, so treat the endpoint as optional:
        // losing them is better than losing the group-backed plans as well if
        // beta is unavailable in this tenant. Report the reason though — a
        // swallowed failure here is indistinguishable from having no shared
        // plans, which sends you looking in entirely the wrong place.
        listMyRosterPlans().catch((err) => {
          console.warn(`[plans] rosterPlans lookup failed: ${err.message}`);
          warnings.push(`Shared (roster-backed) plans could not be listed — ${err.message}`);
          return [];
        }),
      ]);

      const byId = new Map([...group, ...roster].map((plan) => [plan.id, plan]));
      res.json({
        value: [...byId.values()],
        counts: { group: group.length, roster: roster.length },
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
