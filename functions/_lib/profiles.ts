import type { D1Like } from './types';

export interface ProfileRow {
  id: string;
  name: string;
  avatar: string;
  color: string;
  pin_hash: string;
  salt: string;
  failed: number;
  locked_until: number;
  last_login: number | null;
  created_at: number;
}

/** What anyone can see on the profile picker. */
export interface PublicProfile {
  id: string;
  name: string;
  avatar: string;
  color: string;
}

export function publicProfile(p: ProfileRow): PublicProfile {
  return { id: p.id, name: p.name, avatar: p.avatar, color: p.color };
}

/** What the admin page sees: never the PIN hash or salt. */
export function adminProfile(p: ProfileRow) {
  return { ...publicProfile(p), failed: p.failed, lockedUntil: p.locked_until, lastLogin: p.last_login, createdAt: p.created_at };
}

export function getProfile(database: D1Like, id: string): Promise<ProfileRow | null> {
  return database.prepare('SELECT * FROM profiles WHERE id = ?').bind(id).first<ProfileRow>();
}

export async function getConfig(database: D1Like, key: string, fallback: string): Promise<string> {
  const row = await database.prepare('SELECT value FROM config WHERE key = ?').bind(key).first<{ value: string }>();
  return row?.value ?? fallback;
}

export async function setConfig(database: D1Like, key: string, value: string): Promise<void> {
  await database
    .prepare('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
    .bind(key, value)
    .run();
}

/** True if another profile already has this name (names are compared without case). */
export async function nameTaken(database: D1Like, name: string, exceptId = ''): Promise<boolean> {
  const row = await database.prepare('SELECT 1 AS x FROM profiles WHERE name = ? COLLATE NOCASE AND id != ?').bind(name, exceptId).first();
  return !!row;
}
