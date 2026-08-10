import { Router } from 'express';
import { getPlan, listBuckets, listGroupPlans, listMyPlans, listPlanTasks } from '../graph/planner.js';
import { asyncRoute } from '../lib/errors.js';

export function plansRouter() {
  const router = Router();

  // ?groupId= scopes to one Microsoft 365 group. Without it we ask for the
  // signed-in user's plans, which app-only tokens cannot do (there is no "me").
  router.get(
    '/',
    asyncRoute(async (req, res) => {
      const { groupId } = req.query;
      const plans = groupId ? await listGroupPlans(groupId) : await listMyPlans();
      res.json({ value: plans });
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
