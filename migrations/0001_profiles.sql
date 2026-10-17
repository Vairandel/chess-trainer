-- Profiles (Netflix-style), their sessions and their synced data. Used by functions/api/.

-- Settings changed from the admin page, and the admin login lockout.
CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO config (key, value) VALUES ('max_profiles', '5');

CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL,
  color TEXT NOT NULL,
  -- HMAC-SHA256 of the PIN with the profile's salt, keyed by the PIN_PEPPER secret
  pin_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  -- wrong PINs in a row, and until when the profile is locked (ms since epoch)
  failed INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  last_login INTEGER,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX profiles_name ON profiles (name COLLATE NOCASE);

-- Only the SHA-256 of a session token is stored; the token itself lives in an HttpOnly cookie.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  subject TEXT NOT NULL, -- a profile id, or 'admin'
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_subject ON sessions (subject);

-- One row per app storage key ("games", "puzzles", "evals:<game id>", ...).
CREATE TABLE data (
  profile_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT, -- NULL: deleted (kept so the deletion reaches the other devices)
  updated_at INTEGER NOT NULL, -- when the device changed it: the latest change wins
  synced_at INTEGER NOT NULL, -- when the server received it: devices ask for what changed since their last pull
  PRIMARY KEY (profile_id, key)
);
CREATE INDEX data_synced ON data (profile_id, synced_at);
