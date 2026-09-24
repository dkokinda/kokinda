import { Router } from 'express';
import { getPlan, getTaskDetails, listBuckets, listPlanTasks } from '../graph/planner.js';
import { asyncRoute } from '../lib/errors.js';

/** Bounded parallelism, so a 200-task plan doesn't open 200 sockets at once. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export function boardRouter() {
  const router = Router();

  /**
   * Everything the tracker UI needs in one round trip: the plan, its buckets
   * (categories) and its tasks. Notes live on a separate Planner resource, so
   * ?includeDetails=true pulls those too rather than making the page issue a
   * request per row.
   */
  router.get(
    '/:planId',
    asyncRoute(async (req, res) => {
      const { planId } = req.params;
      const [plan, buckets, tasks] = await Promise.all([
        getPlan(planId),
        listBuckets(planId),
        listPlanTasks(planId),
      ]);

      let details = {};
      if (req.query.includeDetails === 'true') {
        const fetched = await mapLimit(tasks, 8, async (task) => {
          try {
            return [task.id, await getTaskDetails(task.id)];
          } catch {
            // One unreadable task shouldn't blank the whole board.
            return [task.id, null];
          }
        });
        details = Object.fromEntries(fetched);
      }

      res.json({ plan, buckets, tasks, details });
    })
  );

  return router;
}
