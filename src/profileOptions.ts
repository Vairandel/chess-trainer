/** Profile rules shared by the app and the server (functions/), so both validate the same way. */

export const AVATARS = ['🦁', '🐯', '🦊', '🐼', '🐨', '🐸', '🦉', '🐙', '🐺', '🦄', '🐲', '🐧'];
export const COLORS = ['#c0392b', '#d35400', '#b7950b', '#27ae60', '#16a085', '#2980b9', '#8e44ad', '#5d6d7e'];
export const NAME_MAX = 20;
export const PIN_PATTERN = /^\d{4}$/;
export const DEFAULT_MAX_PROFILES = 5;
/** The highest profile limit the admin page accepts. */
export const MAX_PROFILES_LIMIT = 20;

/** Storage keys that sync: what the app writes ("games", "evals:<id>", ...). Internal keys use other characters. */
export const SYNC_KEY_PATTERN = /^[A-Za-z0-9:._-]{1,200}$/;
/** The largest single value the server stores (D1 rows are limited to about 2 MB). */
export const MAX_VALUE_BYTES = 1_900_000;
/** The most data one profile can keep on the server. */
export const MAX_PROFILE_BYTES = 20_000_000;
