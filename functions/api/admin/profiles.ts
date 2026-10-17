import { DEFAULT_MAX_PROFILES } from '../../../src/profileOptions';
import { db, requireAdmin } from '../../_lib/auth';
import { hashPin, randomHex } from '../../_lib/crypto';
import { HttpError, json, readJson } from '../../_lib/http';
import { adminProfile, getConfig, getProfile, nameTaken, type ProfileRow } from '../../_lib/profiles';
import type { Handler } from '../../_lib/types';
import { checkAvatar, checkColor, checkName, checkPin, type ProfileInput } from '../../_lib/validate';

export const onRequestGet: Handler = async context => {
  await requireAdmin(context);
  const database = db(context.env);
  const { results } = await database.prepare('SELECT * FROM profiles ORDER BY created_at').all<ProfileRow>();
  const maxProfiles = Number(await getConfig(database, 'max_profiles', String(DEFAULT_MAX_PROFILES)));
  return json({ profiles: results.map(adminProfile), maxProfiles });
};

/** Creates a profile, within the limit set on the admin page. */
export const onRequestPost: Handler = async context => {
  await requireAdmin(context);
  const { env, request } = context;
  if (!env.PIN_PEPPER) throw new HttpError(503, 'Profiles are not set up on this server.');
  const body = await readJson<ProfileInput>(request, 2000);
  const name = checkName(body.name);
  const avatar = checkAvatar(body.avatar);
  const color = checkColor(body.color);
  const pin = checkPin(body.pin);

  const database = db(env);
  const max = Number(await getConfig(database, 'max_profiles', String(DEFAULT_MAX_PROFILES)));
  const count = await database.prepare('SELECT COUNT(*) AS n FROM profiles').first<{ n: number }>();
  if ((count?.n ?? 0) >= max) throw new HttpError(409, `The limit of ${max} profiles is reached. Raise it in the settings above.`);
  if (await nameTaken(database, name)) throw new HttpError(409, `There is already a profile called ${name}.`);

  const id = crypto.randomUUID();
  const salt = randomHex(16);
  await database
    .prepare('INSERT INTO profiles (id, name, avatar, color, pin_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, name, avatar, color, await hashPin(pin, salt, env.PIN_PEPPER), salt, Date.now())
    .run();
  return json({ profile: adminProfile((await getProfile(database, id))!) }, 201);
};
