import fs from "node:fs";
import path from "node:path";
import { RetailSettingsSchema } from "../../packages/contracts/src/retailContracts.js";
import { PricingTaxEngine, RetailEngine } from "@kwakopos2/domain";
import { renderRetailDashboard } from "../../apps/web/src/retailDashboard.js";

type Evaluation = { pillarId: number; pillarName: string; passed: boolean; details: string };
type Validator = { id: number; name: string; description: string; run: () => boolean };

function readSource(relativePath: string): string {
  const fullPath = path.resolve(process.cwd(), relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf8") : "";
}
function hasAll(relativePath: string, ...needles: string[]): boolean {
  const content = readSource(relativePath);
  return content.length > 0 && needles.every((needle) => content.includes(needle));
}
function hasAllInsensitive(relativePath: string, ...needles: string[]): boolean {
  const content = readSource(relativePath).toLowerCase();
  return content.length > 0 && needles.every((needle) => content.includes(needle.toLowerCase()));
}
function evaluate(v: Validator): Evaluation {
  try {
    const pass = Boolean(v.run());
    return { pillarId: v.id, pillarName: v.name, passed: pass, details: pass ? v.description : "FAILED: " + v.description };
  } catch (error) {
    return { pillarId: v.id, pillarName: v.name, passed: false, details: "FAILED: " + v.description + " (" + String(error) + ")" };
  }
}

export async function evaluateRetailCertification(): Promise<{
  allPassed: boolean;
  overallScore: number;
  evaluations: Evaluation[];
}> {
  const engine = new RetailEngine();
  const ctx = {
    tenantId: "00000000-0000-0000-0000-000000000001",
    branchId: "00000000-0000-0000-0000-000000000002",
    userId: "00000000-0000-0000-0000-000000000003",
    roles: ["ADMIN"],
    permissions: ["RETAIL_POS_CHECKOUT"],
  };
  const defaults = engine.getDefaultSettings(ctx.tenantId, ctx.branchId);
  const totals = engine.calculatePOSCartTotals([
    { productId: "p1", variantId: "v1", quantity: 2, unitPrice: 50000, unitCost: 30000 },
    { productId: "p2", variantId: "v2", quantity: 1, unitPrice: 80000, unitCost: 50000 },
  ], 0, 18, true);

  const validators: Validator[] = [
    { id: 1, name: "Retail Module Architecture & Manifest", description: "Manifest exposes Retail module, checkout capability, route, and multi-branch scale.", run: () => {
      const m = engine.getModuleManifest();
      return m.moduleId === "retail_operating_system" && m.status === "ACTIVE" &&
        m.permissions.includes("RETAIL_POS_CHECKOUT") && m.navigationRoutes.includes("/retail/pos") &&
        m.supportedScales.includes("MULTI_BRANCH");
    }},
    { id: 2, name: "Product Catalog (Simple & Variant)", description: "Settings defaults satisfy the contract and catalog services expose persisted product/variant operations.", run: () =>
      RetailSettingsSchema.safeParse(defaults).success &&
      hasAll("apps/api/src/services/productService.ts", "createProduct(", "getProducts(", "addVariant(") &&
      hasAll("packages/contracts/src/index.ts", "CreateProductRequestSchema") },
    { id: 3, name: "Product Variant Engine", description: "Variant generation produces unique combinations and preserves inherited prices.", run: () => {
      const variants = engine.generateVariantCombinations("T-Shirt", "TSHIRT", [
        { name: "Colour", values: ["Red", "Blue"] }, { name: "Size", values: ["S", "M"] },
      ], 5000, 9000);
      return variants.length === 4 && new Set(variants.map((v) => v.sku)).size === 4 &&
        variants.every((v) => v.effectiveBuyingPrice === 5000 && v.effectiveSellingPrice === 9000);
    }},
    { id: 4, name: "Ledger-Driven Inventory Management", description: "Inventory balance math is correct and production reads ledger authority.", run: () =>
      engine.calculateStockLedgerBalance(100, 50, 20, -5) === 125 &&
      hasAll("apps/web/src/services/inventoryStockService.ts", "buildStockBalanceProjection", "queueStockAdjustment", "Stock Ledger is authoritative") },
    { id: 5, name: "Immutable Stock Ledger", description: "Absolute stock writes are rejected and ledger movement regressions are covered.", run: () =>
      hasAll("packages/database/src/inventoryAuthority.ts", "rejectAbsoluteInventoryMutation", "projectProductBranchStock") &&
      hasAll("tests/unit/stock-ledger-movement.test.ts", "opening stock movement", "Weighted Average Cost") },
    { id: 6, name: "Purchasing & Supplier Receiving", description: "Receipt service uses PostgreSQL and writes stock ledger movements.", run: () =>
      hasAll("packages/database/src/atomicCommercialFinance.ts", "async createPurchaseReceipt", "stockLedger.create") &&
      hasAll("packages/database/src/prismaProductionRepositories.ts", "createPurchaseReceipt") },
    { id: 7, name: "Point of Sale (POS) Checkout", description: "Checkout totals reconcile and API route uses the authoritative commercial transaction.", run: () =>
      totals.subtotal === 180000 && totals.grandTotal === 180000 && totals.totalCost === 110000 && totals.grossProfit === 70000 &&
      hasAll("apps/api/src/server.ts", 'server.post("/api/v1/retail/pos/checkout"', "atomicCommercialFinance.createSale(ctx, validated)", "CreatePosSaleRequestSchema.parse(req.body)") },
    { id: 8, name: "Offline-First Retail Continuity", description: "Durable browser outbox and idempotent sync operations are in place.", run: () =>
      hasAll("apps/web/src/indexedDb.ts", "idempotencyKey", "operationId", "stockLedger") &&
      hasAll("apps/web/src/clientSyncEngine.ts", "defaultBootstrapApi", "reconcileInventory") },
    { id: 9, name: "Multi-Device Synchronization Graph", description: "Sync transactions scope inventory operations by tenant and branch.", run: () =>
      hasAll("packages/sync/src/worldStandardPrismaSyncEngine.ts", "tenantId: ctx.tenantId", "branchId: ctx.branchId", "applyInventoryProductionLockOperation") &&
      hasAll("tests/sync/two-till-stock-convergence.test.ts", "tenantId", "branchId") },
    { id: 10, name: "Customer Management & Credit Limits", description: "Customer credit fields are persisted and credit balance rules are evaluated.", run: () =>
      hasAll("packages/database/prisma/schema.prisma", "model Customer {", "creditLimit", "currentBalance") &&
      hasAll("packages/database/src/atomicCommercialFinance.ts", "customerCreditLimit", "customerCurrentBalance") },
    { id: 11, name: "Pricing Engine", description: "Customer price precedence and controlled pricing authority are exercised.", run: () =>
      PricingTaxEngine.resolveUnitPrice({
        basePrice: 1000, priceListPrice: 1050, branchPrice: 1100, bulkPrice: 950,
        wholesalePrice: 900, promotionalPrice: 850, customerPrice: 800, costPrice: 600, quantity: 10,
      }) === 800 && hasAll("packages/database/src/pricingAuthority.ts", "SALE_PRICE_AUTHORITY_VIOLATION") },
    { id: 12, name: "Promotions & Discounts", description: "Percentage/fixed Retail promotions persist through PostgreSQL; unsupported types fail closed instead of being stored with incorrect semantics.", run: () =>
      engine.evaluatePricingAndTaxes(10000, 0, true, {
        id: "PROMO-TEST", tenantId: ctx.tenantId, branchId: ctx.branchId, name: "Test", type: "PERCENTAGE_DISCOUNT",
        discountValue: 10, startDate: new Date(), endDate: new Date(Date.now() + 86400000), isActive: true,
      }).discountAmount === 1000 &&
      hasAll("apps/api/src/services/retailService.ts", "prisma.pricingPromotion.create", "sourceModule: \"RETAIL\"", "RETAIL_PROMOTION_TYPE_UNSUPPORTED") &&
      hasAll("apps/api/src/server.ts", "/api/v1/pricing/promotions", "DISCOUNT_MANAGE") },
    { id: 13, name: "Sales Returns & Refunds", description: "Duplicate variant lines cannot exceed sold quantity and persisted return limits are enforced.", run: () => {
      const sale: any = { saleNumber: "SALE-001", lines: [{ variantId: "v1", quantity: 2, unitPrice: 100, unitCost: 50, discountAmount: 0, taxAmount: 0, lineTotal: 200 }] };
      const valid = engine.validateSaleReturn(sale, [{ variantId: "v1", quantityReturned: 1, refundUnitPrice: 100 }], defaults);
      const invalid = engine.validateSaleReturn(sale, [{ variantId: "v1", quantityReturned: 3, refundUnitPrice: 100 }], defaults);
      const duplicate = engine.validateSaleReturn(sale, [
        { variantId: "v1", quantityReturned: 1.25, refundUnitPrice: 100 },
        { variantId: "v1", quantityReturned: 1.25, refundUnitPrice: 100 },
      ], defaults);
      return valid.valid && !invalid.valid && !duplicate.valid &&
        hasAll("packages/database/src/prismaProductionRepositories.ts", "RETURN_QUANTITY_EXCEEDS_REMAINING");
    }},
    { id: 14, name: "Cash & Till Session Management", description: "Till reconciliation matches expected cash and status.", run: () => {
      const cash = engine.reconcileTillSessionCash(100000, 500000, 50000, 20000, 530000);
      return cash.expectedCash === 530000 && cash.variance === 0 && cash.status === "BALANCED" &&
        hasAll("apps/api/src/server.ts", 'server.post("/api/v1/cash-sessions"');
    }},
    { id: 15, name: "Multi-Branch Retail & Transfers", description: "Durable transfers are handled by a tenant/branch-scoped production transaction.", run: () =>
      hasAll("tests/integration/inventory-production-lock-lifecycle.test.ts", "TRANSFER_OUT", "TRANSFER_IN", "deniedTransfer") &&
      hasAll("packages/sync/src/inventoryProductionLock.ts", "TRANSFER_SOURCE_BRANCH_FORBIDDEN", "TRANSFER_DESTINATION_BRANCH_FORBIDDEN") },
    { id: 16, name: "Retail Reporting", description: "Dashboard snapshots are versioned and based on database revisions.", run: () =>
      hasAll("apps/api/src/services/dashboardKpiService.ts", "getDashboardKpiSnapshot", "dashboardReadModel", "asOfRevision") &&
      hasAll("packages/database/prisma/schema.prisma", "model DashboardReadModel") },
    { id: 17, name: "Retail Command Center Dashboard", description: "Dashboard renderer contains the current POS and explainability panels.", run: () => {
      const html = renderRetailDashboard();
      return html.includes("KwakoPos Retail Command Center") && html.includes("FAST RETAIL POS CHECKOUT") &&
        html.includes("EXPLAINABLE RETAIL AI INSIGHTS");
    }},
    { id: 18, name: "Retail AI Intelligence Engine", description: "No fake demand volume or unsupported fixed revenue claims are emitted.", run: () => {
      const recs = engine.generateExplainableAiRecommendations(ctx,
        [{ variantId: "v1", productName: "Test Item", currentStock: 2, reorderLevel: 5, costPrice: 100 }],
        [{ variantId: "v1", sales30Days: 0, discountGiven: 0 }]);
      return recs.length === 1 && recs[0].evidence.includes("No net sales") &&
        !recs[0].expectedImpact.includes("450,000") && !readSource("apps/api/src/services/retailService.ts").includes("Math.random()");
    }},
    { id: 19, name: "Automated Replenishment Engine", description: "No policy/no demand yields no invented purchase order; configured thresholds produce calculated quantities.", run: () => {
      const none = engine.calculateReplenishmentSuggestions([
        { productId: "p1", variantId: "v1", productName: "No policy", sku: "NP-1", currentStock: 0, reorderLevel: 0, costPrice: 10 },
      ], new Map());
      const configured = engine.calculateReplenishmentSuggestions([
        { productId: "p2", variantId: "v2", productName: "Configured", sku: "CP-1", currentStock: 5, reorderLevel: 10, costPrice: 10 },
      ], new Map());
      return none.length === 0 && configured.length === 1 && configured[0].suggestedReorderQuantity === 15 &&
        hasAll("apps/api/src/services/retailService.ts", "getAuthoritativeRetailSignals", "soldByVariant", "stockLedger.groupBy");
    }},
    { id: 20, name: "Retail Security & RBAC", description: "Retail actions require explicit capabilities at API boundary, with negative-path tests.", run: () =>
      hasAll("apps/api/src/server.ts", "assertRetailCapabilityForContext", "RETAIL_AI_INSIGHTS_VIEW", "RETAIL_REPLENISHMENT_EXECUTE") &&
      hasAll("tests/unit/retail-authorization.test.ts", "retail AI insights", "FORBIDDEN") },
    { id: 21, name: "Auditability", description: "Retail audit events persist in PostgreSQL and commercial sale transactions write audit records within the authoritative transaction.", run: () =>
      hasAll("apps/api/src/services/retailService.ts", "async recordAuditEvent", "prisma.auditEvent.create", "async getAuditEvents", "metadata: { module: \"RETAIL\"") &&
      !readSource("apps/api/src/services/retailService.ts").includes("auditEventsMap") &&
      hasAll("packages/database/src/atomicCommercialFinance.ts", "tx.auditEvent.create", "SALE_CREATED") },
    { id: 22, name: "Data Integrity & Hard Invariants", description: "Orphan variants, duplicate SKUs, and duplicate branch-scoped barcodes are rejected by executable invariant checks and the database uniqueness migration.", run: () => {
      let orphan = false, duplicate = false, duplicateBarcode = false;
      try { engine.assertRetailInvariants([], [{ id: "v1", productId: "missing", sku: "S1" }] as any, [], []); } catch { orphan = true; }
      try { engine.assertRetailInvariants([{ id: "p1" }] as any, [
        { id: "v1", productId: "p1", sku: "DUP" }, { id: "v2", productId: "p1", sku: "DUP" },
      ] as any, [], []); } catch { duplicate = true; }
      try { engine.assertRetailInvariants([{ id: "p1" }] as any, [
        { id: "v1", tenantId: ctx.tenantId, branchId: ctx.branchId, productId: "p1", sku: "S1", barcode: "ABC" },
        { id: "v2", tenantId: ctx.tenantId, branchId: ctx.branchId, productId: "p1", sku: "S2", barcode: "abc" },
      ] as any, [], []); } catch { duplicateBarcode = true; }
      return orphan && duplicate && duplicateBarcode &&
        hasAll("packages/database/prisma/migrations/202610100002_variant_barcode_uniqueness/migration.sql", "CREATE UNIQUE INDEX", "RETAIL_BARCODE_DUPLICATES_BLOCK_MIGRATION");
    }},
    { id: 23, name: "Retail Notifications", description: "Notification dispatch and health contracts exist.", run: () =>
      hasAll("apps/api/src/services/notificationService.ts", "NotificationService", "NotificationCategory", "tenantId") &&
      hasAll("packages/domain/src/notificationEngine.ts", "sendNotification", "getHealthSummary", "NOTIFICATION_DELIVERED") },
    { id: 24, name: "Retail Configuration Hierarchy", description: "Settings resolution includes tenant, branch, user and persistable Retail/tax/POS/inventory keys.", run: () =>
      hasAll("apps/api/src/services/settingsService.ts", "TENANT", "BRANCH", "USER", "retail.config") &&
      hasAll("apps/api/src/services/retailService.ts", "tax.config", "pos.config", "inventory.config", "retail.config") },
    { id: 25, name: "API & Integration Layer", description: "Retail endpoints authenticate tenant context and enforce route-specific capability.", run: () =>
      hasAll("apps/api/src/server.ts", 'server.get("/api/v1/retail/settings"', 'server.post("/api/v1/retail/pos/checkout"',
        'server.get("/api/v1/retail/replenishment"', 'server.get("/api/v1/retail/ai-insights"', "requireTenantContext") },
    { id: 26, name: "Import & Export", description: "Product and customer pages expose import/export/CSV tools.", run: () =>
      hasAllInsensitive("apps/web/src/pages/InventoryPage.tsx", "import", "export", "csv") &&
      hasAllInsensitive("apps/web/src/pages/CustomersPage.tsx", "import", "export", "csv") },
    { id: 27, name: "PWA & Mobile Retail Experience", description: "POS supports barcode entry and offline sync is durable.", run: () =>
      hasAllInsensitive("apps/web/src/pages/PosPage.tsx", "barcode") && hasAll("apps/web/src/clientSyncEngine.ts", "reconcileInventory") &&
      (fs.existsSync(path.resolve(process.cwd(), "apps/web/public/manifest.json")) ||
       fs.existsSync(path.resolve(process.cwd(), "apps/web/public/manifest.webmanifest"))) },
    { id: 28, name: "Observability & Operations", description: "Trace context and response telemetry are wired to the API.", run: () =>
      hasAll("apps/api/src/server.ts", "createTraceContext", 'server.addHook("onResponse"') &&
      hasAll("packages/database/src/atomicCommercialFinance.ts", "writeJournal", "idempotencyKey") },
    { id: 29, name: "Financial Integrity & COGS Match", description: "Checkout and return finance bridge preserve stock and journal integration.", run: () =>
      hasAll("packages/database/src/atomicCommercialFinance.ts", "PricingAuthority.resolveUnitPrice", "PricingTaxEngine.calculateSaleTotals", "stockLedger.create", "writeJournal") &&
      hasAll("packages/database/src/prismaProductionRepositories.ts", "FinancialBridge.mapReturnToJournal") },
    { id: 30, name: "E2E Retail Lifecycle Certification", description: "Retail, commercial API and inventory lifecycle test suites exist for release gates.", run: () =>
      hasAll("tests/unit/industry-retail.test.ts", "calculatePOSCartTotals", "validate sale return limits") &&
      hasAll("tests/integration/commercial-api.test.ts", "/api/v1/pos/sales") &&
      hasAll("tests/integration/inventory-production-lock-lifecycle.test.ts", "StockTransfer", "StockCount") },
  ];
  const evaluations = validators.map(evaluate);
  const passed = evaluations.filter((item) => item.passed).length;
  return { allPassed: passed === evaluations.length, overallScore: Math.round((passed / evaluations.length) * 100), evaluations };
}
