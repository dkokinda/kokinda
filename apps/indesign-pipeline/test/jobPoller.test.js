import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { waitForJob } from '../src/lib/jobPoller.js';

describe('waitForJob', () => {
  test('resolves once poll reports a terminal success status', async () => {
    let calls = 0;
    const poll = async () => {
      calls += 1;
      return calls < 3 ? { status: 'running' } : { status: 'succeeded', output: 'ok' };
    };
    const sleeps = [];
    const sleep = async (ms) => {
      sleeps.push(ms);
    };

    const result = await waitForJob('job-1', { poll, sleep, intervalMs: 5, timeoutMs: 1000 });

    assert.equal(result.status, 'succeeded');
    assert.equal(calls, 3);
    assert.deepEqual(sleeps, [5, 5]);
  });

  test('throws when poll reports a terminal failure status', async () => {
    const poll = async () => ({ status: 'failed', error: 'boom' });
    await assert.rejects(
      () => waitForJob('job-2', { poll, sleep: async () => {}, intervalMs: 5, timeoutMs: 1000 }),
      /boom/
    );
  });

  test('throws a timeout error once the deadline passes', async () => {
    let now = 0;
    const realNow = Date.now;
    Date.now = () => now;
    try {
      const poll = async () => ({ status: 'running' });
      const sleep = async () => {
        now += 50;
      };
      await assert.rejects(
        () => waitForJob('job-3', { poll, sleep, intervalMs: 5, timeoutMs: 40 }),
        /Timed out waiting for Adobe job job-3/
      );
    } finally {
      Date.now = realNow;
    }
  });
});
