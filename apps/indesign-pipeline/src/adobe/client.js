import { config } from '../config.js';
import { getAccessToken } from './auth.js';

export class AdobeApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'AdobeApiError';
    this.status = status;
    this.body = body;
  }
}

async function authHeaders(fetchImpl) {
  const token = await getAccessToken({ fetchImpl });
  return {
    Authorization: `Bearer ${token}`,
    'x-api-key': config.adobe.clientId,
    'x-gw-ims-org-id': config.adobe.orgId,
    'Content-Type': 'application/json',
  };
}

/**
 * Submits an async InDesign API operation (rendition, merge, conversion, ...).
 * Adobe's InDesign API operations are asynchronous: this call kicks off the
 * job and the response is expected to carry a job identifier that
 * getJobStatus/waitForJob then poll.
 */
export async function submitOperation(path, payload, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${config.adobe.apiBaseUrl}${path}`, {
    method: 'POST',
    headers: await authHeaders(fetchImpl),
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AdobeApiError(`Adobe InDesign API request to ${path} failed`, res.status, json);
  }
  return json;
}

export async function getJobStatus(jobId, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${config.adobe.apiBaseUrl}${config.adobe.operations.status}/${jobId}`, {
    method: 'GET',
    headers: await authHeaders(fetchImpl),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AdobeApiError(`Adobe job status request failed for job ${jobId}`, res.status, json);
  }
  return json;
}
