CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tenant_onboardings (
  id UUID PRIMARY KEY,
  tenant_id UUID,
  business_name TEXT NOT NULL,
  slug TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  branch_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  current_step TEXT NOT NULL DEFAULT 'BUSINESS_PROFILE',
  industry TEXT NOT NULL,
  modules TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  country TEXT NOT NULL,
  currency TEXT NOT NULL,
  timezone TEXT NOT NULL,
  locale TEXT NOT NULL,
  owner_user_id UUID,
  branch_id UUID,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_fingerprint TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_onboardings_tenant_id_uq ON tenant_onboardings(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tenant_onboardings_status_idx ON tenant_onboardings(status);
CREATE INDEX IF NOT EXISTS tenant_onboardings_owner_idx ON tenant_onboardings(owner_user_id);

CREATE TABLE IF NOT EXISTS tenant_configurations (
  tenant_id UUID PRIMARY KEY,
  country TEXT NOT NULL,
  currency TEXT NOT NULL,
  timezone TEXT NOT NULL,
  locale TEXT NOT NULL,
  numbering_policy TEXT NOT NULL DEFAULT 'SEQUENTIAL',
  branch_code_policy TEXT NOT NULL DEFAULT 'TENANT_PREFIXED',
  tax_configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_module_entitlements (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  module_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  source TEXT NOT NULL DEFAULT 'ONBOARDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, module_key)
);
CREATE INDEX IF NOT EXISTS tenant_module_entitlements_tenant_idx ON tenant_module_entitlements(tenant_id);

CREATE TABLE IF NOT EXISTS tenant_onboarding_audit_events (
  id UUID PRIMARY KEY,
  onboarding_id UUID NOT NULL,
  tenant_id UUID,
  actor_user_id UUID,
  transition TEXT NOT NULL,
  result TEXT NOT NULL,
  correlation_id TEXT,
  trace_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tenant_onboarding_audit_tenant_idx ON tenant_onboarding_audit_events(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS tenant_onboarding_audit_onboarding_idx ON tenant_onboarding_audit_events(onboarding_id, created_at);
