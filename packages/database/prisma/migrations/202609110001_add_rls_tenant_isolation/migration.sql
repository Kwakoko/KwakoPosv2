-- KwakoPos v2 — H-008: PostgreSQL Row-Level Security for Tenant Isolation
-- Enforces tenant boundary defense-in-depth at the database engine level.

-- Create the application tenant context function
CREATE OR REPLACE FUNCTION kwakopos_current_tenant_id()
RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('kwakopos.tenant_id', TRUE), '')
$$ LANGUAGE SQL STABLE;

-- 1. Commercial Core Tables
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_products ON "products";
CREATE POLICY kwakopos_tenant_products ON "products"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "product_variants" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_product_variants ON "product_variants";
CREATE POLICY kwakopos_tenant_product_variants ON "product_variants"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "stock_ledgers" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_stock_ledgers ON "stock_ledgers";
CREATE POLICY kwakopos_tenant_stock_ledgers ON "stock_ledgers"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "stock_adjustments" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_stock_adjustments ON "stock_adjustments";
CREATE POLICY kwakopos_tenant_stock_adjustments ON "stock_adjustments"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "sales" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_sales ON "sales";
CREATE POLICY kwakopos_tenant_sales ON "sales"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "sale_lines" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_sale_lines ON "sale_lines";
CREATE POLICY kwakopos_tenant_sale_lines ON "sale_lines"
  USING (EXISTS (
    SELECT 1 FROM "sales" s
    WHERE s.id = "sale_lines"."saleId"
    AND (s."tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL)
  ));

ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_payments ON "payments";
CREATE POLICY kwakopos_tenant_payments ON "payments"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_customers ON "customers";
CREATE POLICY kwakopos_tenant_customers ON "customers"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_suppliers ON "suppliers";
CREATE POLICY kwakopos_tenant_suppliers ON "suppliers"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "purchase_orders" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_purchase_orders ON "purchase_orders";
CREATE POLICY kwakopos_tenant_purchase_orders ON "purchase_orders"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "purchase_receipts" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_purchase_receipts ON "purchase_receipts";
CREATE POLICY kwakopos_tenant_purchase_receipts ON "purchase_receipts"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "cash_sessions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_cash_sessions ON "cash_sessions";
CREATE POLICY kwakopos_tenant_cash_sessions ON "cash_sessions"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

-- 2. Finance Tables
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_accounts ON "accounts";
CREATE POLICY kwakopos_tenant_accounts ON "accounts"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "fiscal_years" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_fiscal_years ON "fiscal_years";
CREATE POLICY kwakopos_tenant_fiscal_years ON "fiscal_years"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "accounting_periods" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_accounting_periods ON "accounting_periods";
CREATE POLICY kwakopos_tenant_accounting_periods ON "accounting_periods"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "journal_entries" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_journal_entries ON "journal_entries";
CREATE POLICY kwakopos_tenant_journal_entries ON "journal_entries"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "journal_lines" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_journal_lines ON "journal_lines";
CREATE POLICY kwakopos_tenant_journal_lines ON "journal_lines"
  USING (EXISTS (
    SELECT 1 FROM "journal_entries" je
    WHERE je.id = "journal_lines"."journalEntryId"
    AND (je."tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL)
  ));

ALTER TABLE "customer_invoices" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_customer_invoices ON "customer_invoices";
CREATE POLICY kwakopos_tenant_customer_invoices ON "customer_invoices"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "supplier_invoices" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_supplier_invoices ON "supplier_invoices";
CREATE POLICY kwakopos_tenant_supplier_invoices ON "supplier_invoices"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "bank_accounts" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_bank_accounts ON "bank_accounts";
CREATE POLICY kwakopos_tenant_bank_accounts ON "bank_accounts"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "bank_transactions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_bank_transactions ON "bank_transactions";
CREATE POLICY kwakopos_tenant_bank_transactions ON "bank_transactions"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "budgets" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_budgets ON "budgets";
CREATE POLICY kwakopos_tenant_budgets ON "budgets"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

-- 3. Workforce Tables
ALTER TABLE "employees" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_employees ON "employees";
CREATE POLICY kwakopos_tenant_employees ON "employees"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "attendance_records" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_attendance_records ON "attendance_records";
CREATE POLICY kwakopos_tenant_attendance_records ON "attendance_records"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "leave_requests" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_leave_requests ON "leave_requests";
CREATE POLICY kwakopos_tenant_leave_requests ON "leave_requests"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "workforce_tasks" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_workforce_tasks ON "workforce_tasks";
CREATE POLICY kwakopos_tenant_workforce_tasks ON "workforce_tasks"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "work_orders" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_work_orders ON "work_orders";
CREATE POLICY kwakopos_tenant_work_orders ON "work_orders"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);

ALTER TABLE "payroll_inputs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kwakopos_tenant_payroll_inputs ON "payroll_inputs";
CREATE POLICY kwakopos_tenant_payroll_inputs ON "payroll_inputs"
  USING ("tenantId" = kwakopos_current_tenant_id() OR kwakopos_current_tenant_id() IS NULL);
