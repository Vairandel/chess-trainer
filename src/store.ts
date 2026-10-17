import { api, ApiError, type ProfileInfo, type SyncItem } from './api';
import { MAX_VALUE_BYTES } from './profileOptions';

/**
 * Where the app keeps its data: a drop-in for localStorage, with short keys ("games", "puzzles", ...).
 * - Guest: in this browser only, under "chess-trainer:<key>" (the keys used before profiles existed).
 * - A profile: under "chess-trainer:p:<id>:<key>" as an offline copy, and synced with the server:
 *   every change is queued and sent a moment later; the latest change of a key wins.
 * Per-device bookkeeping uses "#" in its keys, which never syncs.
 */

const ROOT = 'chess-trainer:';
const ACCOUNT_KEY = `${ROOT}active`;

export type Account = { kind: 'guest' } | { kind: 'profile'; profile: ProfileInfo };
export type SyncStatus = 'synced' | 'pending' | 'offline' | 'signed-out' | 'error';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable
  }
}

let account: Account | null = readJson<Account | null>(ACCOUNT_KEY, null);

/** The chosen account, or null if nobody has chosen yet (the app then works as Guest). */
export function getAccount(): Account | null {
  return account;
}

export function setAccount(next: Account | null): void {
  account = next;
  if (next) writeJson(ACCOUNT_KEY, next);
  else localStorage.removeItem(ACCOUNT_KEY);
}

const profilePrefix = (id: string) => `${ROOT}p:${id}:`;
const prefix = () => (account?.kind === 'profile' ? profilePrefix(account.profile.id) : ROOT);

export const store = {
  getItem(key: string): string | null {
    return localStorage.getItem(prefix() + key);
  },
  /** Throws like localStorage when storage is full or unavailable. */
  setItem(key: string, value: string): void {
    localStorage.setItem(prefix() + key, value);
    touched(key);
  },
  removeItem(key: string): void {
    localStorage.removeItem(prefix() + key);
    touched(key);
  },
};

// one-time move of the only key that never had the "chess-trainer:" prefix
try {
  const depth = localStorage.getItem('analysis-depth');
  if (depth !== null) {
    if (localStorage.getItem(`${ROOT}analysis-depth`) === null) localStorage.setItem(`${ROOT}analysis-depth`, depth);
    localStorage.removeItem('analysis-depth');
  }
} catch {
  // storage unavailable
}

// ---------------------------------------------------------------- sync

/** When each key last changed on this device (or arrived from the server). */
const metaKey = () => `${prefix()}#meta`;
/** Keys changed on this device and not yet accepted by the server. */
const queueKey = () => `${prefix()}#queue`;
/** Server time of the last pull. */
const sinceKey = () => `${prefix()}#since`;

let status: SyncStatus = 'synced';
const listeners: ((s: SyncStatus) => void)[] = [];
let flushTimer: number | undefined;
let flushing: Promise<SyncStatus> | undefined;

export function syncStatus(): SyncStatus {
  return status;
}

export function onSyncStatus(listener: (s: SyncStatus) => void): void {
  listeners.push(listener);
}

function setStatus(s: SyncStatus): void {
  if (s === status) return;
  status = s;
  listeners.forEach(l => l(s));
}

function touched(key: string): void {
  if (account?.kind !== 'profile') return;
  const meta = readJson<Record<string, number>>(metaKey(), {});
  meta[key] = Math.max(Date.now(), (meta[key] ?? 0) + 1);
  writeJson(metaKey(), meta);
  const queue = new Set(readJson<string[]>(queueKey(), []));
  queue.add(key);
  writeJson(queueKey(), [...queue]);
  if (status === 'synced') setStatus('pending');
  scheduleFlush();
}

export function pendingCount(): number {
  return account?.kind === 'profile' ? readJson<string[]>(queueKey(), []).length : 0;
}

export function scheduleFlush(delay = 2000): void {
  clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => void flush(), delay);
}

/** Takes a value from the server unless this device has a newer one. Returns true if it changed something. */
function applyRemote(item: SyncItem): boolean {
  const meta = readJson<Record<string, number>>(metaKey(), {});
  if ((meta[item.key] ?? 0) >= item.updatedAt) return false;
  try {
    if (item.value === null) localStorage.removeItem(prefix() + item.key);
    else localStorage.setItem(prefix() + item.key, item.value);
  } catch {
    return false; // no room: keep the local copy
  }
  meta[item.key] = item.updatedAt;
  writeJson(metaKey(), meta);
  writeJson(
    queueKey(),
    readJson<string[]>(queueKey(), []).filter(k => k !== item.key),
  );
  return true;
}

/** Sends the queued changes. Resolves with the resulting status. */
export function flush(keepalive = false): Promise<SyncStatus> {
  if (account?.kind !== 'profile') return Promise.resolve('synced' as SyncStatus);
  flushing ??= doFlush(keepalive).finally(() => (flushing = undefined));
  return flushing;
}

async function doFlush(keepalive: boolean): Promise<SyncStatus> {
  const queue = readJson<string[]>(queueKey(), []);
  if (queue.length === 0) {
    setStatus('synced');
    return 'synced';
  }
  const meta = readJson<Record<string, number>>(metaKey(), {});
  const changes: SyncItem[] = [];
  const tooBig: string[] = [];
  for (const key of queue) {
    const value = localStorage.getItem(prefix() + key);
    if (value !== null && value.length * 3 > MAX_VALUE_BYTES && new TextEncoder().encode(value).length > MAX_VALUE_BYTES) {
      tooBig.push(key); // stays on this device only
      continue;
    }
    changes.push({ key, value, updatedAt: meta[key] ?? Date.now() });
  }
  // small requests: the server never needs long for one
  const batches: SyncItem[][] = [];
  let batch: SyncItem[] = [];
  let bytes = 0;
  for (const c of changes) {
    const size = c.key.length + (c.value?.length ?? 0);
    if (batch.length && (bytes + size > 400_000 || batch.length >= 100)) {
      batches.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(c);
    bytes += size;
  }
  if (batch.length) batches.push(batch);

  try {
    for (const b of batches) {
      const small = b.reduce((s, c) => s + c.key.length + (c.value?.length ?? 0), 0) < 60_000;
      const { newer } = await api.push(b, keepalive && small);
      // done, unless the key changed again while the request was on its way
      const nowMeta = readJson<Record<string, number>>(metaKey(), {});
      const sent = new Map(b.map(c => [c.key, c.updatedAt]));
      writeJson(
        queueKey(),
        readJson<string[]>(queueKey(), []).filter(k => !(sent.has(k) && nowMeta[k] === sent.get(k))),
      );
      newer.forEach(applyRemote);
    }
    if (tooBig.length) writeJson(queueKey(), readJson<string[]>(queueKey(), []).filter(k => !tooBig.includes(k)));
    const left = readJson<string[]>(queueKey(), []).length;
    setStatus(left ? 'pending' : 'synced');
    if (left) scheduleFlush();
  } catch (err) {
    const e = err as ApiError;
    if (e.status === 0) {
      setStatus('offline');
      scheduleFlush(30_000);
    } else if (e.status === 401) {
      setStatus('signed-out');
    } else {
      setStatus('error');
      console.warn('Sync failed:', e.message);
      scheduleFlush(60_000);
    }
  }
  return status;
}

let lastPull = 0;

/** Gets what changed on the server since the last pull. Returns how many keys changed here. */
export async function pull(): Promise<number> {
  if (account?.kind !== 'profile') return 0;
  const since = Number(localStorage.getItem(sinceKey()) ?? 0);
  let after = '';
  let changed = 0;
  let serverTime = 0;
  for (;;) {
    const page = await api.pull(since, after);
    serverTime ||= page.serverTime;
    for (const item of page.items) if (applyRemote(item)) changed++;
    if (!page.next) break;
    after = page.next;
  }
  // a little overlap, in case a change was being saved during the pull
  localStorage.setItem(sinceKey(), String(Math.max(0, serverTime - 60_000)));
  lastPull = Date.now();
  return changed;
}

export function msSinceLastPull(): number {
  return Date.now() - lastPull;
}

// ---------------------------------------------------------------- guest work and sign-out

/** Keys saved as Guest on this device. */
export function guestKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (k.startsWith(ROOT) && !k.startsWith(`${ROOT}p:`) && !k.startsWith(`${ROOT}#`) && k !== ACCOUNT_KEY) keys.push(k.slice(ROOT.length));
  }
  return keys;
}

/**
 * Moves this device's guest work into the signed-in profile. The profile's own data wins, except for
 * saved games, which are put together. Returns how many keys were moved.
 */
export function moveGuestWork(): number {
  if (account?.kind !== 'profile') return 0;
  let moved = 0;
  for (const key of guestKeys()) {
    const guest = localStorage.getItem(ROOT + key);
    const mine = store.getItem(key);
    let next: string | null = mine;
    if (guest === null) continue;
    if (mine === null) next = guest;
    else if (key === 'games') next = mergeGames(mine, guest);
    try {
      if (next !== mine && next !== null) store.setItem(key, next);
      localStorage.removeItem(ROOT + key);
      moved++;
    } catch {
      // no room: leave the guest copy where it is
    }
  }
  return moved;
}

function mergeGames(mine: string, guest: string): string {
  try {
    const a = JSON.parse(mine) as { id: string }[];
    const b = JSON.parse(guest) as { id: string }[];
    const ids = new Set(a.map(g => g.id));
    return JSON.stringify([...a, ...b.filter(g => !ids.has(g.id))]);
  } catch {
    return mine;
  }
}

/** Remembers that the guest-work question was answered for this profile on this device. */
export function guestQuestionAsked(profileId: string, set = false): boolean {
  const key = `${ROOT}#asked:${profileId}`;
  if (set) localStorage.setItem(key, '1');
  return localStorage.getItem(key) === '1';
}

/** Forgets this device's copy of a profile (after signing out). */
export function forgetProfile(profileId: string): void {
  const p = profilePrefix(profileId);
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (k.startsWith(p)) keys.push(k);
  }
  keys.forEach(k => localStorage.removeItem(k));
}
