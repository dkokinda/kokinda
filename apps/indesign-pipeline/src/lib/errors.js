import { ZodError } from 'zod';
import { AdobeApiError } from '../adobe/client.js';

export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'invalid_request', details: err.issues });
  }
  if (err instanceof AdobeApiError) {
    const status = err.status >= 400 && err.status < 600 ? err.status : 502;
    return res.status(status).json({ error: 'adobe_api_error', message: err.message, details: err.body });
  }
  console.error(err);
  return res.status(500).json({ error: 'internal_error', message: err.message });
}
