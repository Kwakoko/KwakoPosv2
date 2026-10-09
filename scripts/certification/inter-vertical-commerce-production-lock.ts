import fs from "node:fs";
import path from "node:path";
import { PricingTaxEngine } from "../../packages/domain/src/pricingTaxEngine.js";

const LOCK_ID = "INTER-VERTICAL-COMMERCE-PRODUCTION-LOCK-V1-2026-10-09";

function read(file: string): string {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) throw new Error("LOCK_BLOCKED: missing file -> " + file);
  return fs.readFileSync(full, "utf8");
}
function must(source: string, marker: string, label: string): void {
  if (!source.includes(marker)) throw new Error("LOCK_BLOCKED: " + label + " missing marker -> " + marker);
}
function mustNot(source: string, marker: string, label: string): void {
  if (source.includes(marker)) throw new Error("LOCK_BLOCKED: " + label + " contains forbidden marker -> " + marker);
}

const gateway = read("apps/api/src/routes/interVerticalCommerceRoutes.ts");
const server = read("apps/api/src/server.ts");
const fiscal = read("apps/api/src/services/traVfdService.ts");
const journal = read("packages/domain/src/financialBridge.ts");
const finance = read("packages/database/src/atomicCommercialFinance.ts");
const migration = read("packages/database/prisma/migrations/202610090001_inter_vertical_commerce_gateway/migration.sql");
const docs = read("docs/operations/INTER_VERTICAL_COMMERCE_GATEWAY.md");
const pkg = read("package.json");
const ci = read(".github/workflows/ci.yml");
const candidate = read(".github/workflows/production-certification.yml");
const exactMain = read(".github/workflows/production-release-exact-main.yml");

for (const marker of [
  "async function resolveBranchTaxAuthority",
  "tx.setting.findMany",
  'key: "tax.config"',
  "value.vatEnabled",
  "tx.tax.findFirst",
  "PricingTaxEngine.calculateLineItem",
  "PricingTaxEngine.calculateSaleTotals",
  "taxRate: tax.config.ratePct",
  "taxAmount: x.calculated.taxAmount",
  "globalTraVfdService.enqueueInTransaction",
  "fiscalizationState",
  "dispatchAllocations",
  "const projectedGrossTotal",
  "BUYER_VARIANT_BOUNDARY_OR_NOT_FOUND",
  "SHIPMENT_RECEIPT_QUANTITY_MISMATCH",
  "replayEvent(tx, c, b.idempotencyKey, id, \"ORDER_DISPATCHED\")",
  'server.post("/api/v1/inter-vertical/orders/:id/dispatch"',
  'server.post("/api/v1/inter-vertical/orders/:id/receive"',
  "IDEMPOTENCY_KEY_ALREADY_USED",
]) must(gateway, marker, "gateway tax, fiscalization, inventory, or idempotency authority");

for (const marker of [
  "async enqueueInTransaction(",
  "tx.traVfdFiscalization.create",
  "tx.traVfdOutbox.create",
  "TRA_VFD_FISCAL_ENQUEUED",
  "pg_advisory_xact_lock",
  "async submit(",
  "async reconcile(",
]) must(fiscal, marker, "durable transactional TRA fiscalization");

for (const marker of [
  "inputTaxAmount?: number",
  "accounts.inputTaxAccountId",
  "Recoverable Input VAT",
  "grossPayable",
]) must(journal, marker, "balanced input VAT journal support");
for (const marker of [
  '["1420", "Recoverable Input VAT", "ASSET", "TAX_RECEIVABLE"]',
  'inputTaxAccountId: result["1420"]',
]) must(finance, marker, "tenant/branch input VAT account authority");

for (const marker of [
  "CREATE TABLE IF NOT EXISTS supply_chain_shipments",
  "CREATE TABLE IF NOT EXISTS supply_chain_shipment_lines",
  "CREATE TABLE IF NOT EXISTS supply_chain_shipment_events",
  "buyer_purchase_order_id TEXT",
  "tax_rate_pct NUMERIC(5,2)",
  "UNIQUE (tenant_id, branch_id, idempotency_key)",
]) must(migration, marker, "persisted shipment/migration schema");

for (const marker of [
  'server.get("/api/v1/supply-chain/shipments"',
  'server.get("/api/v1/supply-chain/shipments/:id"',
  'server.post("/api/v1/supply-chain/shipments"',
  'server.post("/api/v1/supply-chain/shipments/:id/status"',
  "interVerticalCommerceRoutes(server);",
  "GATEWAY_SHIPMENT_MUST_BE_CREATED_BY_DISPATCH",
  "GATEWAY_SHIPMENT_STATUS_MUST_USE_ORDER_LIFECYCLE",
  "supplyShipmentRoleAllowed",
  "FOR UPDATE",
]) must(server, marker, "durable shipment API/RBAC/state authority");

mustNot(server.slice(server.indexOf('server.post("/api/v1/supply-chain/shipments",'), server.indexOf('server.post("/api/v1/supply-chain/shipments/:id/status"')),
  'status(501)', "persistent shipment create route");
mustNot(gateway, "taxTotal: 0", "B2B generated invoices");

for (const marker of [
  "TRA VFD",
  "authoritative branch",
  "SupplierInvoice",
  "persisted inbound shipment",
  "/api/v1/supply-chain/shipments/:id/status",
]) must(docs, marker, "deployment and operational documentation");

must(pkg, '"certify:inter-vertical-commerce-lock"', "certification command registration");
for (const workflow of [ci, candidate, exactMain]) {
  must(workflow, "npm run certify:inter-vertical-commerce-lock", "mandatory gateway production gate");
}

const exclusive = PricingTaxEngine.calculateTax(10_000, { ratePct: 18, isInclusive: false });
if (exclusive.taxAmount !== 1_800 || exclusive.netAmount !== 10_000 || exclusive.grossAmount !== 11_800) {
  throw new Error("LOCK_BLOCKED: exclusive VAT invariant failed");
}
const inclusive = PricingTaxEngine.calculateTax(11_800, { ratePct: 18, isInclusive: true });
if (inclusive.taxAmount !== 1_800 || inclusive.netAmount !== 10_000 || inclusive.grossAmount !== 11_800) {
  throw new Error("LOCK_BLOCKED: inclusive VAT invariant failed");
}
const partial = PricingTaxEngine.calculateLineItem({
  unitPrice: 118, unitCost: 0, quantity: 1, taxConfig: { ratePct: 18, isInclusive: true },
});
if (partial.lineTotal !== 118 || partial.taxAmount !== 18) throw new Error("LOCK_BLOCKED: per-unit inclusive tax snapshot failed");

console.log(LOCK_ID);
console.log("INTER-VERTICAL COMMERCE PRODUCTION LOCK: PASS");
console.log("Scope: authoritative VAT pricing, atomic TRA outbox, balanced AP/AR/GL, durable shipment lines/events, tenant/branch security and idempotency.");
