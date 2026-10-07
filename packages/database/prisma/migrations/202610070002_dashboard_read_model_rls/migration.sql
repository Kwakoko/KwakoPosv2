-- Tenant RLS for persisted dashboard read models
ALTER TABLE "dashboard_read_models" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_dashboard_read_models ON "dashboard_read_models";
CREATE POLICY kwakopos_tenant_dashboard_read_models ON "dashboard_read_models"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL)
  WITH CHECK ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);
