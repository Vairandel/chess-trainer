import { MAX_PROFILE_BYTES } from '../../src/profileOptions';
import { db, requireProfile } from '../_lib/auth';
import { HttpError, json, readJson } from '../_lib/http';
import type { Handler } from '../_lib/types';
import { checkChanges } from '../_lib/validate';

/** One page of a pull stays small, so a request never needs much time on the server. */
const PAGE_BYTES = 512_000;
const PAGE_ROWS = 200;
const MAX_BODY_BYTES = 2_500_000;

interface Row {
  key: string;
  value: string | null;
  updated_at: number;
}

/**
 * The signed-in profile's data that changed since `since` (server time of the previous pull),
 * in pages: pass `after` = the `next` of the previous page.
 */
export const onRequestGet: Handler = async context => {
  const id = await requireProfile(context);
  const url = new URL(context.request.url);
  const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
  const after = url.searchParams.get('after') ?? '';
  const serverTime = Date.now();
  const { results } = await db(context.env)
    .prepare('SELECT key, value, updated_at FROM data WHERE profile_id = ? AND synced_at >= ? AND key > ? ORDER BY key LIMIT ?')
    .bind(id, since, after, PAGE_ROWS)
    .all<Row>();
  const items: { key: string; value: string | null; updatedAt: number }[] = [];
  let bytes = 0;
  for (const r of results) {
    const size = r.key.length + (r.value?.length ?? 0);
    if (items.length && bytes + size > PAGE_BYTES) break;
    items.push({ key: r.key, value: r.value, updatedAt: r.updated_at });
    bytes += size;
  }
  const more = items.length < results.length || results.length === PAGE_ROWS;
  return json({ items, next: more ? items[items.length - 1].key : null, serverTime });
};

/**
 * Saves changes from a device; for each key, the latest change wins. Answers with the server's
 * version of the keys where the server had something newer, so the device can take it.
 */
export const onRequestPut: Handler = async context => {
  const id = await requireProfile(context);
  const database = db(context.env);
  const now = Date.now();
  const changes = checkChanges(await readJson(context.request, MAX_BODY_BYTES), now);
  const keys = JSON.stringify(changes.map(c => c.key));

  const total = await database
    .prepare('SELECT COALESCE(SUM(LENGTH(value)), 0) AS bytes FROM data WHERE profile_id = ?')
    .bind(id)
    .first<{ bytes: number }>();
  const { results: old } = await database
    .prepare('SELECT LENGTH(value) AS bytes FROM data WHERE profile_id = ? AND key IN (SELECT value FROM json_each(?))')
    .bind(id, keys)
    .all<{ bytes: number | null }>();
  const after =
    (total?.bytes ?? 0) - old.reduce((s, r) => s + (r.bytes ?? 0), 0) + changes.reduce((s, c) => s + (c.value?.length ?? 0), 0);
  if (after > MAX_PROFILE_BYTES) throw new HttpError(413, 'This profile is full (20 MB). Delete some saved games.');

  await database.batch(
    changes.map(c =>
      database
        .prepare(
          `INSERT INTO data (profile_id, key, value, updated_at, synced_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (profile_id, key) DO UPDATE
           SET value = excluded.value, updated_at = excluded.updated_at, synced_at = excluded.synced_at
           WHERE excluded.updated_at > data.updated_at`,
        )
        .bind(id, c.key, c.value, c.updatedAt, now),
    ),
  );

  const { results: current } = await database
    .prepare('SELECT key, value, updated_at FROM data WHERE profile_id = ? AND key IN (SELECT value FROM json_each(?))')
    .bind(id, keys)
    .all<Row>();
  const sent = new Map(changes.map(c => [c.key, c.updatedAt]));
  const newer = current
    .filter(r => r.updated_at > (sent.get(r.key) ?? 0))
    .map(r => ({ key: r.key, value: r.value, updatedAt: r.updated_at }));
  return json({ ok: true, newer, serverTime: now });
};
