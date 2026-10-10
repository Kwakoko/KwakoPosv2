import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const LOCK_ID = "INVENTORY-PRODUCTION-LOCK-2026-10-06";
const REQUIRED_SUBITEMS = [
  "Inventory Overview", "Products", "Categories & Brands", "Stock Adjustment",
  "Stock Transfer", "Stock Alerts", "Stock Sync Engine", "Product Bundles & Kits",
  "Stock Count", "Ledger Drilldown", "Wastage & Spillage", "Inventory Reports",
];

const LOCKED_BLOBS: Record<string, string> = {
  "apps/web/src/pages/InventoryPage.tsx": "1aada87ec4442b426973a2bba97c3d920fa86f04",
  "apps/web/src/services/inventoryStockService.ts": "5fadbef7dc8de26e7bc93ce95547cf7a9c8f7e3b",
  "apps/web/src/services/inventoryReconciliationService.ts": "2515ffe79c5ed7462607029a30532686cd73c4eb",
  "tests/unit/inventory-reconciliation-scope.test.ts": "973c36fbf2f7a5c23aea341078bd5c0c5d59b9f7",
  "packages/database/src/prismaRepositories.ts": "5d31f47aaead4b906d7e30cf275b0c3b782a048d",
  "packages/database/src/inventoryAuthority.ts": "fd3d915de4ac1851a562ee3554c5598d71529cc9",
  "packages/sync/src/worldStandardPrismaSyncEngine.ts": "0a14912d599d3e325c48759d4b25366e79f1453d",
  "apps/web/src/indexedDb.ts": "1893f5704481b7a7178e80622b99a8c4ae42376c",
  "apps/web/src/clientSyncEngine.ts": "dc09da367ef05f11bdbf2b03e0660ca9257146ae",
  "tests/unit/stock-ledger-movement.test.ts": "d24fcfb9a39a76b8d60a282ce2c4401c07e7bb2c",
  "tests/integration/prisma-stock-convergence.test.ts": "82e2aa06c495b74482ded929ce2e1fdda3671cd9",
  "tests/integration/catalog-master-lifecycle.test.ts": "3912fadfd502e9df6543b36e8742ae254d3fff7a",
  "tests/integration/tenant-clean-initial-state.test.ts": "0a115000cc032fef05df7e0e954fe46704be2c44",
};

const MARKERS: Array<[string, string, ...string[]]> = [
  ["inventory-subitems", "apps/web/src/pages/InventoryPage.tsx", ...REQUIRED_SUBITEMS],
  ["reverse-binding", "apps/web/src/pages/InventoryPage.tsx", "selectInventoryTab", "globalTab", "propActiveTab"],
  ["ledger-authority", "apps/web/src/services/inventoryStockService.ts", "buildStockBalanceProjection", "queueStockAdjustment", "Stock Ledger is authoritative"],
  ["tenant-branch-stock", "packages/database/src/prismaRepositories.ts", "assertTenantIsolation(ctx", "recordMovement"],
  ["inventory-authority", "packages/database/src/inventoryAuthority.ts", "rejectAbsoluteInventoryMutation", "projectProductBranchStock"],
  ["sync-authority", "packages/sync/src/worldStandardPrismaSyncEngine.ts", "INVENTORY_MUTATION_REQUIRES_STOCK_LEDGER", "tenantId: ctx.tenantId", "branchId: ctx.branchId"],
  ["indexeddb-ledger", "apps/web/src/indexedDb.ts", "stockLedger", "categories", "brands"],
  ["bootstrap-reconcile", "apps/web/src/clientSyncEngine.ts", "defaultBootstrapApi", "reconcileInventory", "inventory_categories_meta", "inventory_brands_meta"],
  ["strict-local-reconciliation", "apps/web/src/services/inventoryReconciliationService.ts", "hasExactTenantBranchScope", "SYNC_CONTEXT_REQUIRED", "outOfScopeRelatedVariant"],
  ["valuation", "packages/domain/src/inventoryValuationEngine.ts", "InventoryValuationEngine", "Weighted Average Unit Cost"],
  ["clean-master-data", "apps/web/src/pages/InventoryPage.tsx", "DEFAULT_CATEGORY_RECORDS: CategoryRecord[] = []", "DEFAULT_BRAND_RECORDS: BrandRecord[] = []"],
  ["ledger-unit-tests", "tests/unit/stock-ledger-movement.test.ts", "opening stock movement", "Weighted Average Cost"],
  ["prisma-convergence-tests", "tests/integration/prisma-stock-convergence.test.ts", "tenantId", "branchId"],
  ["catalog-lifecycle-tests", "tests/integration/catalog-master-lifecycle.test.ts", "Category", "Brand"],
  ["clean-state-tests", "tests/integration/tenant-clean-initial-state.test.ts", "Product", "Categories", "Brands"],
];

function read(p: string): string {
  const f = path.resolve(process.cwd(), p);
  if (!fs.existsSync(f)) throw new Error("missing file: " + p);
  return fs.readFileSync(f, "utf8");
}
function blobSha(content: string, p: string): string {
  return execFileSync("git", ["hash-object", "--path=" + p, "--stdin"], {
    input: Buffer.from(content),
    encoding: "utf8",
  }).trim();
}

const failures: string[] = [];
const checked: Record<string, { expected: string; actual: string; pass: boolean }> = {};

for (const [p, expected] of Object.entries(LOCKED_BLOBS)) {
  try {
    const actual = blobSha(read(p), p);
    checked[p] = { expected, actual, pass: actual === expected };
    if (actual !== expected) failures.push("LOCK_DRIFT: " + p + " expected " + expected + " got " + actual);
  } catch (e) {
    failures.push("LOCK_READ_FAILURE: " + p + ": " + String(e));
  }
}

for (const [name, p, ...needles] of MARKERS) {
  try {
    const source = read(p);
    for (const needle of needles) {
      if (!source.includes(needle)) failures.push("CONTRACT_FAILURE: " + name + " missing marker: " + needle);
    }
  } catch (e) {
    failures.push("CONTRACT_READ_FAILURE: " + name + ": " + String(e));
  }
}

const result = {
  lockId: LOCK_ID,
  verdict: failures.length === 0 ? "PASS" : "FAIL",
  subitems: REQUIRED_SUBITEMS,
  lockedFiles: Object.keys(LOCKED_BLOBS).length,
  failures,
  checked,
  generatedAt: new Date().toISOString(),
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
console.log("INVENTORY PRODUCTION LOCK: PASS — " + LOCK_ID);
