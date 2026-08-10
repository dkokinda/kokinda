import { Router } from 'express';
import { getJob } from '../lib/jobStore.js';

export function jobsRouter() {
  const router = Router();

  router.get('/:id', (req, res) => {
    const job = getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'not_found', message: `No job with id ${req.params.id}` });
    }
    return res.json(job);
  });

  return router;
}
