import { db, endSession, PROFILE_COOKIE, PROFILE_COOKIE_PATH } from '../_lib/auth';
import { clearCookie, json } from '../_lib/http';
import type { Handler } from '../_lib/types';

export const onRequestPost: Handler = async ({ request, env }) => {
  await endSession(db(env), request, PROFILE_COOKIE);
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookie(PROFILE_COOKIE, PROFILE_COOKIE_PATH) });
};
