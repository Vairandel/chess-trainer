import { ADMIN_COOKIE, ADMIN_COOKIE_PATH, db, endSession } from '../../_lib/auth';
import { clearCookie, json } from '../../_lib/http';
import type { Handler } from '../../_lib/types';

export const onRequestPost: Handler = async ({ request, env }) => {
  await endSession(db(env), request, ADMIN_COOKIE);
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookie(ADMIN_COOKIE, ADMIN_COOKIE_PATH) });
};
