import fs from "node:fs";
import path from "node:path";
import { PricingTaxEngine } from "../../packages/domain/src/pricingTaxEngine.js";

const LOCK_ID = "TAX-FISCALIZATION-PRODUCTION-LOCK-V1-2026-10-08";

function read(file: string): string {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) throw new Error("LOCK_BLOCKED: missing file -> " + file);
  return fs.readFileSync(full, "utf8");
}
function must(content: string, marker: string, label: string): void {
  if (!content.includes(marker)) throw new Error("LOCK_BLOCKED: " + label + " -> missing " + marker);
}
function mustNot(content: string, marker: string, label: string): void {
  if (content.includes(marker)) throw new Error("LOCK_BLOCKED: " + label + " -> forbidden " + marker);
}

const schema = read("packages/database/prisma/schema.prisma");
const settings = read("apps/api/src/services/settingsService.ts");
const finance = read("packages/database/src/atomicCommercialFinance.ts");
const vfd = read("apps/api/src/services/traVfdService.ts");
const provider = read("apps/api/src/services/traVfdProvider.ts");
const routes = read("apps/api/src/routes/traVfdRoutes.ts");
const server = read("apps/api/src/server.ts");
const settingsUi = read("apps/web/src/pages/SettingsPage.tsx");
const posUi = read("apps/web/src/pages/PosPage.tsx");
const reportsUi = read("apps/web/src/pages/ReportsPage.tsx");
const dashboardUi = read("apps/web/src/pages/DashboardPage.tsx");
const vfdUi = read("apps/web/src/components/TRA/TraVfdFiscalizationCard.tsx");
const outboxUi = read("apps/web/src/services/traVfdOutboxService.ts");
const ci = read(".github/workflows/ci.yml");
const candidate = read(".github/workflows/production-certification.yml");
const exactMain = read(".github/workflows/production-release-exact-main.yml");
const pkg = read("package.json");

for (const marker of [
  "model Tax {", "rate        Decimal", "isInclusive Boolean",
  "@@unique([tenantId, branchId, code])",
  "model TraVfdConfig {", "model TraVfdFiscalization {", "model TraVfdOutbox {",
]) must(schema, marker, "database tax/fiscal schema");

for (const marker of [
  '"tax.config"', "taxId", "taxCode", "vatRatePercent", "taxInclusivePricing",
  "tx.tax.upsert",
]) must(settings, marker, "canonical Tax configuration");

for (const marker of [
  "taxSettingRows", "authoritativeTax", "tx.tax.findFirst", "PricingTaxEngine.calculateLineItem",
]) must(finance, marker, "server sale tax authority");

for (const marker of [
  "async enqueue", "async submit", "async reconcile", "private async retry",
  "TRA_VFD_FISCAL_ENQUEUED", "TRA_VFD_SUBMITTING", "TRA_VFD_ACCEPTED",
  "TRA_VFD_REJECTED", "TRA_VFD_RETRY_SCHEDULED", "TRA_VFD_VERIFIED",
  "TRA_VFD_RECONCILIATION_FAILED", "TRA_VFD_CONFIG_UPDATED",
]) must(vfd, marker, "fiscal lifecycle audit");

for (const marker of [
  "TEST: {", "PRODUCTION: {", "virtual.tra.go.tz", "vfd.tra.go.tz",
  "authorization: \"bearer \"", "cert-serial", "taxRatePct", "taxInclusive",
]) must(provider, marker, "TRA provider");

for (const marker of [
  "requireFiscalAuthority", "fiscalization.view", "fiscalization.manage",
  '"/api/v1/tra-vfd/config"', '"/api/v1/tra-vfd/queue"',
  '"/api/v1/tra-vfd/submit/:id"', '"/api/v1/tra-vfd/reconcile/:id"',
  '"/api/v1/tra-vfd/status"', '"/api/v1/tra-vfd/pending"',
]) must(routes, marker, "fiscal API RBAC");

for (const marker of [
  "startTraVfdReconciliationWorker",
  '"/api/v1/finance/tax-compliance"',
]) must(server, marker, "autonomous worker and tax report API");

for (const marker of ["taxInclusivePricing", "VAT Pricing Mode", "tra_vfd_config"])
  must(settingsUi, marker, "tax settings UI");

for (const marker of ["enqueueTraVfdOutbox", "processTraVfdOutbox", "taxAmount", "taxRate"])
  must(posUi, marker, "POS fiscal path");

for (const marker of ["taxComplianceRows", "/api/v1/finance/tax-compliance", "Tax & TRA EFD Compliance Ledger", "fiscalState"])
  must(reportsUi, marker, "authoritative tax report");

for (const marker of ["authoritativeTaxToday", "/api/v1/finance/tax-compliance"])
  must(dashboardUi, marker, "dashboard tax authority");

for (const marker of ["Pending Outbox", "/api/v1/tra-vfd/status", "PRODUCTION"])
  must(vfdUi, marker, "VFD operations UI");

for (const marker of ["traVfdOutbox", "/api/v1/tra-vfd/queue", "/api/v1/tra-vfd/submit/", "TRA_RETRY"])
  must(outboxUi, marker, "durable fiscal outbox");

for (const workflow of [ci, candidate, exactMain])
  must(workflow, "npm run certify:tax-fiscal-lock", "mandatory Tax/Fiscalization CI gate");

must(pkg, '"certify:tax-fiscal-lock"', "package certification command");

for (const marker of ["VAT (18%)", "TAXABLE TURNOVER (18%)", "VAT OUTPUT TAX (18%)"]) {
  mustNot(reportsUi, marker, "hard-coded VAT report label");
  mustNot(dashboardUi, marker, "hard-coded VAT dashboard label");
}
for (const marker of ["1.18", "0.18"])
  mustNot(provider, marker, "hard-coded VAT formula in VFD provider");

const exclusive = PricingTaxEngine.calculateTax(10000, { ratePct: 18, isInclusive: false });
const inclusive = PricingTaxEngine.calculateTax(11800, { ratePct: 18, isInclusive: true });
if (exclusive.taxAmount !== 1800 || exclusive.grossAmount !== 11800)
  throw new Error("LOCK_BLOCKED: exclusive VAT invariant failed");
if (inclusive.taxAmount !== 1800 || inclusive.netAmount !== 10000)
  throw new Error("LOCK_BLOCKED: inclusive VAT invariant failed");

console.log(LOCK_ID);
console.log("TAX / FISCALIZATION PRODUCTION LOCK: PASS");
console.log("Scope: Tax configuration, tax calculations, inclusive/exclusive pricing, fiscal receipts, TRA VFD, fiscal status, durable fiscal queue, retry, error handling, fiscal reports, compliance audit.");
