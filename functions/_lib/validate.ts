import { AVATARS, COLORS, MAX_VALUE_BYTES, NAME_MAX, PIN_PATTERN, SYNC_KEY_PATTERN } from '../../src/profileOptions';
import { HttpError } from './http';

export interface ProfileInput {
  name?: unknown;
  avatar?: unknown;
  color?: unknown;
  pin?: unknown;
}

export function checkName(name: unknown): string {
  const n = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
  if (!n || [...n].length > NAME_MAX) throw new HttpError(400, `A name is 1 to ${NAME_MAX} characters.`);
  return n;
}

export function checkAvatar(avatar: unknown): string {
  if (typeof avatar !== 'string' || !AVATARS.includes(avatar)) throw new HttpError(400, 'Unknown avatar.');
  return avatar;
}

export function checkColor(color: unknown): string {
  if (typeof color !== 'string' || !COLORS.includes(color)) throw new HttpError(400, 'Unknown color.');
  return color;
}

export function checkPin(pin: unknown): string {
  if (typeof pin !== 'string' || !PIN_PATTERN.test(pin)) throw new HttpError(400, 'A PIN is exactly 4 digits.');
  return pin;
}

export interface Change {
  key: string;
  value: string | null;
  updatedAt: number;
}

/**
 * Validates a batch of changes sent by a device. A device clock ahead of the server's is brought back
 * to the server's time, so a wrong clock cannot make its changes win forever.
 */
export function checkChanges(body: unknown, now: number): Change[] {
  const changes = (body as { changes?: unknown })?.changes;
  if (!Array.isArray(changes) || changes.length === 0 || changes.length > 200) throw new HttpError(400, 'Send 1 to 200 changes.');
  const seen = new Set<string>();
  return changes.map(c => {
    const { key, value, updatedAt } = (c ?? {}) as Record<string, unknown>;
    if (typeof key !== 'string' || !SYNC_KEY_PATTERN.test(key)) throw new HttpError(400, 'Invalid key.');
    if (seen.has(key)) throw new HttpError(400, `Key sent twice: ${key}.`);
    seen.add(key);
    if (value !== null && typeof value !== 'string') throw new HttpError(400, `Invalid value for ${key}.`);
    if (typeof value === 'string' && new TextEncoder().encode(value).length > MAX_VALUE_BYTES) throw new HttpError(413, `${key} is too large to sync.`);
    if (typeof updatedAt !== 'number' || !Number.isSafeInteger(updatedAt) || updatedAt <= 0) throw new HttpError(400, `Invalid time for ${key}.`);
    return { key, value, updatedAt: Math.min(updatedAt, now) };
  });
}
