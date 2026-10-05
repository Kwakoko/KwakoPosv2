-- Durable one-time TOTP counter consumption prevents successful MFA code replay.
CREATE TABLE IF NOT EXISTS auth_totp_replay (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  counter BIGINT NOT NULL,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, counter)
);
