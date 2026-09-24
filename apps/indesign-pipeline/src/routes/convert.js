import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { assetEntry } from '../lib/assets.js';
import { runOperation } from '../lib/pipeline.js';

const schema = z.object({
  pdfUrl: z.string().url(),
  options: z.record(z.string(), z.any()).optional().default({}),
});

export function convertRouter() {
  const router = Router();

  router.post('/pdf-to-indd', async (req, res, next) => {
    try {
      const input = schema.parse(req.body);
      const source = assetEntry(input.pdfUrl, 'source');

      const payload = {
        assets: [source],
        params: { source: source.destination, ...input.options },
      };

      const job = await runOperation({ kind: 'convert', path: config.adobe.operations.convertPdfToIndd, payload });
      res.status(202).json({ jobId: job.id, status: job.status, statusUrl: `/api/jobs/${job.id}` });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
