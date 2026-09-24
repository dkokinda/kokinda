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
export async function graphRequest(path, { method = 'GET', body, etag, prefer, beta = false, fetchImpl = fetch } = {}) {
  const headers = { Authorization: `Bearer ${await getAccessToken({ fetchImpl })}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (etag) headers['If-Match'] = etag;
  if (prefer) headers.Prefer = prefer;

  // `path` is normally relative, but a paging link arrives absolute — pass
  // those through untouched rather than prefixing a base onto a full URL.
  const url = /^https?:\/\//i.test(path)
    ? path
    : `${beta ? config.graph.betaUrl : config.graph.baseUrl}${path}`;

  const res = await fetchImpl(url, {
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
export async function graphRequestAll(path, { beta = false, fetchImpl = fetch } = {}) {
  const items = [];
  let next = path;

  while (next) {
    const page = await graphRequest(next, { beta, fetchImpl });
    items.push(...(page?.value ?? []));
    // Hand the paging link on as-is. It was previously rewritten with
    // `replace(base, '')`, which silently did nothing when the link did not
    // start with the configured base — producing a doubled-up URL — and would
    // have mangled a link that merely contained the base inside a query
    // parameter. graphRequest accepts an absolute URL, so no rewriting is
    // needed at all.
    next = page?.['@odata.nextLink'] ?? null;
  }

  return items;
}
