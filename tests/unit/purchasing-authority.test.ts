import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

describe("Purchasing closed-loop authority", () => {
  it("keeps Purchasing UI free of configuration-backed business mutations", () => {
    const page = read("apps/web/src/pages/PurchasingPage.tsx");
    expect(page).not.toContain("saveConfigurationLocal");
    expect(page).not.toContain('store: "stockLedger"');
    expect(page).not.toContain('procurement_purchase_orders');
    expect(page).not.toContain('procurement_suppliers');
    expect(page).not.toContain("balance - debtPayAmount");
    expect(page).toContain('/api/v1/purchases');
    expect(page).toContain('/api/v1/purchases/receipts');
    expect(page).toContain('/api/v1/finance/payables/settle-supplier');
    expect(page).toContain('entityType: "PurchaseOrder"');
    expect(page).toContain('entityType: "PurchaseReceipt"');
    expect(page).toContain('entityType: "Payment"');
  });

  it("uses PostgreSQL routes for supply-chain Purchasing and never the legacy in-memory engine", () => {
    const server = read("apps/api/src/server.ts");
    const start = server.indexOf("// ── Supply Chain Operating Layer — PostgreSQL-authoritative Purchasing");
    const end = server.indexOf('server.get("/api/v1/supply-chain/replenishment"', start);
    const purchasingRoutes = server.slice(start, end);
    expect(purchasingRoutes).not.toContain("globalSupplyChainService");
    expect(purchasingRoutes).toContain("commercialRepository.getSuppliers");
    expect(purchasingRoutes).toContain("commercialRepository.createPurchaseOrder");
    expect(purchasingRoutes).toContain("commercialRepository.approvePurchaseOrder");
    expect(purchasingRoutes).toContain("commercialRepository.sendPurchaseOrder");
    expect(purchasingRoutes).toContain("commercialRepository.performThreeWayMatch");
  });

  it("supports authoritative offline replay for PO, receipt and supplier payment mutations", () => {
    const sync = read("packages/sync/src/worldStandardPrismaSyncEngine.ts");
    expect(sync).toContain('op.entityType === "PurchaseOrder" && op.operationType === "CREATE"');
    expect(sync).toContain('op.entityType === "PurchaseReceipt" && op.operationType === "CREATE"');
    expect(sync).toContain('op.entityType === "Payment" && op.operationType === "CREATE"');
    expect(sync).toContain("SUPPLIER_NOT_FOUND");
    expect(sync).toContain("PAYMENT_EXCEEDS_OUTSTANDING_PAYABLE");
  });
});
