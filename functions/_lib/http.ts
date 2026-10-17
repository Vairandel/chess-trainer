/** Responses, request bodies and cookies. */

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  const h = new Headers(headers);
  h.set('Content-Type', 'application/json; charset=utf-8');
  h.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(body), { status, headers: h });
}

/** Parses a JSON body, refusing other content types (no form posts) and bodies over `maxBytes`. */
export async function readJson<T>(request: Request, maxBytes: number): Promise<T> {
  if (!(request.headers.get('Content-Type') ?? '').startsWith('application/json')) throw new HttpError(415, 'Expected JSON.');
  const declared = Number(request.headers.get('Content-Length') ?? 0);
  if (declared > maxBytes) throw new HttpError(413, 'Too much data at once.');
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) throw new HttpError(413, 'Too much data at once.');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
}

export function getCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return undefined;
}

/** A session cookie: never readable by scripts, only sent over HTTPS, never sent from other sites. */
export function sessionCookie(name: string, value: string, path: string, maxAgeSeconds: number): string {
  return `${name}=${value}; Path=${path}; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearCookie(name: string, path: string): string {
  return sessionCookie(name, '', path, 0);
}
