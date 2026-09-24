import { submitOperation } from '../adobe/client.js';
import { waitForJob } from './jobPoller.js';
import { createJob, updateJob } from './jobStore.js';

/**
 * Submits an Adobe InDesign API operation, registers a local job to track
 * it, and polls Adobe for completion in the background. Returns immediately
 * with the local (pending) job so routes can respond 202 without blocking
 * on the full render/merge/convert.
 */
export async function runOperation({ kind, path, payload, submit = submitOperation, wait = waitForJob }) {
  const submission = await submit(path, payload);
  const adobeJobId = submission.jobId ?? submission.id ?? submission.job?.id;
  if (!adobeJobId) {
    throw new Error(`Adobe API response for ${path} did not include a job identifier`);
  }

  const job = createJob({ kind, adobeJobId });

  wait(adobeJobId)
    .then((result) => updateJob(job.id, { status: 'succeeded', result }))
    .catch((err) => updateJob(job.id, { status: 'failed', error: err.message }));

  return job;
}
