import { createSession, db, lockFor, lockMessage, MAX_TRIES, PROFILE_COOKIE, PROFILE_COOKIE_PATH, PROFILE_SESSION_MS } from '../_lib/auth';
import { hashPin, safeEqual } from '../_lib/crypto';
import { HttpError, json, readJson, sessionCookie } from '../_lib/http';
import { getProfile, publicProfile } from '../_lib/profiles';
import type { Handler } from '../_lib/types';
import { checkPin } from '../_lib/validate';

/** Signs in to a profile with its PIN. Wrong PINs count toward a lock (see lockFor). */
export const onRequestPost: Handler = async ({ request, env }) => {
  const body = await readJson<{ profileId?: unknown; pin?: unknown }>(request, 1000);
  const pin = checkPin(body.pin);
  if (!env.PIN_PEPPER) throw new HttpError(503, 'Profiles are not set up on this server.');
  const database = db(env);
  const profile = typeof body.profileId === 'string' ? await getProfile(database, body.profileId) : null;
  if (!profile) throw new HttpError(404, 'This profile no longer exists.');

  const now = Date.now();
  if (profile.locked_until > now) throw new HttpError(423, lockMessage(profile.locked_until, now), { lockedUntil: profile.locked_until });

  if (!safeEqual(await hashPin(pin, profile.salt, env.PIN_PEPPER), profile.pin_hash)) {
    const failed = profile.failed + 1;
    const lock = lockFor(failed);
    await database.prepare('UPDATE profiles SET failed = ?, locked_until = ? WHERE id = ?').bind(failed, lock ? now + lock : 0, profile.id).run();
    if (lock) throw new HttpError(423, lockMessage(now + lock, now), { lockedUntil: now + lock });
    throw new HttpError(401, 'Wrong PIN.', { triesLeft: MAX_TRIES - failed });
  }

  await database.prepare('UPDATE profiles SET failed = 0, locked_until = 0, last_login = ? WHERE id = ?').bind(now, profile.id).run();
  const token = await createSession(database, profile.id, PROFILE_SESSION_MS, now);
  return json({ profile: publicProfile(profile) }, 200, {
    'Set-Cookie': sessionCookie(PROFILE_COOKIE, token, PROFILE_COOKIE_PATH, PROFILE_SESSION_MS / 1000),
  });
};
