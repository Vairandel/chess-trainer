import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sqliteD1 } from '../test/d1-sqlite';
import { lockFor } from './_lib/auth';
import type { Context, Env, Handler } from './_lib/types';
import { checkChanges } from './_lib/validate';
import { onRequest as middleware } from './api/_middleware';
import * as adminConfig from './api/admin/config';
import * as adminLogin from './api/admin/login';
import * as adminLogout from './api/admin/logout';
import * as adminProfiles from './api/admin/profiles';
import * as adminProfile from './api/admin/profiles/[id]';
import * as data from './api/data';
import * as login from './api/login';
import * as logout from './api/logout';
import * as me from './api/me';
import * as profiles from './api/profiles';

const ORIGIN = 'https://chess.example';
const ADMIN_PASSWORD = 'correct horse battery staple';
const ROUTES: [RegExp, Record<string, unknown>][] = [
  [/^\/api\/profiles$/, profiles],
  [/^\/api\/login$/, login],
  [/^\/api\/logout$/, logout],
  [/^\/api\/me$/, me],
  [/^\/api\/data$/, data],
  [/^\/api\/admin\/login$/, adminLogin],
  [/^\/api\/admin\/logout$/, adminLogout],
  [/^\/api\/admin\/config$/, adminConfig],
  [/^\/api\/admin\/profiles$/, adminProfiles],
  [/^\/api\/admin\/profiles\/(?<id>[^/]+)$/, adminProfile],
];

let env: Env;
let now: number;

/** A browser: keeps its cookies, like a real device would. */
class Device {
  cookies = new Map<string, { value: string; path: string }>();

  async call(method: string, path: string, body?: unknown, options: { origin?: string | null } = {}) {
    const url = new URL(path, ORIGIN);
    const headers = new Headers();
    const cookie = [...this.cookies].filter(([, c]) => url.pathname.startsWith(c.path)).map(([k, c]) => `${k}=${c.value}`);
    if (cookie.length) headers.set('Cookie', cookie.join('; '));
    const origin = options.origin === undefined ? ORIGIN : options.origin;
    if (origin) headers.set('Origin', origin);
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    const request = new Request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const [, module] = ROUTES.find(([re]) => re.test(url.pathname))!;
    const params = { ...url.pathname.match(ROUTES.find(([re]) => re.test(url.pathname))![0])!.groups };
    const handler = module[`onRequest${method[0]}${method.slice(1).toLowerCase()}`] as Handler | undefined;
    const context: Context = {
      request,
      env,
      params,
      next: async () => (handler ? handler({ request, env, params }) : new Response('Method not allowed', { status: 405 })),
    };
    const response = await middleware(context);
    const set = response.headers.get('Set-Cookie');
    if (set) {
      const [pair, ...attrs] = set.split(';').map(s => s.trim());
      const [name, value] = pair.split('=');
      const path = attrs.find(a => a.startsWith('Path='))!.slice(5);
      if (attrs.includes('Max-Age=0')) this.cookies.delete(name);
      else this.cookies.set(name, { value, path });
    }
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null, setCookie: set };
  }
}

async function admin(): Promise<Device> {
  const d = new Device();
  expect((await d.call('POST', '/api/admin/login', { password: ADMIN_PASSWORD })).status).toBe(200);
  return d;
}

async function createProfile(a: Device, name: string, pin = '1234') {
  const r = await a.call('POST', '/api/admin/profiles', { name, avatar: '🦊', color: '#27ae60', pin });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.profile.id as string;
}

async function signIn(d: Device, profileId: string, pin = '1234') {
  return d.call('POST', '/api/login', { profileId, pin });
}

beforeEach(() => {
  env = { DB: sqliteD1(), ADMIN_PASSWORD, PIN_PEPPER: 'test-pepper' };
  now = Date.UTC(2026, 9, 17, 12);
  vi.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => vi.restoreAllMocks());

describe('lock rules', () => {
  it('locks at the 5th wrong try for 15 minutes, then doubles, at most a day', () => {
    expect([1, 2, 3, 4].map(lockFor)).toEqual([0, 0, 0, 0]);
    expect(lockFor(5)).toBe(15 * 60_000);
    expect(lockFor(6)).toBe(30 * 60_000);
    expect(lockFor(7)).toBe(60 * 60_000);
    expect(lockFor(20)).toBe(24 * 3600_000);
  });
});

describe('admin', () => {
  it('needs the admin password; wrong tries are locked like PINs', async () => {
    const d = new Device();
    const wrong = await d.call('POST', '/api/admin/login', { password: 'guess' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.triesLeft).toBe(4);
    expect((await d.call('GET', '/api/admin/profiles')).status).toBe(401);
    for (let i = 0; i < 3; i++) await d.call('POST', '/api/admin/login', { password: 'guess' });
    expect((await d.call('POST', '/api/admin/login', { password: 'guess' })).status).toBe(423);
    // even the right password waits for the lock to end
    expect((await d.call('POST', '/api/admin/login', { password: ADMIN_PASSWORD })).status).toBe(423);
    now += 15 * 60_000 + 1;
    const ok = await d.call('POST', '/api/admin/login', { password: ADMIN_PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.setCookie).toMatch(/^ct_admin=[0-9a-f]{64}; Path=\/api\/admin; Max-Age=43200; HttpOnly; Secure; SameSite=Strict$/);
    expect((await d.call('GET', '/api/admin/profiles')).status).toBe(200);
  });

  it('the admin session expires after 12 hours, and logout ends it', async () => {
    const a = await admin();
    now += 12 * 3600_000 + 1;
    expect((await a.call('GET', '/api/admin/profiles')).status).toBe(401);
    const b = await admin();
    await b.call('POST', '/api/admin/logout');
    expect((await b.call('GET', '/api/admin/profiles')).status).toBe(401);
  });

  it('creates profiles within the limit, with valid names, avatars and PINs', async () => {
    const a = await admin();
    expect((await a.call('POST', '/api/admin/profiles', { name: 'Randi', avatar: '🦊', color: '#27ae60', pin: '12a4' })).status).toBe(400);
    expect((await a.call('POST', '/api/admin/profiles', { name: 'Randi', avatar: '💩', color: '#27ae60', pin: '1234' })).status).toBe(400);
    expect((await a.call('POST', '/api/admin/profiles', { name: '   ', avatar: '🦊', color: '#27ae60', pin: '1234' })).status).toBe(400);
    await createProfile(a, 'Randi');
    expect((await a.call('POST', '/api/admin/profiles', { name: 'randi', avatar: '🦊', color: '#27ae60', pin: '1234' })).status).toBe(409);

    expect((await a.call('PUT', '/api/admin/config', { maxProfiles: 2 })).body.maxProfiles).toBe(2);
    await createProfile(a, 'Alex');
    const third = await a.call('POST', '/api/admin/profiles', { name: 'Sam', avatar: '🦊', color: '#27ae60', pin: '1234' });
    expect(third.status).toBe(409);
    expect(third.body.error).toContain('limit of 2');
    expect((await a.call('PUT', '/api/admin/config', { maxProfiles: 1 })).status).toBe(409);
    expect((await a.call('PUT', '/api/admin/config', { maxProfiles: 50 })).status).toBe(400);

    const list = await a.call('GET', '/api/admin/profiles');
    expect(list.body.profiles.map((p: { name: string }) => p.name)).toEqual(['Randi', 'Alex']);
    expect(list.body.maxProfiles).toBe(2);
    expect(JSON.stringify(list.body)).not.toMatch(/pin_hash|salt/);
  });

  it('the default limit is 5', async () => {
    const a = await admin();
    expect((await a.call('GET', '/api/admin/config')).body.maxProfiles).toBe(5);
  });

  it('a profile session is not an admin session', async () => {
    const a = await admin();
    const id = await createProfile(a, 'Randi');
    const d = new Device();
    await signIn(d, id);
    expect((await d.call('GET', '/api/admin/profiles')).status).toBe(401);
  });
});

describe('the profile picker and PIN sign-in', () => {
  it('lists names and avatars only', async () => {
    const a = await admin();
    await createProfile(a, 'Randi');
    const r = await new Device().call('GET', '/api/profiles');
    expect(r.body.profiles).toEqual([{ id: expect.any(String), name: 'Randi', avatar: '🦊', color: '#27ae60' }]);
  });

  it('signs in with the right PIN, for 30 days', async () => {
    const a = await admin();
    const id = await createProfile(a, 'Randi');
    const d = new Device();
    expect((await d.call('GET', '/api/me')).status).toBe(401);
    const r = await signIn(d, id);
    expect(r.status).toBe(200);
    expect(r.setCookie).toMatch(/^ct_session=[0-9a-f]{64}; Path=\/api; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict$/);
    expect((await d.call('GET', '/api/me')).body.profile.name).toBe('Randi');
    now += 30 * 24 * 3600_000 + 1;
    expect((await d.call('GET', '/api/me')).status).toBe(401);
  });

  it('locks after 5 wrong PINs; the admin can unlock', async () => {
    const a = await admin();
    const id = await createProfile(a, 'Randi');
    const d = new Device();
    for (let left = 4; left >= 1; left--) {
      const r = await signIn(d, id, '0000');
      expect(r.status).toBe(401);
      expect(r.body.triesLeft).toBe(left);
    }
    const locked = await signIn(d, id, '0000');
    expect(locked.status).toBe(423);
    expect(locked.body.error).toBe('Too many wrong tries. Try again in 15 minutes.');
    expect((await signIn(d, id)).status).toBe(423);

    // after the lock, one more wrong try locks for twice as long
    now += 15 * 60_000 + 1;
    expect((await signIn(d, id, '0000')).body.error).toBe('Too many wrong tries. Try again in 30 minutes.');

    const list = await a.call('GET', '/api/admin/profiles');
    expect(list.body.profiles[0].failed).toBe(6);
    expect((await a.call('PATCH', `/api/admin/profiles/${id}`, { unlock: true })).status).toBe(200);
    expect((await signIn(d, id)).status).toBe(200);
  });

  it('a right PIN resets the count of wrong tries', async () => {
    const a = await admin();
    const id = await createProfile(a, 'Randi');
    const d = new Device();
    for (let i = 0; i < 4; i++) await signIn(d, id, '0000');
    await signIn(d, id);
    expect((await signIn(d, id, '0000')).body.triesLeft).toBe(4);
  });

  it('a new PIN signs the profile out everywhere; the old PIN stops working', async () => {
    const a = await admin();
    const id = await createProfile(a, 'Randi');
    const d = new Device();
    await signIn(d, id);
    await a.call('PATCH', `/api/admin/profiles/${id}`, { pin: '9876' });
    expect((await d.call('GET', '/api/me')).status).toBe(401);
    expect((await signIn(d, id, '1234')).status).toBe(401);
    expect((await signIn(d, id, '9876')).status).toBe(200);
  });

  it('logout ends the session', async () => {
    const a = await admin();
    const id = await createProfile(a, 'Randi');
    const d = new Device();
    await signIn(d, id);
    await d.call('POST', '/api/logout');
    expect((await d.call('GET', '/api/me')).status).toBe(401);
  });

  it('the PIN is not stored in clear', async () => {
    const a = await admin();
    const id = await createProfile(a, 'Randi', '4321');
    const row = await env.DB!.prepare('SELECT pin_hash, salt FROM profiles WHERE id = ?').bind(id).first<{ pin_hash: string }>();
    expect(row!.pin_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.pin_hash).not.toContain('4321');
  });
});

describe('requests from other sites are refused', () => {
  it('needs this site as Origin for anything that changes data', async () => {
    const d = new Device();
    expect((await d.call('POST', '/api/admin/login', { password: ADMIN_PASSWORD }, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await d.call('POST', '/api/admin/login', { password: ADMIN_PASSWORD }, { origin: null })).status).toBe(403);
    // reading the public profile list is fine
    expect((await d.call('GET', '/api/profiles', undefined, { origin: null })).status).toBe(200);
  });

  it('refuses non-JSON bodies (no form posts)', async () => {
    const request = new Request(`${ORIGIN}/api/admin/login`, {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `password=${ADMIN_PASSWORD}`,
    });
    const r = await middleware({ request, env, params: {}, next: () => adminLogin.onRequestPost({ request, env, params: {} }) });
    expect(r.status).toBe(415);
  });
});

describe('sync', () => {
  async function signedIn(name = 'Randi') {
    const a = await admin();
    const id = await createProfile(a, name);
    const d = new Device();
    await signIn(d, id);
    return { a, id, d };
  }

  it('needs a profile session', async () => {
    expect((await new Device().call('GET', '/api/data')).status).toBe(401);
    expect((await new Device().call('PUT', '/api/data', { changes: [{ key: 'games', value: '[]', updatedAt: 1 }] })).status).toBe(401);
  });

  it('saves changes and gives them to another device', async () => {
    const { id, d } = await signedIn();
    const put = await d.call('PUT', '/api/data', { changes: [{ key: 'games', value: '[1]', updatedAt: now - 10 }, { key: 'puzzles', value: '{}', updatedAt: now - 5 }] });
    expect(put.body).toMatchObject({ ok: true, newer: [] });
    const phone = new Device();
    await signIn(phone, id);
    const r = await phone.call('GET', '/api/data?since=0');
    expect(r.body.items).toEqual([
      { key: 'games', value: '[1]', updatedAt: now - 10 },
      { key: 'puzzles', value: '{}', updatedAt: now - 5 },
    ]);
    expect(r.body.next).toBeNull();
    expect(r.body.serverTime).toBe(now);
  });

  it('the latest change wins; an older one gets the newer value back', async () => {
    const { d } = await signedIn();
    await d.call('PUT', '/api/data', { changes: [{ key: 'puzzles', value: 'new', updatedAt: now - 10 }] });
    const stale = await d.call('PUT', '/api/data', { changes: [{ key: 'puzzles', value: 'old', updatedAt: now - 100 }] });
    expect(stale.body.newer).toEqual([{ key: 'puzzles', value: 'new', updatedAt: now - 10 }]);
    expect((await d.call('GET', '/api/data')).body.items[0].value).toBe('new');
  });

  it('a device clock in the future cannot win forever', async () => {
    const { d } = await signedIn();
    await d.call('PUT', '/api/data', { changes: [{ key: 'puzzles', value: 'future', updatedAt: now + 365 * 24 * 3600_000 }] });
    now += 1000;
    await d.call('PUT', '/api/data', { changes: [{ key: 'puzzles', value: 'later', updatedAt: now }] });
    expect((await d.call('GET', '/api/data')).body.items[0].value).toBe('later');
  });

  it('deletions sync', async () => {
    const { d } = await signedIn();
    await d.call('PUT', '/api/data', { changes: [{ key: 'evals:g1', value: '[]', updatedAt: now - 10 }] });
    await d.call('PUT', '/api/data', { changes: [{ key: 'evals:g1', value: null, updatedAt: now - 5 }] });
    expect((await d.call('GET', '/api/data')).body.items).toEqual([{ key: 'evals:g1', value: null, updatedAt: now - 5 }]);
  });

  it('pulls only what changed since the last pull', async () => {
    const { d } = await signedIn();
    await d.call('PUT', '/api/data', { changes: [{ key: 'games', value: '1', updatedAt: now }] });
    const first = await d.call('GET', '/api/data?since=0');
    now += 60_000;
    await d.call('PUT', '/api/data', { changes: [{ key: 'puzzles', value: '2', updatedAt: now }] });
    const next = await d.call('GET', `/api/data?since=${first.body.serverTime + 1}`);
    expect(next.body.items.map((i: { key: string }) => i.key)).toEqual(['puzzles']);
  });

  it('big pulls come in pages', async () => {
    const { d } = await signedIn();
    const big = 'x'.repeat(300_000);
    for (const k of ['evals:a', 'evals:b', 'evals:c']) await d.call('PUT', '/api/data', { changes: [{ key: k, value: big, updatedAt: now }] });
    const keys: string[] = [];
    let after = '';
    for (let page = 0; page < 5; page++) {
      const r = await d.call('GET', `/api/data?since=0&after=${encodeURIComponent(after)}`);
      keys.push(...r.body.items.map((i: { key: string }) => i.key));
      if (!r.body.next) break;
      after = r.body.next;
    }
    expect(keys).toEqual(['evals:a', 'evals:b', 'evals:c']);
  });

  it('a profile only sees its own data', async () => {
    const { a, d } = await signedIn('Randi');
    await d.call('PUT', '/api/data', { changes: [{ key: 'games', value: 'mine', updatedAt: now }] });
    const other = new Device();
    await signIn(other, await createProfile(a, 'Alex'));
    expect((await other.call('GET', '/api/data')).body.items).toEqual([]);
  });

  it('refuses invalid changes and data over the limits', async () => {
    const { d } = await signedIn();
    expect((await d.call('PUT', '/api/data', { changes: [] })).status).toBe(400);
    expect((await d.call('PUT', '/api/data', { changes: [{ key: '#meta', value: 'x', updatedAt: now }] })).status).toBe(400);
    expect((await d.call('PUT', '/api/data', { changes: [{ key: 'a', value: 'x'.repeat(2_000_000), updatedAt: now }] })).status).toBe(413);
    const big = 'x'.repeat(1_800_000);
    for (let i = 0; i < 11; i++) await d.call('PUT', '/api/data', { changes: [{ key: `evals:${i}`, value: big, updatedAt: now }] });
    const full = await d.call('PUT', '/api/data', { changes: [{ key: 'evals:x', value: big, updatedAt: now }] });
    expect(full.status).toBe(413);
    expect(full.body.error).toContain('full');
  });

  it('deleting a profile deletes its data and sessions', async () => {
    const { a, id, d } = await signedIn();
    await d.call('PUT', '/api/data', { changes: [{ key: 'games', value: 'x', updatedAt: now }] });
    expect((await a.call('DELETE', `/api/admin/profiles/${id}`)).status).toBe(200);
    expect((await d.call('GET', '/api/data')).status).toBe(401);
    const rows = await env.DB!.prepare('SELECT COUNT(*) AS n FROM data').first<{ n: number }>();
    expect(rows!.n).toBe(0);
  });
});

describe('checking changes', () => {
  it('clamps future times to the server time and refuses duplicates', () => {
    expect(checkChanges({ changes: [{ key: 'a', value: 'x', updatedAt: 5000 }] }, 1000)).toEqual([{ key: 'a', value: 'x', updatedAt: 1000 }]);
    expect(() => checkChanges({ changes: [{ key: 'a', value: 'x', updatedAt: 1 }, { key: 'a', value: 'y', updatedAt: 2 }] }, 1000)).toThrow('twice');
    expect(() => checkChanges({ changes: [{ key: 'a b', value: 'x', updatedAt: 1 }] }, 1000)).toThrow('Invalid key');
  });
});

describe('without the database or secrets', () => {
  it('answers 503 instead of crashing', async () => {
    env = {};
    expect((await new Device().call('GET', '/api/profiles')).status).toBe(503);
  });
});
