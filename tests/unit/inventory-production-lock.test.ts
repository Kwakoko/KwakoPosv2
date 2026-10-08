import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Inventory Production Lock v1 contract", () => {
  it("defines all 12 locked Inventory surfaces", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "scripts/certification/inventory-production-lock.ts"), "utf8");
    for (const name of [
      "Inventory Overview", "Products", "Categories & Brands", "Stock Adjustment",
      "Stock Transfer", "Stock Alerts", "Stock Sync Engine", "Product Bundles & Kits",
      "Stock Count", "Ledger Drilldown", "Wastage & Spillage", "Inventory Reports",
    ]) expect(source).toContain(name);
  });

  it("pins the authoritative inventory layers and regression suites", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "scripts/certification/inventory-production-lock.ts"), "utf8");
    for (const file of [
      "apps/web/src/pages/InventoryPage.tsx",
      "apps/web/src/services/inventoryStockService.ts",
      "packages/database/src/prismaRepositories.ts",
      "packages/database/src/inventoryAuthority.ts",
      "packages/sync/src/worldStandardPrismaSyncEngine.ts",
      "apps/web/src/indexedDb.ts",
      "apps/web/src/clientSyncEngine.ts",
      "tests/unit/stock-ledger-movement.test.ts",
      "tests/integration/prisma-stock-convergence.test.ts",
      "tests/integration/catalog-master-lifecycle.test.ts",
      "tests/integration/tenant-clean-initial-state.test.ts",
    ]) expect(source).toContain(file);
  });
});
