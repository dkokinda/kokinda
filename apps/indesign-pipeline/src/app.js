import express from 'express';
import { convertRouter } from './routes/convert.js';
import { generateRouter } from './routes/generate.js';
import { jobsRouter } from './routes/jobs.js';
import { mergeRouter } from './routes/merge.js';
import { errorHandler } from './lib/errors.js';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (req, res) => res.json({ ok: true }));

  app.use('/api/templates/generate', generateRouter());
  app.use('/api/convert', convertRouter());
  app.use('/api/merge', mergeRouter());
  app.use('/api/jobs', jobsRouter());

  app.use(errorHandler);
  return app;
}
