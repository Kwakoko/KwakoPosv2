CREATE TABLE IF NOT EXISTS dashboard_read_models (
  id TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  "asOfRevision" TEXT NOT NULL,
  "snapshotVersion" INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT dashboard_read_models_tenant_branch_timeframe_uq UNIQUE ("tenantId", "branchId", timeframe)
);

CREATE INDEX IF NOT EXISTS dashboard_read_models_scope_revision_idx
  ON dashboard_read_models ("tenantId", "branchId", "asOfRevision");

ALTER TABLE dashboard_read_models ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dashboard_read_models_tenant_branch_policy ON dashboard_read_models;
CREATE POLICY dashboard_read_models_tenant_branch_policy ON dashboard_read_models
  USING (
    "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
    AND "branchId" = NULLIF(current_setting('app.branch_id', true), '')
  )
  WITH CHECK (
    "tenantId" = NULLIF(current_setting('app.tenant_id', true), '')
    AND "branchId" = NULLIF(current_setting('app.branch_id', true), '')
  );
