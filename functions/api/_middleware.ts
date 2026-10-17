import { HttpError, json } from '../_lib/http';
import type { Context } from '../_lib/types';

/**
 * Runs before every /api/ route:
 * - a request that changes something must come from this site's own pages (Origin check, against CSRF);
 * - errors become JSON answers, without internal details.
 */
export async function onRequest(context: Context): Promise<Response> {
  const { request } = context;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    if (request.headers.get('Origin') !== new URL(request.url).origin) return json({ error: 'Request refused (wrong origin).' }, 403);
  }
  try {
    return await context.next!();
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message, ...err.extra }, err.status);
    console.error(err);
    return json({ error: 'Server error.' }, 500);
  }
}
