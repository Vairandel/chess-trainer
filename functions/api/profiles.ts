import { db } from '../_lib/auth';
import { json } from '../_lib/http';
import type { PublicProfile } from '../_lib/profiles';
import type { Handler } from '../_lib/types';

/** The profile picker: names and avatars only. */
export const onRequestGet: Handler = async ({ env }) => {
  const { results } = await db(env).prepare('SELECT id, name, avatar, color FROM profiles ORDER BY created_at').all<PublicProfile>();
  return json({ profiles: results });
};
