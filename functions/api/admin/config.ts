import { DEFAULT_MAX_PROFILES, MAX_PROFILES_LIMIT } from '../../../src/profileOptions';
import { db, requireAdmin } from '../../_lib/auth';
import { HttpError, json, readJson } from '../../_lib/http';
import { getConfig, setConfig } from '../../_lib/profiles';
import type { Handler } from '../../_lib/types';

export const onRequestGet: Handler = async context => {
  await requireAdmin(context);
  const maxProfiles = Number(await getConfig(db(context.env), 'max_profiles', String(DEFAULT_MAX_PROFILES)));
  return json({ maxProfiles });
};

/** Changes the profile limit. It cannot go below the number of profiles that exist. */
export const onRequestPut: Handler = async context => {
  await requireAdmin(context);
  const body = await readJson<{ maxProfiles?: unknown }>(context.request, 1000);
  const max = body.maxProfiles;
  if (typeof max !== 'number' || !Number.isInteger(max) || max < 1 || max > MAX_PROFILES_LIMIT) {
    throw new HttpError(400, `The limit is a number from 1 to ${MAX_PROFILES_LIMIT}.`);
  }
  const database = db(context.env);
  const count = await database.prepare('SELECT COUNT(*) AS n FROM profiles').first<{ n: number }>();
  if ((count?.n ?? 0) > max) throw new HttpError(409, `There are already ${count!.n} profiles: delete some first.`);
  await setConfig(database, 'max_profiles', String(max));
  return json({ maxProfiles: max });
};
