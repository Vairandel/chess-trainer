import { ADMIN_COOKIE, ADMIN_COOKIE_PATH, ADMIN_SESSION_MS, createSession, db, lockFor, lockMessage, MAX_TRIES } from '../../_lib/auth';
import { checkPassword } from '../../_lib/crypto';
import { HttpError, json, readJson, sessionCookie } from '../../_lib/http';
import { getConfig, setConfig } from '../../_lib/profiles';
import type { Handler } from '../../_lib/types';

/** Admin sign-in with the ADMIN_PASSWORD secret, with the same lockout as PINs. */
export const onRequestPost: Handler = async ({ request, env }) => {
  const body = await readJson<{ password?: unknown }>(request, 2000);
  if (!env.ADMIN_PASSWORD) throw new HttpError(503, 'The admin password is not set on this server.');
  const database = db(env);
  const now = Date.now();
  const lockedUntil = Number(await getConfig(database, 'admin_locked_until', '0'));
  if (lockedUntil > now) throw new HttpError(423, lockMessage(lockedUntil, now), { lockedUntil });

  if (typeof body.password !== 'string' || !(await checkPassword(body.password, env.ADMIN_PASSWORD))) {
    const failed = Number(await getConfig(database, 'admin_failed', '0')) + 1;
    const lock = lockFor(failed);
    await setConfig(database, 'admin_failed', String(failed));
    await setConfig(database, 'admin_locked_until', String(lock ? now + lock : 0));
    if (lock) throw new HttpError(423, lockMessage(now + lock, now), { lockedUntil: now + lock });
    throw new HttpError(401, 'Wrong password.', { triesLeft: MAX_TRIES - failed });
  }

  await setConfig(database, 'admin_failed', '0');
  await setConfig(database, 'admin_locked_until', '0');
  const token = await createSession(database, 'admin', ADMIN_SESSION_MS, now);
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(ADMIN_COOKIE, token, ADMIN_COOKIE_PATH, ADMIN_SESSION_MS / 1000) });
};
