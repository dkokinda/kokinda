import { config } from '../config.js';
import { getJobStatus } from '../adobe/client.js';

const TERMINAL_SUCCESS = new Set(['succeeded', 'success', 'completed', 'done']);
const TERMINAL_FAILURE = new Set(['failed', 'error', 'cancelled', 'canceled']);

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Polls an Adobe InDesign API job until it reaches a terminal state.
 * `poll` and `sleep` are injectable so this can be unit tested without a
 * live API or real timers.
 */
export async function waitForJob(
  jobId,
  {
    intervalMs = config.jobPoll.intervalMs,
    timeoutMs = config.jobPoll.timeoutMs,
    sleep = defaultSleep,
    poll = getJobStatus,
  } = {}
) {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const status = await poll(jobId);
    const normalized = String(status.status ?? status.state ?? '').toLowerCase();

    if (TERMINAL_SUCCESS.has(normalized)) {
      return status;
    }
    if (TERMINAL_FAILURE.has(normalized)) {
      const err = new Error(`Adobe job ${jobId} failed: ${status.error ?? status.message ?? normalized}`);
      err.jobStatus = status;
      throw err;
    }
    if (Date.now() >= deadline) {
      const err = new Error(`Timed out waiting for Adobe job ${jobId} to complete`);
      err.jobStatus = status;
      throw err;
    }

    await sleep(intervalMs);
  }
}
