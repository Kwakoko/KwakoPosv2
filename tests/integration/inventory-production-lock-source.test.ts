import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../..");

describe("Inventory Production Lock v1 source contract", () => {
  it("has durable transfer/count/bundle/wastage models", () => {
    const schema = fs.readFileSync(path.join(root, "packages/database/prisma/schema.prisma"), "utf8");
    expect(schema).toContain("model StockTransfer");
    expect(schema).toContain("model StockTransferItem");
    expect(schema).toContain("model StockCount");
    expect(schema).toContain("model StockCountItem");
    expect(schema).toContain("model ProductBundle");
    expect(schema).toContain("model ProductBundleItem");
    expect(schema).toContain("model WastageRecord");
  });

  it("removes process-memory count sessions and keeps count math pure", () => {
    const source = fs.readFileSync(path.join(root, "packages/domain/src/stockCountEngine.ts"), "utf8");
    expect(source).not.toContain("new Map<string, StockCountSession>()");
    expect(source).not.toContain("private sessions");
    expect(source).toContain("applyCountToLine");
    expect(source).toContain("recalculateStockCountSession");
  });

  it("routes price commits through durable ProductPriceHistory", () => {
    const page = fs.readFileSync(path.join(root, "apps/web/src/pages/InventoryPage.tsx"), "utf8");
    const sync = fs.readFileSync(path.join(root, "packages/sync/src/inventoryProductionLock.ts"), "utf8");
    expect(page).toContain('entityType: "ProductPriceHistory"');
    expect(page).toContain("commitLocalOutboxes");
    expect(sync).toContain('op.entityType === "ProductPriceHistory"');
    expect(page).not.toContain("Version #2 · 11 July 2026");
    expect(page).not.toContain("Supplier Price Increase</em>");
  });

  it("renders real durable workflows for all blocker tabs", () => {
    const page = fs.readFileSync(path.join(root, "apps/web/src/pages/InventoryPage.tsx"), "utf8");
    for (const tab of ["transfers", "count", "recipes", "wastage"]) {
      expect(page).toContain('activeTab === "' + tab + '"');
    }
    const operational = fs.readFileSync(path.join(root, "apps/web/src/components/InventoryOperationalWorkspace.tsx"), "utf8");
    const bundles = fs.readFileSync(path.join(root, "apps/web/src/components/InventoryBundleWorkspace.tsx"), "utf8");
    expect(operational).toContain('entityType: "StockTransfer"');
    expect(operational).toContain('entityType: "StockCount"');
    expect(operational).toContain('entityType: "WastageRecord"');
    expect(bundles).toContain('entityType: "ProductBundle"');
  });

  it("persists product and variant mutations with branch context", () => {
    const page = fs.readFileSync(path.join(root, "apps/web/src/pages/InventoryPage.tsx"), "utf8");
    const saves = page.match(/save(?:Product|Variant)Local\([^\n]+/g) || [];
    expect(saves.length).toBeGreaterThan(0);
    expect(page).not.toContain('saveProductLocal(newProductRecord as any, currentTenantId ? { tenantId: currentTenantId } : undefined)');
    expect(page).not.toContain('saveVariantLocal(defaultVariant as any, currentTenantId ? { tenantId: currentTenantId } : undefined)');
  });

  it("uses the same transactional inventory authority for sync commands", () => {
    const sync = fs.readFileSync(path.join(root, "packages/sync/src/worldStandardPrismaSyncEngine.ts"), "utf8");
    expect(sync).toContain("applyInventoryProductionLockOperation");
    expect(sync).toContain("this.productRepo.recordPriceChange");
    expect(sync).toContain("journalGeneratedStockLedgers");
  });
});
