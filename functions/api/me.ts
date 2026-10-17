import { db, requireProfile } from '../_lib/auth';
import { HttpError, json } from '../_lib/http';
import { getProfile, publicProfile } from '../_lib/profiles';
import type { Handler } from '../_lib/types';

/** The profile this device is signed in to (401 if none, or if its session ended). */
export const onRequestGet: Handler = async context => {
  const profile = await getProfile(db(context.env), await requireProfile(context));
  if (!profile) throw new HttpError(401, 'Not signed in.');
  return json({ profile: publicProfile(profile) });
};
