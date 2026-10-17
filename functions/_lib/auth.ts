import { randomHex, sha256Hex } from './crypto';
import { getCookie, HttpError } from './http';
import type { Context, D1Like, Env } from './types';

export const PROFILE_COOKIE = 'ct_session';
export const PROFILE_COOKIE_PATH = '/api';
export const PROFILE_SESSION_MS = 30 * 24 * 3600_000;
export const ADMIN_COOKIE = 'ct_admin';
export const ADMIN_COOKIE_PATH = '/api/admin';
export const ADMIN_SESSION_MS = 12 * 3600_000;

/** Wrong tries allowed before a lock. */
export const MAX_TRIES = 5;
const FIRST_LOCK_MS = 15 * 60_000;
const LONGEST_LOCK_MS = 24 * 3600_000;

/**
 * How long to lock after `failed` wrong tries in a row: nothing for the first 4, 15 minutes at the 5th,
 * then twice as long for each further wrong try (30 min, 1 h, ...), at most a day.
 */
export function lockFor(failed: number): number {
  if (failed < MAX_TRIES) return 0;
  return Math.min(FIRST_LOCK_MS * 2 ** (failed - MAX_TRIES), LONGEST_LOCK_MS);
}

export function lockMessage(lockedUntil: number, now: number): string {
  const minutes = Math.ceil((lockedUntil - now) / 60_000);
  const wait = minutes >= 120 ? `${Math.ceil(minutes / 60)} hours` : minutes === 1 ? '1 minute' : `${minutes} minutes`;
  return `Too many wrong tries. Try again in ${wait}.`;
}

export function db(env: Env): D1Like {
  if (!env.DB) throw new HttpError(503, 'Profiles are not set up on this server.');
  return env.DB;
}

/** Starts a session and returns its token (for the cookie). Old expired sessions are cleaned up on the way. */
export async function createSession(database: D1Like, subject: string, ttlMs: number, now = Date.now()): Promise<string> {
  const token = randomHex(32);
  await database.batch([
    database.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    database.prepare('INSERT INTO sessions (token_hash, subject, expires_at) VALUES (?, ?, ?)').bind(await sha256Hex(token), subject, now + ttlMs),
  ]);
  return token;
}

/** Who the session cookie belongs to (a profile id or 'admin'), or null. */
export async function sessionSubject(database: D1Like, request: Request, cookie: string, now = Date.now()): Promise<string | null> {
  const token = getCookie(request, cookie);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const row = await database
    .prepare('SELECT subject FROM sessions WHERE token_hash = ? AND expires_at > ?')
    .bind(await sha256Hex(token), now)
    .first<{ subject: string }>();
  return row?.subject ?? null;
}

export async function endSession(database: D1Like, request: Request, cookie: string): Promise<void> {
  const token = getCookie(request, cookie);
  if (token) await database.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
}

/** The signed-in profile's id, or a 401. */
export async function requireProfile(context: Context): Promise<string> {
  const subject = await sessionSubject(db(context.env), context.request, PROFILE_COOKIE);
  if (!subject || subject === 'admin') throw new HttpError(401, 'Not signed in.');
  return subject;
}

export async function requireAdmin(context: Context): Promise<void> {
  const subject = await sessionSubject(db(context.env), context.request, ADMIN_COOKIE);
  if (subject !== 'admin') throw new HttpError(401, 'Admin sign-in required.');
}
