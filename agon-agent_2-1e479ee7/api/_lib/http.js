/**
 * Shared helpers for the hosted-preview API (Vercel serverless functions).
 *
 * IMPORTANT: everything under /api exists only so the UI can be tried in a
 * browser, where SQLite and Tauri are unavailable. It is NOT the PharmaDesk
 * backend - that is the NestJS application in /backend.
 */

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/** Applies CORS headers. Returns true when the request was a preflight and is finished. */
export function handleCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

/** Known errors go to the client as-is; anything else is logged and hidden. */
export function sendError(res, error) {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message, ...error.extra });
  }
  console.error('Preview API error:', error);
  return res.status(500).json({ error: 'The preview server hit an unexpected error. Please try again.' });
}

/** Throws if a Supabase call failed, otherwise returns its data. */
export function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireUuid(value, label) {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new HttpError(400, `${label} is missing or malformed.`);
  }
  return value;
}
