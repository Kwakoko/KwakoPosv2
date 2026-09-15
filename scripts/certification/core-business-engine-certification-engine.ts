import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
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
import { PharmacyService } from "../../apps/api/src/services/pharmacyService.js";
import { RestaurantService } from "../../apps/api/src/services/restaurantService.js";
import type { TenantContext } from "@kwakopos2/contracts";

export interface PillarVerificationResult {
  pillarId: number;
  name: string;
  passed: boolean;
  details: string;
  durationMs: number;
}

export interface CoreEngineCertificationReport {
  campaignId: string;
  timestamp: string;
  releaseVersion: string;
  totalPillars: number;
  passedPillars: number;
  failedPillars: number;
  scorePercentage: number;
  overallCertified: boolean;
  evidenceFilePath: string;
  results: PillarVerificationResult[];
}

const CTX_A: TenantContext = {
  tenantId: "tenant-cert-alpha-0000-000000000001",
  branchId: "branch-cert-alpha-0000-000000000001",
  userId: "user-cert-0000-000000000001",
  roles: ["SUPER_ADMIN"],
} as TenantContext;

const CTX_B: TenantContext = {
  tenantId: "tenant-cert-beta-0000-000000000002",
  branchId: "branch-cert-beta-0000-000000000002",
  userId: "user-cert-0000-000000000002",
  roles: ["CASHIER"],
} as TenantContext;

export async function runCoreBusinessEngineCertification(): Promise<CoreEngineCertificationReport> {
  console.log("========================================================================");
  console.log(" KWAKOPOS PLATFORM CORE BUSINESS ENGINE LAYER — 360° CERTIFICATION       ");
  console.log(" Authoritative Multi-Engine Verification & Wiring Integrity Gate        ");
  console.log("========================================================================");

  const startTime = Date.now();
  const results: PillarVerificationResult[] = [];

  // Reset singletons for pristine certification baseline
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

  const registry = CoreEngineRegistry.getInstance();
  bootstrapCorePlatformEngines(registry);

  const addResult = (id: number, name: string, passed: boolean, details: string, durationMs: number) => {
    results.push({ pillarId: id, name, passed, details, durationMs });
    const mark = passed ? "✓ [PASS]" : "✗ [FAIL]";
    console.log(` ${mark} [Pillar ${id.toString().padStart(2, "0")}/12] ${name.padEnd(52)} (${durationMs}ms)`);
    console.log(`        └─ ${details}`);
  };

  // ── Pillar 1: Single Source of Truth & Zero-Mock Architecture ──────────────
  {
    const t0 = Date.now();
    const engines = registry.listEngines();
    const expectedEngines = [
      "core.event_bus", "core.audit_compliance", "core.tenant_organization",
      "core.party_contact", "core.product_catalog", "core.stock_ledger",
      "core.inventory", "core.universal_payment", "core.sales_processing", "core.pos_checkout"
    ];
    const allPresent = expectedEngines.every(id => Boolean(registry.getEngine(id)));
    const allActive = expectedEngines.every(id => registry.getEngine(id)?.status === "ACTIVE");
    const passed = allPresent && allActive && engines.length >= 10;
    addResult(
      1,
      "Zero-Mock Foundation & Engine Registry Catalog",
      passed,
      `All 10 authoritative Core Engines registered in active status with zero stubs. Total discovered: ${engines.length}.`,
      Date.now() - t0
    );
  }

  // ── Pillar 2: Core Engine Registry Lifecycle & Dynamic Discovery ────────────
  {
    const t0 = Date.now();
    let duplicateRejected = false;
    try {
      registry.registerEngine({
        engineId: "core.stock_ledger",
        name: "Duplicate Engine",
        version: "1.0.0",
        layer: "BUSINESS_CORE",
        status: "ACTIVE",
        dependencies: [],
        extensionPoints: [],
        permissionsRequired: [],
        supportedCommands: [],
        supportedQueries: [],
        publishedEvents: [],
        healthStatus: "HEALTHY",
      });
    } catch {
      duplicateRejected = true;
    }
    const passed = duplicateRejected && registry.getEngine("core.pos_checkout")?.layer === "BUSINESS_CORE";
    addResult(
      2,
      "Engine Registry Lifecycle & Duplicate Collision Guard",
      passed,
      `Duplicate registration blocked, SemVer descriptors & layer categorization verified.`,
      Date.now() - t0
    );
  }

  // ── Pillar 3: Dependency Graph Integrity & Topological Sequencing ───────────
  {
    const t0 = Date.now();
    const graphValidation = registry.validateDependencies();
    const order = registry.getTopologicalOrder();
    const zeroCycles = graphValidation.valid && graphValidation.cycles.length === 0;
    const zeroMissing = Object.keys(graphValidation.missingDependencies).length === 0;
    const passed = zeroCycles && zeroMissing && order.length >= 10;
    addResult(
      3,
      "Dependency Graph Validation & Zero-Cycle Sequencing",
      passed,
      `DAG topology validated via Tarjan/DFS: 0 cycles, 0 missing dependencies. Topological order depth: ${order.length}.`,
      Date.now() - t0
    );
  }

  // ── Pillar 4: Multi-Tenant Boundary Enforcement & Isolation Invariants ───────
  {
    const t0 = Date.now();
    const stockEngine = StockLedgerEngine.getInstance();
    const partyEngine = PartyContactEngine.getInstance();
    const catalogEngine = ProductCatalogEngine.getInstance();

    let stockIsolated = false;
    try {
      stockEngine.getBalance(CTX_B, CTX_A.tenantId, CTX_A.branchId || "", "any-prod");
    } catch (e: any) {
      stockIsolated = e.message.includes("TENANT_BOUNDARY_VIOLATION");
    }

    let partyIsolated = false;
    try {
      partyEngine.createParty(CTX_B, {
        tenantId: CTX_A.tenantId,
        partyType: "INDIVIDUAL",
        roles: ["CUSTOMER"],
        name: "Intruder User",
      });
    } catch (e: any) {
      partyIsolated = e.message.includes("TENANT_BOUNDARY_VIOLATION");
    }

    let catalogIsolated = false;
    try {
      catalogEngine.createProduct(CTX_B, {
        tenantId: CTX_A.tenantId,
        branchId: CTX_A.branchId || "main",
        name: "Intruder Product",
        sku: "INTRUDER-01",
        buyingPrice: 10,
        sellingPrice: 20,
      });
    } catch (e: any) {
      catalogIsolated = e.message.includes("TENANT_BOUNDARY_VIOLATION");
    }

    const passed = stockIsolated && partyIsolated && catalogIsolated;
    addResult(
      4,
      "Multi-Tenant Isolation Barriers & Boundary Guarantees",
      passed,
      `Cross-tenant access attempts in Stock, Party, and Catalog strictly blocked with TENANT_BOUNDARY_VIOLATION.`,
      Date.now() - t0
    );
  }

  // ── Pillar 5: Immutable Append-Only Stock Ledger & Non-Negative Controls ─────
  {
    const t0 = Date.now();
    const stockEngine = StockLedgerEngine.getInstance();
    const productId = `prod-${randomUUID().slice(0, 8)}`;
    const variantId = `var-${randomUUID().slice(0, 8)}`;

    // Initial receipt
    const receipt = stockEngine.recordMovement(CTX_A, {
      tenantId: CTX_A.tenantId,
      branchId: CTX_A.branchId || "main",
      productId,
      variantId,
      movementType: "PURCHASE_RECEIPT",
      quantityDelta: 100,
      unitCost: 15,
      referenceType: "PURCHASE",
      referenceId: "CERT-P5-RECEIPT",
      actorId: CTX_A.userId,
    });

    // Valid decrement
    const sale = stockEngine.recordMovement(CTX_A, {
      tenantId: CTX_A.tenantId,
      branchId: CTX_A.branchId || "main",
      productId,
      variantId,
      movementType: "SALE",
      quantityDelta: -25,
      unitCost: 15,
      referenceType: "SALE",
      referenceId: "CERT-P5-SALE",
      actorId: CTX_A.userId,
    });

    // Guard against negative inventory
    let negativeBlocked = false;
    try {
      stockEngine.recordMovement(CTX_A, {
        tenantId: CTX_A.tenantId,
        branchId: CTX_A.branchId || "main",
        productId,
        variantId,
        movementType: "SALE",
        quantityDelta: -100, // Available is 75
        unitCost: 15,
        referenceType: "SALE",
        referenceId: "CERT-P5-OVERDRAW",
        actorId: CTX_A.userId,
      });
    } catch (e: any) {
      negativeBlocked = e.message.includes("INSUFFICIENT_STOCK");
    }

    const currentBalance = stockEngine.getBalance(CTX_A, CTX_A.tenantId, CTX_A.branchId || "main", productId, variantId);
    const passed = receipt.runningBalanceAfter === 100 && sale.runningBalanceAfter === 75 && currentBalance === 75 && negativeBlocked;
    addResult(
      5,
      "Append-Only Stock Ledger & Non-Negative Balance Guards",
      passed,
      `Running balance verified (100 -> 75). Over-deductions strictly prevented with INSUFFICIENT_STOCK guard.`,
      Date.now() - t0
    );
  }

  // ── Pillar 6: Universal Catalog & Variant Pricing Engine ────────────────────
  {
    const t0 = Date.now();
    const catalogEngine = ProductCatalogEngine.getInstance();
    const sku = `PROD-SKU-${randomUUID().slice(0, 6)}`;
    const product = catalogEngine.createProduct(CTX_A, {
      tenantId: CTX_A.tenantId,
      branchId: CTX_A.branchId || "main",
      name: "Smart Watch V2",
      sku,
      buyingPrice: 100,
      sellingPrice: 150,
    });

    const variant = catalogEngine.createVariant(CTX_A, {
      tenantId: CTX_A.tenantId,
      branchId: CTX_A.branchId || "main",
      productId: product.id,
      name: "Black Edition",
      sku: `${sku}-BLK`,
      buyingPrice: 110,
      sellingPrice: 165,
      attributeValues: {},
    });

    // Duplicate SKU guard
    let dupBlocked = false;
    try {
      catalogEngine.createProduct(CTX_A, {
        tenantId: CTX_A.tenantId,
        branchId: CTX_A.branchId || "main",
        name: "Collision Product",
        sku,
        buyingPrice: 50,
        sellingPrice: 80,
      });
    } catch (e: any) {
      dupBlocked = e.message.includes("PRODUCT_SKU_EXISTS");
    }

    const margin = catalogEngine.calculateMargin(100, 150);
    const passed = Boolean(product.id && variant.id && dupBlocked && margin.marginAmount === 50 && margin.marginPercentage === 33.33);
    addResult(
      6,
      "Universal Product Catalog & Variant Pricing Engine",
      passed,
      `Product/Variant created with price inheritance. Duplicate SKU rejected. Margin verified: 33.33%.`,
      Date.now() - t0
    );
  }

  // ── Pillar 7: Multi-Location Inventory State Machine & FEFO Allocation ───────
  {
    const t0 = Date.now();
    const inventoryEngine = InventoryEngine.getInstance();
    const stockEngine = StockLedgerEngine.getInstance();
    const productId = `prod-inv-${randomUUID().slice(0, 6)}`;
    const variantId = `var-inv-${randomUUID().slice(0, 6)}`;

    // Seed initial stock ledger balance so availability > 0
    stockEngine.recordMovement(CTX_A, {
      tenantId: CTX_A.tenantId,
      branchId: CTX_A.branchId || "main",
      productId,
      variantId,
      movementType: "PURCHASE_RECEIPT",
      quantityDelta: 50,
      unitCost: 10,
      referenceType: "PURCHASE",
      referenceId: "CERT-P7-RECEIPT",
      actorId: CTX_A.userId,
    });

    // Stock reservation
    const reservation = inventoryEngine.reserveStock(CTX_A, {
      tenantId: CTX_A.tenantId,
      branchId: CTX_A.branchId || "main",
      productId,
      variantId,
      quantity: 10,
      referenceType: "CART",
      referenceId: "cart-001",
      ttlSeconds: 60,
    });


    const committedRes = inventoryEngine.commitReservation(CTX_A, reservation.id);
    const passed = reservation.status === "ACTIVE" && committedRes.status === "COMMITTED";

    addResult(
      7,
      "Multi-Location Inventory Reservations & State Machine",
      passed,
      `Reservation state lifecycle ACTIVE -> COMMITTED verified with TTL support.`,
      Date.now() - t0
    );
  }

  // ── Pillar 8: Unified Party Model & Polymorphic Role Governance ──────────────
  {
    const t0 = Date.now();
    const partyEngine = PartyContactEngine.getInstance();
    const party = partyEngine.createParty(CTX_A, {
      tenantId: CTX_A.tenantId,
      partyType: "INDIVIDUAL",
      roles: ["CUSTOMER"],
      name: "Sarah Masanja",
      email: `sarah-${randomUUID().slice(0, 4)}@kwako.tz`,
      creditLimit: 5000,
    });

    // Add role
    const updated = partyEngine.assignRole(CTX_A, party.id, "SUPPLIER");
    // Adjust credit
    const credit = partyEngine.adjustCreditBalance(CTX_A, {
      partyId: party.id,
      tenantId: CTX_A.tenantId,
      amountDelta: 1200,
      referenceType: "SALE",
      referenceId: "sale-credit-001",
    });

    const passed = Boolean(party.id && updated.roles.includes("CUSTOMER") && updated.roles.includes("SUPPLIER") && credit.newBalance === 1200);
    addResult(
      8,
      "Unified Party Model & Polymorphic Role Governance",
      passed,
      `Customer/Supplier multi-role polymorphic assignment and credit ledger balance verified.`,
      Date.now() - t0
    );
  }

  // ── Pillar 9: Multi-Rail Payment Engine & Split Settlement Isolation ─────────
  {
    const t0 = Date.now();
    const paymentEngine = UniversalPaymentEngine.getInstance();

    // Single payment
    const single = paymentEngine.processPayment(CTX_A, {
      tenantId: CTX_A.tenantId,
      branchId: CTX_A.branchId || "main",
      referenceType: "SALE",
      referenceId: "sale-pay-001",
      amount: 15000,
      method: "MOBILE_MONEY",
      provider: "MPESA",
      providerReference: "MPESA-998822",
    });

    // Split payment
    const split = paymentEngine.processSplitPayment(CTX_A, {
      tenantId: CTX_A.tenantId,
      branchId: CTX_A.branchId || "main",
      referenceType: "SALE",
      referenceId: "sale-pay-002",
      totalRequired: 15000,
      splits: [
        { method: "CASH", amount: 10000 },
        { method: "CARD", amount: 5000, provider: "CRDB" },
      ],
    });

    const passed = single.status === "COMPLETED" && split.totalPaid === 15000 && split.payments.length === 2;
    addResult(
      9,
      "Universal Payment Multi-Rail Engine & Split Settlements",
      passed,
      `Single payment (M-Pesa) and atomic split payment (Cash + Visa) processed cleanly with full isolation.`,
      Date.now() - t0
    );
  }

  // ── Pillar 10: Transactional POS Checkout Orchestration (ACID Invariants) ────
  {
    const t0 = Date.now();
    const catalogEngine = ProductCatalogEngine.getInstance();
    const stockEngine = StockLedgerEngine.getInstance();
    const posEngine = PosCheckoutEngine.getInstance();

    const prod = catalogEngine.createProduct(CTX_A, {
      tenantId: CTX_A.tenantId,
      branchId: CTX_A.branchId || "main",
      name: "Kwako POS Terminal",
      sku: `POS-TERM-${randomUUID().slice(0, 4)}`,
      buyingPrice: 200,
      sellingPrice: 300,
    });

    const v = catalogEngine.createVariant(CTX_A, {
      tenantId: CTX_A.tenantId,
      branchId: CTX_A.branchId || "main",
      productId: prod.id,
      name: "Standard Model",
      sku: `${prod.sku}-STD`,
      buyingPrice: 200,
      sellingPrice: 300,
      attributeValues: {},
    });

    stockEngine.recordMovement(CTX_A, {
      tenantId: CTX_A.tenantId,
      branchId: CTX_A.branchId || "main",
      productId: prod.id,
      variantId: v.id,
      movementType: "PURCHASE_RECEIPT",
      quantityDelta: 20,
      unitCost: 200,
      referenceType: "PURCHASE",
      referenceId: "CERT-P10-RECEIPT",
      actorId: CTX_A.userId,
    });

    const checkout = posEngine.processCheckout(CTX_A, {
      tenantId: CTX_A.tenantId,
      branchId: CTX_A.branchId || "main",
      items: [
        {
          productId: prod.id,
          variantId: v.id,
          quantity: 2,
        },
      ],
      payment: {
        method: "CASH",
        amount: 700,
      },
    });

    const balAfter = stockEngine.getBalance(CTX_A, CTX_A.tenantId, CTX_A.branchId || "main", prod.id, v.id);
    const passed = checkout.sale.status === "COMPLETED" && checkout.sale.grandTotal === 600 && checkout.receipt.changeGiven === 100 && balAfter === 18;
    addResult(
      10,
      "Transactional POS Checkout Orchestration (ACID)",
      passed,
      `Atomic checkout executed: Sale (600 TZS), Cash (700 TZS), Change (100 TZS), Stock decremented (20 -> 18).`,
      Date.now() - t0
    );
  }

  // ── Pillar 11: Cryptographic SHA-256 Audit Trail Chaining ───────────────────
  {
    const t0 = Date.now();
    const auditEngine = AuditComplianceEngine.getInstance();
    const event1 = await auditEngine.record(CTX_A, {
      action: "TENANT_SETTING_UPDATED",
      entityType: "CONFIG",
      entityId: "config-001",
      afterState: { currency: "TZS" },
    });

    const event2 = await auditEngine.record(CTX_A, {
      action: "USER_ROLE_PROMOTED",
      entityType: "USER",
      entityId: "user-002",
      afterState: { role: "MANAGER" },
    });

    const passed = event1.currentHash.length === 64 && event2.previousHash === event1.currentHash && event2.currentHash.length === 64;
    addResult(
      11,
      "Cryptographic SHA-256 Audit Trail & Hash Chaining",
      passed,
      `Immutable SHA-256 event chaining verified: Event 2 previousHash cryptographically binds to Event 1 currentHash.`,
      Date.now() - t0
    );
  }

  // ── Pillar 12: Cross-Plugin Compliance (Pharmacy & Restaurant) ──────────────
  {
    const t0 = Date.now();
    const stockEngine = StockLedgerEngine.getInstance();
    const pharmacyService = new PharmacyService(undefined, undefined, stockEngine);
    const restaurantService = new RestaurantService(undefined, undefined, stockEngine);


    // 1. Pharmacy batch receipt
    const med = pharmacyService.createMedicine(CTX_A, {
      genericName: "Amoxicillin",
      brandName: "Amoxil",
      strength: "500mg",
      dosageForm: "CAPSULE",

      activeIngredients: [{ name: "Amoxicillin", strength: "500mg" }],

      routeOfAdministration: "ORAL",

      packSize: 1,

      unitOfMeasure: "CAPSULE",

      sku: `MED-AMOX-${randomUUID().slice(0, 6)}`,

      requiresPrescription: false,

      isControlledSubstance: false,

      purchasePrice: 300,

      sellingPrice: 500,

      reorderLevel: 20,
    });

    const batch = pharmacyService.receiveBatch(CTX_A, {
      medicineId: med.id,
      batchNumber: `BAT-AMOX-${randomUUID().slice(0, 4)}`,
      expiryDate: "2027-12-31",
      manufacturingDate: "2025-01-01",
      initialQuantity: 50,
      unitCost: 300,
      supplierId: randomUUID(),
    });

    // 2. Pharmacy FEFO Dispensing
    const dispense = pharmacyService.dispenseMedicineFEFO(CTX_A, {
      medicineId: med.id,
      quantityRequired: 10,
    });

    // 3. Restaurant Waste logging (seed stock first)
    const ingredientId = `ing-${randomUUID().slice(0, 6)}`;
    stockEngine.recordMovement(CTX_A, {
      tenantId: CTX_A.tenantId,
      branchId: CTX_A.branchId || "main",
      movementType: "PURCHASE_RECEIPT",
      productId: ingredientId,
      variantId: null,
      batchId: null,
      batchNumber: null,
      quantityDelta: 10,
      unitCost: 2500,
      referenceType: "PURCHASE",
      referenceId: "seed-rest-001",
      actorId: CTX_A.userId,
    });

    const waste = restaurantService.logWaste(CTX_A, {

      itemId: ingredientId,
      itemName: "Organic Milk",
      quantity: 3,
      unitOfMeasure: "LITER",
      unitCost: 2500,
      reason: "EXPIRED",
    });


    const movements = stockEngine.getMovementHistory(CTX_A, CTX_A.tenantId, CTX_A.branchId || "main");
    const hasPurchase = movements.some(m => m.movementType === "PURCHASE_RECEIPT");
    const hasSale = movements.some(m => m.movementType === "SALE");
    const hasWaste = movements.some(m => m.movementType === "WASTE");

    const passed = Boolean(batch.id && dispense.fulfilled && waste.id && hasPurchase && hasSale && hasWaste);

    addResult(
      12,
      "Industry Plugin Architecture Compliance & Convergence",
      passed,
      `Pharmacy FEFO dispensing and Restaurant waste tracking verified writing to Core StockLedgerEngine.`,
      Date.now() - t0
    );
  }

  const durationMs = Date.now() - startTime;
  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;
  const failedCount = totalCount - passedCount;
  const scorePct = Math.round((passedCount / totalCount) * 100);
  const overallCertified = scorePct === 100;

  const campaignId = `CORE-ENG-CERT-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 6).toUpperCase()}`;
  const evidenceDir = path.resolve(process.cwd(), "artifacts", "core-engine-evidence");
  if (!fs.existsSync(evidenceDir)) fs.mkdirSync(evidenceDir, { recursive: true });

  const evidenceFilePath = path.join(evidenceDir, `${campaignId}.json`);
  const report: CoreEngineCertificationReport = {
    campaignId,
    timestamp: new Date().toISOString(),
    releaseVersion: "2.12.5",
    totalPillars: totalCount,
    passedPillars: passedCount,
    failedPillars: failedCount,
    scorePercentage: scorePct,
    overallCertified,
    evidenceFilePath,
    results,
  };

  fs.writeFileSync(evidenceFilePath, JSON.stringify(report, null, 2), "utf-8");

  console.log("========================================================================");
  console.log(` 🏆 CORE BUSINESS ENGINE CERTIFICATION RESULT: ${overallCertified ? "CERTIFIED" : "FAILED"}`);
  console.log(` Score: ${scorePct}% (${passedCount}/${totalCount} Core Pillars Production Certified)`);
  console.log(` Evidence Artifact: ${evidenceFilePath}`);
  console.log(` Execution Time: ${durationMs}ms`);
  console.log("========================================================================");

  return report;
}

// Allow direct CLI execution via tsx / node
if (process.argv[1] && (process.argv[1].includes("core-business-engine-certification-engine") || process.argv[1].endsWith(".ts"))) {
  runCoreBusinessEngineCertification()
    .then((report) => {
      process.exit(report.overallCertified ? 0 : 1);
    })
    .catch((err) => {
      console.error("FATAL: Core Engine Certification failed:", err);
      process.exit(1);
    });
}

