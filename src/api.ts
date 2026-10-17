/** Calls to the profile server (functions/api/). */

export interface ProfileInfo {
  id: string;
  name: string;
  avatar: string;
  color: string;
}

export interface AdminProfile extends ProfileInfo {
  failed: number;
  lockedUntil: number;
  lastLogin: number | null;
  createdAt: number;
}

export interface SyncItem {
  key: string;
  value: string | null;
  updatedAt: number;
}

/** status 0: no connection, or no profile server here (e.g. the dev server). */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown, keepalive = false): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      keepalive,
    });
  } catch {
    throw new ApiError(0, 'No connection.');
  }
  if (!(res.headers.get('Content-Type') ?? '').includes('application/json')) throw new ApiError(0, 'Profiles are not available here.');
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, typeof data.error === 'string' ? data.error : 'Request failed.', data);
  return data as T;
}

export const api = {
  profiles: () => call<{ profiles: ProfileInfo[] }>('GET', '/api/profiles'),
  login: (profileId: string, pin: string) => call<{ profile: ProfileInfo }>('POST', '/api/login', { profileId, pin }),
  logout: () => call<{ ok: true }>('POST', '/api/logout', {}),
  me: () => call<{ profile: ProfileInfo }>('GET', '/api/me'),
  pull: (since: number, after: string) =>
    call<{ items: SyncItem[]; next: string | null; serverTime: number }>(
      'GET',
      `/api/data?since=${since}&after=${encodeURIComponent(after)}`,
    ),
  push: (changes: SyncItem[], keepalive = false) => call<{ newer: SyncItem[] }>('PUT', '/api/data', { changes }, keepalive),
  admin: {
    login: (password: string) => call<{ ok: true }>('POST', '/api/admin/login', { password }),
    logout: () => call<{ ok: true }>('POST', '/api/admin/logout', {}),
    list: () => call<{ profiles: AdminProfile[]; maxProfiles: number }>('GET', '/api/admin/profiles'),
    create: (p: { name: string; avatar: string; color: string; pin: string }) =>
      call<{ profile: AdminProfile }>('POST', '/api/admin/profiles', p),
    update: (id: string, patch: Partial<{ name: string; avatar: string; color: string; pin: string; unlock: true }>) =>
      call<{ profile: AdminProfile }>('PATCH', `/api/admin/profiles/${encodeURIComponent(id)}`, patch),
    remove: (id: string) => call<{ ok: true }>('DELETE', `/api/admin/profiles/${encodeURIComponent(id)}`),
    setMaxProfiles: (maxProfiles: number) => call<{ maxProfiles: number }>('PUT', '/api/admin/config', { maxProfiles }),
  },
};
