import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { graphRequest } from './graph/client.js';
import { asyncRoute, errorHandler } from './lib/errors.js';
import { boardRouter } from './routes/board.js';
import { plansRouter } from './routes/plans.js';
import { tasksRouter } from './routes/tasks.js';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

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
  app.use('/api/board', boardRouter());

  // The tracker UI is served from this same origin on purpose: a page hosted
  // anywhere else cannot call this API from a browser, so its buttons would be
  // decoration. Same origin means they issue real writes.
  app.use(express.static(publicDir));

  app.use(errorHandler);
  return app;
}
