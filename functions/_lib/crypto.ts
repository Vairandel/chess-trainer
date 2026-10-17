/** Tokens and hashes, with the Web Crypto API (available in Workers and in Node). */

const encoder = new TextEncoder();

const hex = (bytes: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');

export function randomHex(bytes: number): string {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Hex(text: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

/** Compares two strings in a time that does not depend on where they differ. */
export function safeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/**
 * The stored form of a PIN. A slow hash would add nothing for 10,000 possible PINs (and the free plan
 * allows 10 ms of CPU per request); what protects them is the secret pepper: without it, a copy of the
 * database cannot be used to test PINs.
 */
export function hashPin(pin: string, salt: string, pepper: string): Promise<string> {
  return hmacHex(pepper, `${salt}:${pin}`);
}

/** Checks the admin password without leaking its length or content through timing. */
export async function checkPassword(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([hmacHex('admin-password', given), hmacHex('admin-password', expected)]);
  return safeEqual(a, b);
}
