import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { assetEntry } from '../lib/assets.js';
import { runOperation } from '../lib/pipeline.js';

// Generates a single rendered document (PDF/JPEG/PNG/INDD) from an InDesign
// template, optionally filling merge fields with static values.
const schema = z.object({
  templateUrl: z.string().url(),
  fields: z.record(z.string(), z.any()).optional().default({}),
  format: z.enum(['pdf', 'jpeg', 'png', 'indd']).optional().default('pdf'),
  fonts: z.array(z.string().url()).optional().default([]),
});

export function generateRouter() {
  const router = Router();

  router.post('/', async (req, res, next) => {
    try {
      const input = schema.parse(req.body);
      const template = assetEntry(input.templateUrl, 'template');
      const fonts = input.fonts.map((url, i) => assetEntry(url, `font-${i}`));

      const payload = {
        assets: [template, ...fonts],
        params: {
          template: template.destination,
          fields: input.fields,
          outputFormat: input.format,
        },
      };

      const job = await runOperation({ kind: 'generate', path: config.adobe.operations.createRendition, payload });
      res.status(202).json({ jobId: job.id, status: job.status, statusUrl: `/api/jobs/${job.id}` });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
