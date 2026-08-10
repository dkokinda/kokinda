import { config } from '../config.js';
import { getAccessToken } from './auth.js';

export class GraphApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'GraphApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Single entry point for every Graph call.
 *
 * Planner is an optimistic-concurrency API: PATCH and DELETE are rejected with
 * 412 unless an `If-Match` carrying the resource's current @odata.etag is sent,
 * and PATCH answers 204 with no body unless `Prefer: return=representation`
 * asks for the updated resource back.
 */
export async function graphRequest(path, { method = 'GET', body, etag, prefer, fetchImpl = fetch } = {}) {
  const headers = { Authorization: `Bearer ${await getAccessToken({ fetchImpl })}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (etag) headers['If-Match'] = etag;
  if (prefer) headers.Prefer = prefer;

  const res = await fetchImpl(`${config.graph.baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 204) return null;

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = json?.error?.message ? `: ${json.error.message}` : '';
    throw new GraphApiError(`Microsoft Graph ${method} ${path} failed${detail}`, res.status, json);
  }
  return json;
}

/** Follows @odata.nextLink so callers get every page, not just the first. */
export async function graphRequestAll(path, { fetchImpl = fetch } = {}) {
  const items = [];
  let next = path;

  while (next) {
    const page = await graphRequest(next, { fetchImpl });
    items.push(...(page?.value ?? []));
    const link = page?.['@odata.nextLink'];
    // nextLink is absolute; strip the base so graphRequest can re-prefix it.
    next = link ? link.replace(config.graph.baseUrl, '') : null;
  }

  return items;
}
