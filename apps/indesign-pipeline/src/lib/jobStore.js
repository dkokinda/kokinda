import { randomUUID } from 'node:crypto';

// In-memory job registry keyed by our own job id (not Adobe's). Good enough
// for a single-instance service; swap for Redis/DB-backed storage to scale
// horizontally or survive restarts.
const jobs = new Map();

export function createJob({ kind, adobeJobId }) {
  const job = {
    id: randomUUID(),
    kind,
    adobeJobId,
    status: 'pending',
    result: null,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  jobs.set(job.id, job);
  return job;
}

export function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return null;
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  return job;
}

export function getJob(id) {
  return jobs.get(id) ?? null;
}
