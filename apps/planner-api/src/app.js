import express from 'express';
import { graphRequest } from './graph/client.js';
import { asyncRoute, errorHandler } from './lib/errors.js';
import { plansRouter } from './routes/plans.js';
import { tasksRouter } from './routes/tasks.js';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (req, res) => res.json({ ok: true }));

  // Cheapest way to confirm the token works and see which identity it carries.
  app.get(
    '/me',
    asyncRoute(async (req, res) => {
      res.json(await graphRequest('/me'));
    })
  );

  app.use('/api/plans', plansRouter());
  app.use('/api/tasks', tasksRouter());

  app.use(errorHandler);
  return app;
}
