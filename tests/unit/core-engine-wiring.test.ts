import { describe, it, expect, beforeEach } from "vitest";
import {
  CoreEngineRegistry,
  bootstrapCorePlatformEngines,
  StockLedgerEngine,
  InventoryEngine,
  ProductCatalogEngine,
  PartyContactEngine,
  UniversalPaymentEngine,
  SalesProcessingEngine,
  PosCheckoutEngine,
  DomainEventBusEngine,
  AuditComplianceEngine,
  TenantOrganizationEngine,
} from "@kwakopos2/domain";
import type { TenantContext } from "@kwakopos2/contracts";

const CTX: TenantContext = {
  tenantId: "tenant-wiring-test-001",
  branchId: "branch-wiring-test-001",
  userId: "user-wiring-test-001",
  roles: ["SUPER_ADMIN"],
} as TenantContext;

describe("Platform Core Business Engine Layer — Comprehensive Wiring & Registry Verification", () => {
  let registry: CoreEngineRegistry;

  beforeEach(() => {
    CoreEngineRegistry.resetInstance();
    StockLedgerEngine.resetInstance();
    InventoryEngine.resetInstance();
    ProductCatalogEngine.resetInstance();
    PartyContactEngine.resetInstance();
    UniversalPaymentEngine.resetInstance();
    SalesProcessingEngine.resetInstance();
    PosCheckoutEngine.resetInstance();
    DomainEventBusEngine.resetInstance();
    AuditComplianceEngine.resetInstance();
    TenantOrganizationEngine.resetInstance();

    registry = CoreEngineRegistry.getInstance();
  });

  it("1. Bootstraps and registers all 10 Foundation and Business Core Engines", () => {
    bootstrapCorePlatformEngines(registry);

    const engines = registry.listEngines();
    expect(engines.length).toBeGreaterThanOrEqual(10);

    const expectedEngines = [
      "core.event_bus",
      "core.audit_compliance",
      "core.tenant_organization",
      "core.party_contact",
      "core.product_catalog",
      "core.stock_ledger",
      "core.inventory",
      "core.universal_payment",
      "core.sales_processing",
      "core.pos_checkout",
    ];

    for (const id of expectedEngines) {
      const descriptor = registry.getEngine(id);
      expect(descriptor).toBeDefined();
      expect(descriptor?.engineId).toBe(id);
      expect(descriptor?.status).toBe("ACTIVE");
      expect(["FOUNDATION", "BUSINESS_CORE"]).toContain(descriptor?.layer);
    }
  });

  it("2. Validates that the dependency topology has zero cycles and valid graph", () => {
    bootstrapCorePlatformEngines(registry);

    const graphValidation = registry.validateDependencies();
    expect(graphValidation.valid).toBe(true);
    expect(graphValidation.cycles.length).toBe(0);
    expect(Object.keys(graphValidation.missingDependencies).length).toBe(0);

    // Foundation engines must be relied on by dependent core engines
    const eventBusDependents = registry.getDependents("core.event_bus");
    expect(eventBusDependents.length).toBeGreaterThanOrEqual(3);
    expect(eventBusDependents).toContain("core.audit_compliance");
  });

  it("3. Executes health checks across all registered core engines and reports 100% HEALTHY", async () => {
    bootstrapCorePlatformEngines(registry);

    const healthReports = await registry.runHealthChecks();
    expect(healthReports.length).toBeGreaterThanOrEqual(10);

    for (const report of healthReports) {
      expect(report.status).toBe("HEALTHY");
      expect(report.timestamp).toBeDefined();
    }
  });

  it("4. Routes commands through the Core Engine Registry CQRS pipeline", async () => {
    bootstrapCorePlatformEngines(registry);

    // Dispatch RecordStockMovement command to StockLedgerEngine via registry
    const movementCommand = {
      commandId: "cmd-move-001",
      engineId: "core.stock_ledger",
      commandName: "RecordStockMovement",
      tenantId: CTX.tenantId,
      branchId: CTX.branchId,
      actorId: CTX.userId,
      issuedAt: new Date().toISOString(),
      idempotencyKey: "idem-move-001",
      payload: {
        tenantId: CTX.tenantId,
        branchId: CTX.branchId,
        variantId: "var-001",
        productId: "prod-001",
        movementType: "PURCHASE_RECEIPT",
        quantityDelta: 100,
        unitCost: 50,
      },
    };

    const result = await registry.executeCommand(CTX, movementCommand);
    expect(result.success).toBe(true);
    expect(result.data?.quantityDelta).toBe(100);
    expect(result.data?.runningBalanceAfter).toBe(100);

    // Query balance through registry
    const balanceResult = await registry.executeQuery<{ currentBalance: number }>(CTX, {
      queryId: "qry-bal-001",
      engineId: "core.stock_ledger",
      queryName: "GetStockBalance",
      tenantId: CTX.tenantId,
      branchId: CTX.branchId,
      parameters: { productId: "prod-001", variantId: "var-001" },
    });
    expect(balanceResult.currentBalance).toBe(100);
  });

  it("5. Verifies end-to-end POS checkout command execution through registry", async () => {
    bootstrapCorePlatformEngines(registry);

    // 1. Create product & variant in Catalog Engine
    const catalogEngine = ProductCatalogEngine.getInstance();
    const product = catalogEngine.createProduct(CTX, {
      tenantId: CTX.tenantId,
      branchId: CTX.branchId || "branch-01",
      name: "Panadol 500mg",
      sku: "PAN-500",
      sellingPrice: 20,
      buyingPrice: 10,
    });

    const variant = catalogEngine.createVariant(CTX, {
      tenantId: CTX.tenantId,
      branchId: CTX.branchId || "branch-01",
      productId: product.id,
      name: "500mg Strip",
      sku: "PAN-500-STRIP",
      sellingPrice: 20,
      buyingPrice: 10,
    });

    // 2. Receive stock in Stock Ledger
    const stockEngine = StockLedgerEngine.getInstance();
    stockEngine.recordMovement(CTX, {
      tenantId: CTX.tenantId,
      branchId: CTX.branchId || "branch-01",
      productId: product.id,
      variantId: variant.id,
      movementType: "PURCHASE_RECEIPT",
      quantityDelta: 50,
      unitCost: 10,
    });

    // 3. Dispatch ProcessCheckout command via registry
    const checkoutCmd = {
      commandId: "cmd-checkout-001",
      engineId: "core.pos_checkout",
      commandName: "ProcessCheckout",
      tenantId: CTX.tenantId,
      branchId: CTX.branchId,
      actorId: CTX.userId,
      issuedAt: new Date().toISOString(),
      idempotencyKey: "idem-checkout-001",
      payload: {
        tenantId: CTX.tenantId,
        branchId: CTX.branchId,
        cashierId: CTX.userId,
        items: [
          {
            productId: product.id,
            variantId: variant.id,
            quantity: 2,
            unitPrice: 20,
            unitCost: 10,
          },
        ],
        payment: {
          method: "CASH",
          amount: 50,
        },
      },
    };

    const result = await registry.executeCommand(CTX, checkoutCmd);
    expect(result.success).toBe(true);
    expect(result.data?.sale?.status).toBe("COMPLETED");
    expect(result.data?.sale?.grandTotal).toBe(40);
    expect(result.data?.receipt?.changeGiven).toBe(10);

    // Verify stock ledger decreased by 2
    const remainingBalance = stockEngine.getBalance(CTX, CTX.tenantId, CTX.branchId || "", product.id, variant.id);
    expect(remainingBalance).toBe(48);
  });
});
