import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { submitOperation } from '../adobe/client.js';
import { assetEntry } from '../lib/assets.js';
import { runOperation } from '../lib/pipeline.js';

const tagsSchema = z.object({
  templateUrl: z.string().url(),
});

// Bulk data merge: one InDesign template + a CSV/JSON dataset -> N rendered
// documents. `mode` selects Adobe's layout-based vs. vector-based merge
// engine (document_merge_data_layout / document_merge_data_vector).
const mergeSchema = z.object({
  templateUrl: z.string().url(),
  dataUrl: z.string().url(),
  mode: z.enum(['layout', 'vector']).optional().default('layout'),
  format: z.enum(['pdf', 'indd', 'jpeg', 'png']).optional().default('pdf'),
});

export function mergeRouter() {
  const router = Router();

  // Lists the merge fields ({{firstName}}, {{orderTotal}}, ...) present in
  // a template, so a caller can validate/build its data file up front.
  router.post('/tags', async (req, res, next) => {
    try {
      const input = tagsSchema.parse(req.body);
      const template = assetEntry(input.templateUrl, 'template');
      const payload = { assets: [template], params: { template: template.destination } };
      const result = await submitOperation(config.adobe.operations.mergeDataTags, payload);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const input = mergeSchema.parse(req.body);
      const template = assetEntry(input.templateUrl, 'template');
      const data = assetEntry(input.dataUrl, 'data');

      const payload = {
        assets: [template, data],
        params: {
          template: template.destination,
          data: data.destination,
          mode: input.mode,
          outputFormat: input.format,
        },
      };

      const job = await runOperation({ kind: 'merge', path: config.adobe.operations.mergeData, payload });
      res.status(202).json({ jobId: job.id, status: job.status, statusUrl: `/api/jobs/${job.id}` });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
