-- Platform security is intentionally stored separately from tenant role metadata so
-- SUPER_ADMIN cannot be elevated through ordinary tenant-scoped role APIs.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS platform_super_admin_security (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bootstrap_pending BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  mfa_required BOOLEAN NOT NULL DEFAULT TRUE,
  mfa_enrolled BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_type TEXT,
  mfa_secret_ciphertext TEXT,
  locked_until TIMESTAMPTZ,
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  last_failed_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_login_throttles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  throttle_key TEXT NOT NULL UNIQUE,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_login_throttles_locked_until
  ON auth_login_throttles(locked_until);

CREATE INDEX IF NOT EXISTS idx_platform_super_admin_security_lock
  ON platform_super_admin_security(locked_until);
