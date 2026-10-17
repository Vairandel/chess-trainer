import { db, requireAdmin } from '../../../_lib/auth';
import { hashPin, randomHex } from '../../../_lib/crypto';
import { HttpError, json, readJson } from '../../../_lib/http';
import { adminProfile, getProfile, nameTaken } from '../../../_lib/profiles';
import type { Context, Handler } from '../../../_lib/types';
import { checkAvatar, checkColor, checkName, checkPin, type ProfileInput } from '../../../_lib/validate';

async function target(context: Context) {
  await requireAdmin(context);
  const id = String(context.params.id);
  const database = db(context.env);
  const profile = await getProfile(database, id);
  if (!profile) throw new HttpError(404, 'This profile no longer exists.');
  return { database, profile };
}

/**
 * Changes a profile: name, avatar, color, PIN, or `unlock: true`.
 * A new PIN also signs the profile out on every device.
 */
export const onRequestPatch: Handler = async context => {
  const { database, profile } = await target(context);
  const body = await readJson<ProfileInput & { unlock?: unknown }>(context.request, 2000);
  const statements = [];
  if (body.name !== undefined) {
    const name = checkName(body.name);
    if (await nameTaken(database, name, profile.id)) throw new HttpError(409, `There is already a profile called ${name}.`);
    statements.push(database.prepare('UPDATE profiles SET name = ? WHERE id = ?').bind(name, profile.id));
  }
  if (body.avatar !== undefined) statements.push(database.prepare('UPDATE profiles SET avatar = ? WHERE id = ?').bind(checkAvatar(body.avatar), profile.id));
  if (body.color !== undefined) statements.push(database.prepare('UPDATE profiles SET color = ? WHERE id = ?').bind(checkColor(body.color), profile.id));
  if (body.pin !== undefined) {
    const pepper = context.env.PIN_PEPPER;
    if (!pepper) throw new HttpError(503, 'Profiles are not set up on this server.');
    const salt = randomHex(16);
    statements.push(
      database
        .prepare('UPDATE profiles SET pin_hash = ?, salt = ?, failed = 0, locked_until = 0 WHERE id = ?')
        .bind(await hashPin(checkPin(body.pin), salt, pepper), salt, profile.id),
      database.prepare('DELETE FROM sessions WHERE subject = ?').bind(profile.id),
    );
  }
  if (body.unlock === true) statements.push(database.prepare('UPDATE profiles SET failed = 0, locked_until = 0 WHERE id = ?').bind(profile.id));
  if (statements.length === 0) throw new HttpError(400, 'Nothing to change.');
  await database.batch(statements);
  return json({ profile: adminProfile((await getProfile(database, profile.id))!) });
};

/** Deletes a profile with all its data, and signs it out everywhere. */
export const onRequestDelete: Handler = async context => {
  const { database, profile } = await target(context);
  await database.batch([
    database.prepare('DELETE FROM data WHERE profile_id = ?').bind(profile.id),
    database.prepare('DELETE FROM sessions WHERE subject = ?').bind(profile.id),
    database.prepare('DELETE FROM profiles WHERE id = ?').bind(profile.id),
  ]);
  return json({ ok: true });
};
