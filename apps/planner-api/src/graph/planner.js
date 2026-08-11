import { randomUUID } from 'node:crypto';
import { graphRequest, graphRequestAll } from './client.js';

/**
 * Planner's assignment map is keyed by user id with a typed value. Callers of
 * this API pass a plain `assignedTo: [userId]` array and we expand it here.
 */
export function buildAssignments(userIds = []) {
  return Object.fromEntries(
    userIds.map((userId) => [userId, { '@odata.type': '#microsoft.graph.plannerAssignment', orderHint: ' !' }])
  );
}

/**
 * Same shape story for checklists: a keyed map of typed items rather than a
 * list. Keys are arbitrary GUIDs; Planner only requires that they are unique.
 */
export function buildChecklist(items = []) {
  return Object.fromEntries(
    items.map((item) => [
      item.id ?? randomUUID(),
      {
        '@odata.type': 'microsoft.graph.plannerChecklistItem',
        title: item.title,
        isChecked: item.isChecked ?? false,
      },
    ])
  );
}

export const listMyPlans = (opts) => graphRequestAll('/me/planner/plans', opts);

/**
 * Plans backed by a plannerRoster rather than a Microsoft 365 group — what new
 * Planner labels "Shared" plans. They do not appear in /me/planner/plans at
 * all, and the only way to enumerate them is this beta-only endpoint.
 */
export const listMyRosterPlans = (opts) => graphRequestAll('/me/planner/rosterPlans', { ...opts, beta: true });
export const listGroupPlans = (groupId, opts) => graphRequestAll(`/groups/${groupId}/planner/plans`, opts);
export const listMyTasks = (opts) => graphRequestAll('/me/planner/tasks', opts);

export const getPlan = (planId, opts) => graphRequest(`/planner/plans/${planId}`, opts);
export const listBuckets = (planId, opts) => graphRequestAll(`/planner/plans/${planId}/buckets`, opts);
export const listPlanTasks = (planId, opts) => graphRequestAll(`/planner/plans/${planId}/tasks`, opts);

export const getTask = (taskId, opts) => graphRequest(`/planner/tasks/${taskId}`, opts);
export const getTaskDetails = (taskId, opts) => graphRequest(`/planner/tasks/${taskId}/details`, opts);

export const createTask = (payload, opts) =>
  graphRequest('/planner/tasks', { ...opts, method: 'POST', body: payload });

/**
 * Reads the current etag for a Planner resource. Update and delete both need
 * one, and making the caller supply it would leak Graph's concurrency model
 * into every consumer of this API.
 */
async function currentEtag(path, opts) {
  const resource = await graphRequest(path, opts);
  const etag = resource?.['@odata.etag'];
  if (!etag) {
    throw new Error(`Graph returned no @odata.etag for ${path}; cannot safely update it.`);
  }
  return etag;
}

async function patchWithEtag(path, patch, { etag, ...opts } = {}) {
  const ifMatch = etag ?? (await currentEtag(path, opts));
  return graphRequest(path, {
    ...opts,
    method: 'PATCH',
    body: patch,
    etag: ifMatch,
    // Without this Graph answers 204 and the caller gets nothing back.
    prefer: 'return=representation',
  });
}

export const updateTask = (taskId, patch, opts) => patchWithEtag(`/planner/tasks/${taskId}`, patch, opts);

export const updateTaskDetails = (taskId, patch, opts) =>
  patchWithEtag(`/planner/tasks/${taskId}/details`, patch, opts);

export async function deleteTask(taskId, { etag, ...opts } = {}) {
  const path = `/planner/tasks/${taskId}`;
  const ifMatch = etag ?? (await currentEtag(path, opts));
  return graphRequest(path, { ...opts, method: 'DELETE', etag: ifMatch });
}
