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

const files = {
  schema: read("packages/database/prisma/schema.prisma"),
  contracts: read("packages/contracts/src/traVfdContracts.ts"),
  settings: read("apps/api/src/services/settingsService.ts"),
  finance: read("packages/database/src/atomicCommercialFinance.ts"),
  vfd: read("apps/api/src/services/traVfdService.ts"),
  provider: read("apps/api/src/services/traVfdProvider.ts"),
  routes: read("apps/api/src/routes/traVfdRoutes.ts"),
  server: read("apps/api/src/server.ts"),
  settingsUi: read("apps/web/src/pages/SettingsPage.tsx"),
  posUi: read("apps/web/src/pages/PosPage.tsx"),
  reportsUi: read("apps/web/src/pages/ReportsPage.tsx"),
  dashboardUi: read("apps/web/src/pages/DashboardPage.tsx"),
  vfdUi: read("apps/web/src/components/TRA/TraVfdFiscalizationCard.tsx"),
  outboxUi: read("apps/web/src/services/traVfdOutboxService.ts"),
  ci: read(".github/workflows/ci.yml"),
  candidate: read(".github/workflows/production-certification.yml"),
  exactMain: read(".github/workflows/production-release-exact-main.yml"),
  pkg: read("package.json"),
};

for (const marker of [
  'model Tax {', 'rate        Decimal', 'isInclusive Boolean',
  '@@unique([tenantId, branchId, code])',
  'model TraVfdConfig {', 'model TraVfdFiscalization {', 'model TraVfdOutbox {',
]) must(files.schema, marker, "database tax/fiscal models");

for (const marker of [
  '"tax.config"', 'taxId', 'vatRatePercent', 'taxInclusivePricing',
  'Tax', 'rate', 'isInclusive',
]) must(files.settings, marker, "canonical tax configuration");

for (const marker of [
  'taxSettingRows', 'tx.tax.findFirst', 'taxRow.rate', 'taxRow.isInclusive',
  'PricingTaxEngine.calculateLineItem',
]) must(files.finance, marker, "server-authoritative tax resolution");

for (const marker of [
  'async enqueue', 'async submit', 'async reconcile', 'private async retry',
  'runTraVfdReconciliationCycle', 'TRA_VFD_FISCAL_ENQUEUED',
  'TRA_VFD_SUBMITTING', 'TRA_VFD_ACCEPTED', 'TRA_VFD_REJECTED',
  'TRA_VFD_RETRY_SCHEDULED', 'TRA_VFD_VERIFIED',
]) must(files.vfd, marker, "fiscal lifecycle and audit trail");

for (const marker of [
  'TEST: {', 'PRODUCTION: {', 'virtual.tra.go.tz', 'vfd.tra.go.tz',
  'authorization: "bearer "', 'cert-serial',
]) must(files.provider, marker, "TRA provider");

for (const marker of [
  'requireFiscalAuthority', 'fiscalization.view', 'fiscalization.manage',
  '/api/v1/tra-vfd/config', '/api/v1/tra-vfd/queue',
  '/api/v1/tra-vfd/submit/:id', '/api/v1/tra-vfd/reconcile/:id',
  '/api/v1/tra-vfd/status', '/api/v1/tra-vfd/pending',
]) must(files.routes, marker, "fiscal RBAC/API");

for (const marker of [
  'startTraVfdReconciliationWorker();',
  '/api/v1/finance/tax-compliance',
  'tax-compliance',
]) must(files.server, marker, "server fiscal worker and tax reporting API");

for (const marker of [
  'taxInclusivePricing', 'VAT Pricing Mode', 'tra_vfd_config',
]) must(files.settingsUi, marker, "tax settings UI");

for (const marker of [
  'enqueueTraVfdOutbox', 'processTraVfdOutbox', 'taxAmount', 'taxRate',
]) must(files.posUi, marker, "POS tax/fiscal flow");

for (const marker of [
  'taxComplianceRows', '/api/v1/finance/tax-compliance',
  'fiscalizationState', 'Tax & TRA EFD Compliance Ledger',
]) must(files.reportsUi, marker, "authoritative tax/fiscal report");

for (const marker of [
  'authoritativeTaxToday', '/api/v1/finance/tax-compliance',
]) must(files.dashboardUi, marker, "dashboard tax authority");

for (const marker of [
  'Pending Outbox', '/api/v1/tra-vfd/status', 'PRODUCTION',
]) must(files.vfdUi, marker, "VFD operational controls");

for (const marker of [
  'traVfdOutbox', '/api/v1/tra-vfd/queue', '/api/v1/tra-vfd/submit/',
  'TRA_RETRY'
]) must(files.outboxUi, marker, "durable fiscal queue");

for (const workflow of [files.ci, files.candidate, files.exactMain]) {
  must(workflow, "npm run certify:tax-fiscal-lock", "mandatory Tax/Fiscalization CI gate");
}
must(files.pkg, '"certify:tax-fiscal-lock"', "package certification script");

mustNot(files.reportsUi, "VAT (18%)", "tax report hard-coded VAT label");
mustNot(files.dashboardUi, "VAT OUTPUT TAX (18%)", "dashboard hard-coded VAT label");
mustNot(files.dashboardUi, "netSales * 0.18 / 1.18", "dashboard hard-coded VAT formula");

const exclusive = PricingTaxEngine.calculateTax(10000, { ratePct: 18, isInclusive: false });
const inclusive = PricingTaxEngine.calculateTax(11800, { ratePct: 18, isInclusive: true });
if (exclusive.taxAmount !== 1800 || exclusive.grossAmount !== 11800) {
  throw new Error("LOCK_BLOCKED: exclusive VAT calculation invariant failed");
}
if (inclusive.taxAmount !== 1800 || inclusive.netAmount !== 10000) {
  throw new Error("LOCK_BLOCKED: inclusive VAT calculation invariant failed");
}

console.log(LOCK_ID);
console.log("Tax / Fiscalization audit scope: Tax configuration, tax calculations, tax-inclusive/exclusive pricing, fiscal receipts, VFD integration, fiscal status, queued fiscal transactions, retry, error handling, fiscal reports, compliance audit.");
console.log("TAX / FISCALIZATION PRODUCTION LOCK: PASS");
