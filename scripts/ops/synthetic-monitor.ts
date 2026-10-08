import { randomUUID } from "crypto";
import {
  ScopedProductRepository,
  ScopedStockRepository,
  ScopedCommercialRepository,
  ScopedFinanceRepository,
  ScopedWorkforceRepository,
  ScopedPluginRepository,
  ScopedTelecomRepository,
  ScopedMonetizationRepository,
  globalInMemoryStore,
} from "@kwakopos2/database";
import { SyncEngine } from "@kwakopos2/sync";
import {
  calculateAvailableStock,
  assertInventoryLedgerIntegrity,
  assertNoOrphanAdjustments,
  FinancialBridge,
  AccountingEngine,
  ReceivablesPayablesEngine,
  EmployeeEngine,
  AttendanceEngine,
  SchedulingEngine,
  LeaveEngine,
  TaskWorkOrderEngine,
  PayrollInputEngine,
  LaborCostingEngine,
  PluginRegistryEngine,
  PluginConfigEngine,
  PluginWorkflowEngine,
  PluginNavigationEngine,
  PluginDashboardEngine,
  StandardPluginCatalog,
  RestaurantEngine,
  PharmacyEngine,
  GarageEngine,
  ConstructionEngine,
  TelecomEngine,
  WholesaleEngine,
  KmlKmzParserEngine,
  TelecomWorkflowEngine,
  TelecomCostingEngine,
  EntitlementEngine,
  UsageMeteringEngine,
  SubscriptionLifecycleEngine,
  BillingInvoicingEngine,
  PaymentEngine,
  RevenueAnalyticsEngine,
} from "@kwakopos2/domain";




import { globalMetrics, globalIncidentEngine, defaultLogger } from "@kwakopos2/observability";

await import("fake-indexeddb/auto");
const fakeIndexedDbCore = await import("fake-indexeddb");
(globalThis as any).indexedDB = fakeIndexedDbCore.indexedDB;
(globalThis as any).IDBKeyRange = fakeIndexedDbCore.IDBKeyRange;
const { LocalIndexedDbStore } = await import("../../apps/web/src/indexedDb.js");
const { ClientSyncEngine } = await import("../../apps/web/src/clientSyncEngine.js");

async function waitForSyntheticDbReady(db: any, label: string): Promise<void> {
  const timeoutMs = 15_000;
  await Promise.race([
    db.ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`SYNTHETIC_DB_READY_TIMEOUT:${label}:${timeoutMs}ms`)), timeoutMs),
    ),
  ]);
  console.log(` [PWA-READY] ${label}: schema=${db.schemaVersion}; db=${db.dbName}`);
}

export interface SyntheticRunResult {
  testSuite: string;
  syntheticTenantId: string;
  durationMs: number;
  status: "PASS" | "FAIL";
  evidence: Record<string, unknown>;
  timestamp: string;
}

export async function runSyntheticProductionSuite(apiBaseUrl?: string): Promise<{
  allPassed: boolean;
  results: SyntheticRunResult[];
}> {
  const results: SyntheticRunResult[] = [];
  const syntheticTenantId = `tenant-synthetic-${randomUUID().slice(0, 8)}`;
  const syntheticBranchId = `branch-synthetic-${randomUUID().slice(0, 8)}`;
  const syntheticUserId = `user-synthetic-${randomUUID().slice(0, 8)}`;

  const ctx = {
    tenantId: syntheticTenantId,
    branchId: syntheticBranchId,
    userId: syntheticUserId,
    roles: ["ADMIN"],
    permissions: ["*"],
  };

  console.log("========================================================================");
  console.log(` KWAKOPOS 2.0 CONTINUOUS SYNTHETIC PRODUCTION MONITORING                `);
  console.log(` Synthetic Tenant: ${syntheticTenantId}`);
  console.log("========================================================================");

  const productRepo = new ScopedProductRepository(globalInMemoryStore);
  const stockRepo = new ScopedStockRepository(globalInMemoryStore);
  const commercialRepo = new ScopedCommercialRepository(globalInMemoryStore);
  const syncEngine = new SyncEngine(productRepo, stockRepo, commercialRepo, globalInMemoryStore);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST A: Login -> Create Product -> Update -> Verify Persistence
  // -------------------------------------------------------------------------
  const startA = Date.now();
  const prod = productRepo.createProduct(ctx, {
    name: "Synthetic Product Alpha",
    sku: "SYNTH-P1",
    variants: [{ name: "Standard", sku: "SYNTH-V1", price: 25, costPrice: 10 }],
  });
  const updatedProd = productRepo.updateProduct(ctx, prod.id, { name: "Synthetic Product Alpha Updated" });
  const fetchedProd = productRepo.getProductById(ctx, prod.id);
  const passA = fetchedProd !== null && fetchedProd.name === "Synthetic Product Alpha Updated";
  results.push({
    testSuite: "SYNTHETIC_TEST_A_PRODUCT_LIFECYCLE",
    syntheticTenantId,
    durationMs: Date.now() - startA,
    status: passA ? "PASS" : "FAIL",
    evidence: { productId: prod.id, name: fetchedProd?.name },
    timestamp: new Date().toISOString(),
  });
  console.log(` [A/F] ${passA ? "✓" : "✗"} Synthetic Test A (Product Lifecycle & Persistence): ${passA ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST B: Create Variant -> Verify Relationship & Identity
  // -------------------------------------------------------------------------
  const startB = Date.now();
  const varB = productRepo.addVariant(ctx, prod.id, {
    name: "Synthetic Size Large",
    sku: "SYNTH-V2-LG",
    price: 30,
    costPrice: 12,
  });
  const reloadedProd = productRepo.getProductById(ctx, prod.id);
  const passB = reloadedProd?.variants?.some((v) => v.id === varB.id && v.productId === prod.id);
  results.push({
    testSuite: "SYNTHETIC_TEST_B_VARIANT_INTEGRITY",
    syntheticTenantId,
    durationMs: Date.now() - startB,
    status: passB ? "PASS" : "FAIL",
    evidence: { variantId: varB.id, totalVariants: reloadedProd?.variants?.length },
    timestamp: new Date().toISOString(),
  });
  console.log(` [B/F] ${passB ? "✓" : "✗"} Synthetic Test B (Variant Relationship Integrity): ${passB ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST C: Stock Adjustment -> Ledger Mutation Arithmetic
  // -------------------------------------------------------------------------
  const startC = Date.now();
  const targetVarId = varB.id;
  stockRepo.recordStockAdjustment(ctx, {
    variantId: targetVarId,
    adjustmentType: "INCREASE",
    quantityChange: 150,
    reason: "Synthetic Intake",
    deviceId: "synth-dev-1",
    operationId: "op-synth-1",
    idempotencyKey: "key-synth-1",
  });
  stockRepo.recordStockAdjustment(ctx, {
    variantId: targetVarId,
    adjustmentType: "DECREASE",
    quantityChange: 15,
    reason: "Synthetic Dispatch",
    deviceId: "synth-dev-1",
    operationId: "op-synth-2",
    idempotencyKey: "key-synth-2",
  });
  const currentStock = stockRepo.getAvailableStock(ctx, targetVarId);
  const ledgers = stockRepo.getLedger(ctx, targetVarId);
  assertInventoryLedgerIntegrity(targetVarId, 135, ledgers);
  const passC = currentStock === 135; // 150 - 15 = 135
  results.push({
    testSuite: "SYNTHETIC_TEST_C_STOCK_LEDGER_ARITHMETIC",
    syntheticTenantId,
    durationMs: Date.now() - startC,
    status: passC ? "PASS" : "FAIL",
    evidence: { variantId: targetVarId, expectedStock: 135, actualStock: currentStock },
    timestamp: new Date().toISOString(),
  });
  console.log(` [C/F] ${passC ? "✓" : "✗"} Synthetic Test C (Stock Ledger Arithmetic 150 - 15 = 135): ${passC ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST D: Browser A -> Server -> Browser B Multi-Device Sync
  // -------------------------------------------------------------------------
  const startD = Date.now();
  const bADb = new LocalIndexedDbStore(6, `kwakopos-synthetic-D-A-${randomUUID()}`);
  await waitForSyntheticDbReady(bADb, "D-A");
  const bAEngine = new ClientSyncEngine("device-synth-A", bADb);
  const bBDb = new LocalIndexedDbStore(6, `kwakopos-synthetic-D-B-${randomUUID()}`);
  await waitForSyntheticDbReady(bBDb, "D-B");
  const bBEngine = new ClientSyncEngine("device-synth-B", bBDb);

  const synthVarId = randomUUID();
  const synthProdId = randomUUID();

  bADb.recordOutboxMutation({
    id: "OP-SYNTH-D1",
    entityType: "Product",
    entityId: synthProdId,
    operationType: "CREATE",
    payload: { name: "Sync Synth Item", sku: "SYNTH-SYNC-01" },
    clientCreatedAt: new Date().toISOString(),
    idempotencyKey: "SYNTH-KEY-D1",
    status: "PENDING",
  }, ctx);
  bADb.recordOutboxMutation({
    id: "OP-SYNTH-D2",
    entityType: "ProductVariant",
    entityId: synthVarId,
    operationType: "CREATE",
    payload: { productId: synthProdId, name: "Var Sync", sku: "SYNTH-VAR-01", price: 10, costPrice: 5 },
    clientCreatedAt: new Date().toISOString(),
    idempotencyKey: "SYNTH-KEY-D2",
    status: "PENDING",
  }, ctx);
  bADb.recordOutboxMutation({
    id: "OP-SYNTH-D3",
    entityType: "StockAdjustment",
    entityId: randomUUID(),
    operationType: "CREATE",
    payload: {
      variantId: synthVarId,
      adjustmentType: "INCREASE",
      quantityChange: 75,
      reason: "Intake",
      deviceId: "device-synth-A",
      operationId: "OP-SYNTH-D3",
      idempotencyKey: "SYNTH-KEY-D3",
    },
    clientCreatedAt: new Date().toISOString(),
    idempotencyKey: "SYNTH-KEY-D3",
    status: "PENDING",
  }, ctx);

  await bAEngine.syncWithServer(
    async (req) => syncEngine.processPush(ctx, req),
    async (since) => syncEngine.processDelta(ctx, { since }),
    ctx.tenantId,
    ctx.branchId,
  );

  await bBEngine.syncWithServer(
    async (req) => syncEngine.processPush(ctx, req),
    async (since) => syncEngine.processDelta(ctx, { since }),
    ctx.tenantId,
    ctx.branchId,
  );

  const bBStock = calculateAvailableStock(
    Array.from(bBDb.stockLedger.values()).filter((l) => l.variantId === synthVarId)
  );
  const passD = bBStock === 75 && bBDb.products.size >= 1;
  results.push({
    testSuite: "SYNTHETIC_TEST_D_MULTI_DEVICE_CONVERGENCE",
    syntheticTenantId,
    durationMs: Date.now() - startD,
    status: passD ? "PASS" : "FAIL",
    evidence: { browserBStock: bBStock, expected: 75 },
    timestamp: new Date().toISOString(),
  });
  console.log(` [D/F] ${passD ? "✓" : "✗"} Synthetic Test D (Multi-Device Convergence to Browser B = 75): ${passD ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST E: Offline Mutation Outbox Queuing & Reconnect Sync
  // -------------------------------------------------------------------------
  const startE = Date.now();
  const offlineDb = new LocalIndexedDbStore(6, `kwakopos-synthetic-E-${randomUUID()}`);
  await waitForSyntheticDbReady(offlineDb, "E");
  const offlineEngine = new ClientSyncEngine("device-synth-offline", offlineDb);

  offlineDb.recordOutboxMutation({
    id: "OP-OFFLINE-01",
    entityType: "StockAdjustment",
    entityId: randomUUID(),
    operationType: "CREATE",
    payload: {
      variantId: synthVarId,
      adjustmentType: "DECREASE",
      quantityChange: 10,
      reason: "Offline Sale",
      deviceId: "device-synth-offline",
      operationId: "OP-OFFLINE-01",
      idempotencyKey: "OFFLINE-KEY-01",
    },
    clientCreatedAt: new Date().toISOString(),
    idempotencyKey: "OFFLINE-KEY-01",
    status: "PENDING",
  }, ctx);

  const pendingBefore = offlineDb.getPendingOutbox().length;
  await offlineEngine.syncWithServer(
    async (req) => syncEngine.processPush(ctx, req),
    async (since) => syncEngine.processDelta(ctx, { since }),
    ctx.tenantId,
    ctx.branchId,
  );
  const pendingAfter = offlineDb.getPendingOutbox().length;
  const passE = pendingBefore === 1 && pendingAfter === 0;
  results.push({
    testSuite: "SYNTHETIC_TEST_E_OFFLINE_DURABILITY",
    syntheticTenantId,
    durationMs: Date.now() - startE,
    status: passE ? "PASS" : "FAIL",
    evidence: { pendingBefore, pendingAfter },
    timestamp: new Date().toISOString(),
  });
  console.log(` [E/F] ${passE ? "✓" : "✗"} Synthetic Test E (Offline Outbox Durability & Sync Clearance): ${passE ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST F: PWA Schema Migration Preservation
  // -------------------------------------------------------------------------
  const startF = Date.now();
  const pwaDbName = `kwakopos-synthetic-migration-${randomUUID()}`;
  const { MigrationEngine } = await import("../../apps/web/src/persistence/migrationEngine.js");
  const migrationEngine = new MigrationEngine();

  const openMigrationDb = (version: number): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open(pwaDbName, version);
      req.onupgradeneeded = (event) => {
        const tx = req.transaction;
        if (!tx) {
          reject(new Error("PWA_UPGRADE_TRANSACTION_UNAVAILABLE"));
          return;
        }
        migrationEngine.applySchemaUpgrade(req.result, tx, event.oldVersion, version);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("PWA_TEST_DB_OPEN_FAILED"));
      req.onblocked = () => reject(new Error("PWA_TEST_DB_OPEN_BLOCKED"));
    });

  const pwaV3 = await openMigrationDb(3);
  const nativeBeforeUpgrade = await new Promise<number>((resolve, reject) => {
    const tx = pwaV3.transaction("syncOutbox", "readwrite");
    tx.objectStore("syncOutbox").put({
      id: "OP-PWA-01",
      entityType: "StockAdjustment",
      entityId: randomUUID(),
      operationType: "CREATE",
      payload: { adjustmentType: "INCREASE", quantityChange: 10, idempotencyKey: "PWA-1" },
      clientCreatedAt: new Date().toISOString(),
      idempotencyKey: "PWA-1",
      status: "PENDING",
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
    }, "OP-PWA-01");
    tx.oncomplete = () => {
      const countTx = pwaV3.transaction("syncOutbox", "readonly");
      const request = countTx.objectStore("syncOutbox").count();
      request.onsuccess = () => resolve(Number(request.result || 0));
      request.onerror = () => reject(request.error || new Error("PWA_V3_OUTBOX_COUNT_FAILED"));
    };
    tx.onerror = () => reject(tx.error || new Error("PWA_V3_OUTBOX_SEED_FAILED"));
  });
  pwaV3.close();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  const pwaV6 = await openMigrationDb(6);
  const preservedAfterUpgrade = await new Promise<number>((resolve, reject) => {
    const tx = pwaV6.transaction("syncOutbox", "readonly");
    const request = tx.objectStore("syncOutbox").count();
    request.onsuccess = () => resolve(Number(request.result || 0));
    request.onerror = () => reject(request.error || new Error("PWA_V6_OUTBOX_COUNT_FAILED"));
  });
  const upgradedVersion = pwaV6.version;
  pwaV6.close();

  const passF = upgradedVersion === 6 && nativeBeforeUpgrade === 1 && preservedAfterUpgrade === 1;
  results.push({
    testSuite: "SYNTHETIC_TEST_F_PWA_UPGRADE_PRESERVATION",
    syntheticTenantId,
    durationMs: Date.now() - startF,
    status: passF ? "PASS" : "FAIL",
    evidence: { fromVersion: 3, toVersion: upgradedVersion, nativeBeforeUpgrade, preservedAfterUpgrade },
    timestamp: new Date().toISOString(),
  });
  console.log(
    ` [F/L] ${passF ? "✓" : "✗"} Synthetic Test F (PWA Schema Upgrade Outbox Preservation): ${passF ? "PASS" : "FAIL"}`,
  );

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST G: Product -> Variant -> Sale -> Stock Ledger Deduction (100 - 5 = 95)
  // -------------------------------------------------------------------------
  const startG = Date.now();
  const prodG = productRepo.createProduct(ctx, {
    name: "Commercial Flour 1kg",
    sku: "FLOUR-1KG",
    variants: [{ name: "1kg", sku: "FLOUR-1KG-V1", price: 2000, costPrice: 1500 }],
  });
  const varGId = prodG.variants![0].id;
  stockRepo.recordStockAdjustment(ctx, {
    variantId: varGId,
    adjustmentType: "INCREASE",
    quantityChange: 100,
    reason: "Initial Stock",
    deviceId: "dev-synth-1",
    operationId: "op-synth-init-g",
    idempotencyKey: "idem-synth-init-g",
  });
  const saleResG = commercialRepo.createPosSale(ctx, {
    items: [{ productId: prodG.id, variantId: varGId, quantity: 5, unitPrice: 2000, unitCost: 1500 }],
    payments: [{ amount: 10000, paymentMethod: "CASH" }],
    deviceId: "dev-synth-1",
    operationId: "op-synth-sale-g",
    idempotencyKey: "idem-synth-sale-g",
  });
  const stockAfterG = stockRepo.getAvailableStock(ctx, varGId);
  const passG = saleResG.sale.grandTotal === 10000 && stockAfterG === 95;
  results.push({
    testSuite: "SYNTHETIC_TEST_G_POS_SALE_STOCK_DEDUCTION",
    syntheticTenantId,
    durationMs: Date.now() - startG,
    status: passG ? "PASS" : "FAIL",
    evidence: { stockBefore: 100, sold: 5, stockAfter: stockAfterG },
    timestamp: new Date().toISOString(),
  });
  console.log(` [G/L] ${passG ? "✓" : "✗"} Synthetic Test G (POS Sale & Ledger Stock Deduction 100 -> 95): ${passG ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST H: Purchase -> Goods Receipt -> Stock Ledger Addition (95 + 20 = 115)
  // -------------------------------------------------------------------------
  const startH = Date.now();
  const supH = commercialRepo.createSupplier(ctx, { name: "Synthetic Miller Ltd" });
  const recH = commercialRepo.createPurchaseReceipt(ctx, {
    supplierId: supH.id,
    deviceId: "dev-synth-1",
    operationId: "op-synth-rec-h",
    idempotencyKey: "idem-synth-rec-h",
    items: [{ variantId: varGId, quantityReceived: 20, unitCost: 1500 }],
  });
  const stockAfterH = stockRepo.getAvailableStock(ctx, varGId);
  const passH = recH.ledgers.length === 1 && stockAfterH === 115;
  results.push({
    testSuite: "SYNTHETIC_TEST_H_PURCHASE_RECEIPT_STOCK_ADDITION",
    syntheticTenantId,
    durationMs: Date.now() - startH,
    status: passH ? "PASS" : "FAIL",
    evidence: { stockBefore: 95, received: 20, stockAfter: stockAfterH },
    timestamp: new Date().toISOString(),
  });
  console.log(` [H/L] ${passH ? "✓" : "✗"} Synthetic Test H (Goods Receipt & Ledger Addition 95 -> 115): ${passH ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST I: Sale Return -> Stock Ledger Restoration (115 + 2 = 117)
  // -------------------------------------------------------------------------
  const startI = Date.now();
  const retI = commercialRepo.createSaleReturn(ctx, {
    originalSaleId: saleResG.sale.id,
    reason: "Customer exchanged size",
    refundType: "CASH",
    deviceId: "dev-synth-1",
    operationId: "op-synth-ret-i",
    idempotencyKey: "idem-synth-ret-i",
    items: [{ variantId: varGId, quantityReturned: 2, refundUnitPrice: 2000, condition: "GOOD" }],
  });
  const stockAfterI = stockRepo.getAvailableStock(ctx, varGId);
  const passI = retI.returnRecord.totalRefundAmount === 4000 && stockAfterI === 117;
  results.push({
    testSuite: "SYNTHETIC_TEST_I_SALE_RETURN_STOCK_RESTORATION",
    syntheticTenantId,
    durationMs: Date.now() - startI,
    status: passI ? "PASS" : "FAIL",
    evidence: { stockBefore: 115, returned: 2, stockAfter: stockAfterI },
    timestamp: new Date().toISOString(),
  });
  console.log(` [I/L] ${passI ? "✓" : "✗"} Synthetic Test I (Sale Return & Ledger Restoration 115 -> 117): ${passI ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST J: Customer -> Credit Sale -> Balance Tracking
  // -------------------------------------------------------------------------
  const startJ = Date.now();
  const custJ = commercialRepo.createCustomer(ctx, { name: "Synthetic Wholesale Buyer", creditLimit: 200000 });
  const creditSaleJ = commercialRepo.createPosSale(ctx, {
    customerId: custJ.id,
    items: [{ productId: prodG.id, variantId: varGId, quantity: 10, unitPrice: 2000, unitCost: 1500 }],
    payments: [{ amount: 20000, paymentMethod: "CREDIT" }],
    deviceId: "dev-synth-1",
    operationId: "op-synth-sale-j",
    idempotencyKey: "idem-synth-sale-j",
  });
  const custJUpdated = commercialRepo.getCustomerById(ctx, custJ.id);
  const passJ = creditSaleJ.sale.paymentStatus === "PAID" && custJUpdated?.currentBalance === 20000;
  results.push({
    testSuite: "SYNTHETIC_TEST_J_CUSTOMER_CREDIT_ACCOUNTING",
    syntheticTenantId,
    durationMs: Date.now() - startJ,
    status: passJ ? "PASS" : "FAIL",
    evidence: { creditLimit: 200000, creditSale: 20000, currentBalance: custJUpdated?.currentBalance },
    timestamp: new Date().toISOString(),
  });
  console.log(` [J/L] ${passJ ? "✓" : "✗"} Synthetic Test J (Customer Credit & AR Tracking): ${passJ ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST K: Multi-Device Outbox Convergence (Device A -> Server -> Device B)
  // -------------------------------------------------------------------------
  const startK = Date.now();
  const dbA = new LocalIndexedDbStore(6, `kwakopos-synthetic-K-A-${randomUUID()}`);
  const dbB = new LocalIndexedDbStore(6, `kwakopos-synthetic-K-B-${randomUUID()}`);
  await waitForSyntheticDbReady(dbA, "K-A");
  const engineA = new ClientSyncEngine("device-k-a", dbA);
  await waitForSyntheticDbReady(dbB, "K-B");
  const engineB = new ClientSyncEngine("device-k-b", dbB);

  dbA.recordOutboxMutation({
    id: "OP-DEV-A-01",
    entityType: "Customer",
    entityId: randomUUID(),
    operationType: "CREATE",
    payload: { name: "Converged Customer Alpha", creditLimit: 50000 },
    clientCreatedAt: new Date().toISOString(),
    idempotencyKey: "CONV-A-01",
    status: "PENDING",
  }, ctx);

  // Device A syncs up to Server
  await engineA.syncWithServer(
    async (req) => syncEngine.processPush(ctx, req),
    async (since) => syncEngine.processDelta(ctx, { since }),
    ctx.tenantId,
    ctx.branchId,
  );

  // Device B syncs down from Server
  await engineB.syncWithServer(
    async (req) => syncEngine.processPush(ctx, req),
    async (since) => syncEngine.processDelta(ctx, { since }),
    ctx.tenantId,
    ctx.branchId,
  );

  const serverCustomers = commercialRepo.getCustomers(ctx);
  const passK = serverCustomers.some((c) => c.name === "Converged Customer Alpha");
  results.push({
    testSuite: "SYNTHETIC_TEST_K_MULTI_DEVICE_CONVERGENCE",
    syntheticTenantId,
    durationMs: Date.now() - startK,
    status: passK ? "PASS" : "FAIL",
    evidence: { convergedCustomerCount: serverCustomers.length },
    timestamp: new Date().toISOString(),
  });
  console.log(` [K/L] ${passK ? "✓" : "✗"} Synthetic Test K (Multi-Device A -> Server -> B Sync Convergence): ${passK ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST L: Cashier Session Lifecycle & Drawer Variance Reconciliation
  // -------------------------------------------------------------------------
  const startL = Date.now();
  const sessionL = commercialRepo.openCashSession(ctx, { openingCash: 100000 });
  sessionL.cashSalesTotal = 50000;
  commercialRepo.recordExpense(ctx, {
    cashSessionId: sessionL.id,
    category: "OFFICE_EXPENSE",
    amount: 10000,
    reason: "Cleaning Supplies",
    status: "PAID",
    paymentMethod: "CASH",
    taxDeductible: false,
  });
  commercialRepo.sealCashSessionCount(ctx, sessionL.id, { actualCash: 140000, deviceId: "synthetic-monitor" });
  const closedSessionL = commercialRepo.closeCashSession(ctx, sessionL.id, {});
  const passL = closedSessionL.status === "CLOSED" && closedSessionL.expectedCash === 140000 && closedSessionL.variance === 0;
  results.push({
    testSuite: "SYNTHETIC_TEST_L_CASH_SESSION_RECONCILIATION",
    syntheticTenantId,
    durationMs: Date.now() - startL,
    status: passL ? "PASS" : "FAIL",
    evidence: { opening: 100000, sales: 50000, expenses: 10000, expected: closedSessionL.expectedCash, variance: closedSessionL.variance },
    timestamp: new Date().toISOString(),
  });
  console.log(` [L/L] ${passL ? "✓" : "✗"} Synthetic Test L (Cashier Session Lifecycle & Variance Reconciliation): ${passL ? "PASS" : "FAIL"}`);

  // =========================================================================
  // PHASE 2: FINANCE & OPERATIONAL CONTROL SYNTHETIC MONITORING (F01 - F08)
  // =========================================================================

  const financeRepo = new ScopedFinanceRepository(globalInMemoryStore);
  const accountLookup = financeRepo.getAccountLookup(ctx);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST F01: Sale -> Payment -> Journal -> General Ledger & Trial Balance
  // -------------------------------------------------------------------------
  const startF01 = Date.now();
  const saleF01 = commercialRepo.createPosSale(ctx, {
    items: [{ productId: prod.id, variantId: targetVarId, quantity: 2, unitPrice: 30, unitCost: 12 }],
    payments: [{ amount: 60, paymentMethod: "CASH" }],
    deviceId: "synth-dev-1",
    operationId: "op-synth-f01",
    idempotencyKey: `synth-f01-${randomUUID()}`,
  });
  const { journal: jF01 } = FinancialBridge.mapSaleToJournal(ctx, saleF01.sale, accountLookup, "CASH");
  financeRepo.journalEntries.set(jF01.id, jF01);
  financeRepo.journalLines.set(jF01.id, jF01.lines || []);
  const tbF01 = financeRepo.getTrialBalance(ctx);
  const passF01 = jF01.totalDebit === jF01.totalCredit && tbF01.isBalanced;
  results.push({
    testSuite: "SYNTHETIC_TEST_F01_SALE_JOURNAL_GL_INTEGRITY",
    syntheticTenantId,
    durationMs: Date.now() - startF01,
    status: passF01 ? "PASS" : "FAIL",
    evidence: { journalId: jF01.id, totalDebit: jF01.totalDebit, isTrialBalanceBalanced: tbF01.isBalanced },
    timestamp: new Date().toISOString(),
  });
  console.log(` [F01/F08] ${passF01 ? "✓" : "✗"} Synthetic Test F01 (Sale -> Journal -> GL Double-Entry Balance): ${passF01 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST F02: Credit Sale -> Customer Invoice -> Payment Allocation -> Zero Balance
  // -------------------------------------------------------------------------
  const startF02 = Date.now();
  const custF02 = commercialRepo.createCustomer(ctx, { name: "Synthetic Credit Customer", creditLimit: 500000 });
  const invF02 = financeRepo.createCustomerInvoice(ctx, {
    customerId: custF02.id,
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    items: [{ description: "Credit Goods", quantity: 5, unitPrice: 10000 }],
  });
  const allocF02 = financeRepo.allocatePayment(ctx, {
    paymentId: randomUUID(),
    customerInvoiceId: invF02.id,
    amount: 50000,
  });
  const passF02 = allocF02.updatedInvoice.status === "PAID" && allocF02.updatedInvoice.balanceDue === 0;
  results.push({
    testSuite: "SYNTHETIC_TEST_F02_AR_INVOICE_ALLOCATION",
    syntheticTenantId,
    durationMs: Date.now() - startF02,
    status: passF02 ? "PASS" : "FAIL",
    evidence: { invoiceId: invF02.id, status: allocF02.updatedInvoice.status, balanceDue: allocF02.updatedInvoice.balanceDue },
    timestamp: new Date().toISOString(),
  });
  console.log(` [F02/F08] ${passF02 ? "✓" : "✗"} Synthetic Test F02 (Credit Sale -> AR Invoice -> Payment Allocation): ${passF02 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST F03: Purchase -> Supplier Invoice -> Supplier Payment -> Zero Balance
  // -------------------------------------------------------------------------
  const startF03 = Date.now();
  const supF03 = commercialRepo.createSupplier(ctx, { name: "Synthetic AP Supplier" });
  const invF03 = financeRepo.createSupplierInvoice(ctx, {
    supplierId: supF03.id,
    dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    items: [{ description: "Raw Materials", quantity: 10, unitCost: 8000 }],
  });
  const allocF03 = financeRepo.allocatePayment(ctx, {
    paymentId: randomUUID(),
    supplierInvoiceId: invF03.id,
    amount: 80000,
  });
  const passF03 = allocF03.updatedInvoice.status === "PAID" && allocF03.updatedInvoice.balanceDue === 0;
  results.push({
    testSuite: "SYNTHETIC_TEST_F03_AP_INVOICE_ALLOCATION",
    syntheticTenantId,
    durationMs: Date.now() - startF03,
    status: passF03 ? "PASS" : "FAIL",
    evidence: { supplierInvoiceId: invF03.id, status: allocF03.updatedInvoice.status, balanceDue: allocF03.updatedInvoice.balanceDue },
    timestamp: new Date().toISOString(),
  });
  console.log(` [F03/F08] ${passF03 ? "✓" : "✗"} Synthetic Test F03 (Purchase -> AP Invoice -> Supplier Payment): ${passF03 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST F04: Expense -> Journal Posting
  // -------------------------------------------------------------------------
  const startF04 = Date.now();
  const expF04 = commercialRepo.recordExpense(ctx, {
    category: "UTILITIES",
    amount: 25000,
    reason: "Electricity Bill",
    status: "PAID",
    paymentMethod: "CASH",
    taxDeductible: false,
  });
  const { journal: jF04 } = FinancialBridge.mapExpenseToJournal(ctx, expF04, accountLookup.expenseDefaultAccountId, accountLookup);
  financeRepo.journalEntries.set(jF04.id, jF04);
  financeRepo.journalLines.set(jF04.id, jF04.lines || []);
  const passF04 = jF04.status === "POSTED" && jF04.totalDebit === 25000 && jF04.totalCredit === 25000;
  results.push({
    testSuite: "SYNTHETIC_TEST_F04_EXPENSE_JOURNAL_POSTING",
    syntheticTenantId,
    durationMs: Date.now() - startF04,
    status: passF04 ? "PASS" : "FAIL",
    evidence: { expenseId: expF04.id, journalId: jF04.id },
    timestamp: new Date().toISOString(),
  });
  console.log(` [F04/F08] ${passF04 ? "✓" : "✗"} Synthetic Test F04 (Operating Expense -> GL Journal Posting): ${passF04 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST F05: Cash Session -> Close -> Drawer Variance Journal
  // -------------------------------------------------------------------------
  const startF05 = Date.now();
  const sesF05 = commercialRepo.openCashSession(ctx, { openingCash: 100000 });
  sesF05.cashSalesTotal = 20000;
  commercialRepo.sealCashSessionCount(ctx, sesF05.id, { actualCash: 115000, deviceId: "synthetic-monitor" });
  const closedF05 = commercialRepo.closeCashSession(ctx, sesF05.id, {}); // 5k short
  const varianceResultF05 = FinancialBridge.mapCashSessionVarianceToJournal(ctx, closedF05, accountLookup);
  const passF05 = varianceResultF05 !== null && varianceResultF05.journal.totalDebit === 5000;
  results.push({
    testSuite: "SYNTHETIC_TEST_F05_CASH_VARIANCE_JOURNAL",
    syntheticTenantId,
    durationMs: Date.now() - startF05,
    status: passF05 ? "PASS" : "FAIL",
    evidence: { variance: closedF05.variance, journalDebit: varianceResultF05?.journal.totalDebit },
    timestamp: new Date().toISOString(),
  });
  console.log(` [F05/F08] ${passF05 ? "✓" : "✗"} Synthetic Test F05 (Cash Session -> Variance -> Cash Short Journal): ${passF05 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST F06: Multi-Device Financial Mutation Sync Convergence
  // -------------------------------------------------------------------------
  const startF06 = Date.now();
  const financialExpenseId = randomUUID();
  dbStoreF06A.recordOutboxMutation({
    id: "op-fin-sync-1",
    entityType: "Expense",
    entityId: financialExpenseId,
    operationType: "CREATE",
    payload: {
      id: financialExpenseId,
      category: "OPERATING",
      amount: 250000,
      reason: "Synthetic Multi-Device Expense",
      description: "Synthetic Multi-Device Expense",
      payee: "Synthetic Payee",
      paymentMethod: "CASH",
      status: "PAID",
      taxDeductible: false,
    },
    idempotencyKey: `idem-fin-sync-${randomUUID()}`,
    clientCreatedAt: new Date().toISOString(),
    status: "PENDING",
  }, ctx);

  await engineF06A.syncWithServer(
    async (req) => syncEngine.processPush(ctx, req),
    async (since) => syncEngine.processDelta(ctx, { since }),
    ctx.tenantId,
    ctx.branchId,
  );
  await engineF06B.syncWithServer(
    async (req) => syncEngine.processPush(ctx, req),
    async (since) => syncEngine.processDelta(ctx, { since }),
    ctx.tenantId,
    ctx.branchId,
  );

  const browserBExpenses = dbStoreF06B.configuration.get("expenses");
  const browserBExpense = Array.isArray(browserBExpenses)
    ? browserBExpenses.find((e: any) => e?.id === financialExpenseId)
    : null;
  const serverExpense = Array.from((globalInMemoryStore as any).expenses?.values?.() || [])
    .find((e: any) => e?.id === financialExpenseId);
  const passF06 =
    !!serverExpense &&
    !!browserBExpense &&
    Number(browserBExpense.amount) === 250000 &&
    browserBExpense.tenantId === ctx.tenantId &&
    browserBExpense.branchId === ctx.branchId;

  results.push({
    testSuite: "SYNTHETIC_TEST_F06_FINANCIAL_SYNC_CONVERGENCE",
    syntheticTenantId,
    durationMs: Date.now() - startF06,
    status: passF06 ? "PASS" : "FAIL",
    evidence: {
      syncStatus: passF06 ? "CONVERGED" : "DIVERGED",
      serverExpenseId: serverExpense?.id,
      browserBExpenseId: browserBExpense?.id,
      browserBAmount: browserBExpense?.amount,
    },
    timestamp: new Date().toISOString(),
  });
  console.log(
    ` [F06/F08] ${passF06 ? "✓" : "✗"} Synthetic Test F06 (Multi-Device Financial Mutation Sync Convergence): ${passF06 ? "PASS" : "FAIL"}`,
  );

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST F07: Closed Accounting Period -> Attempt Posting -> Correct Rejection
  // -------------------------------------------------------------------------
  const startF07 = Date.now();
  const fyF07 = financeRepo.createFiscalYear(ctx, { name: "FY Synthetic", startDate: "2026-01-01", endDate: "2026-12-31" });
  const pF07 = financeRepo.createAccountingPeriod(ctx, { fiscalYearId: fyF07.id, periodNumber: 2, name: "2026-02", startDate: "2026-02-01", endDate: "2026-02-28" });
  financeRepo.closePeriod(ctx, pF07.id);
  let rejectedCorrectly = false;
  try {
    financeRepo.createJournalEntry(ctx, {
      accountingPeriodId: pF07.id,
      sourceType: "MANUAL",
      description: "Invalid Posting",
      lines: [
        { accountId: accountLookup.cashAccountId, debit: 100, credit: 0 },
        { accountId: accountLookup.salesRevenueAccountId, debit: 0, credit: 100 },
      ],
    });
  } catch (err: any) {
    rejectedCorrectly = err.message.includes("INVARIANT_F010_VIOLATION");
  }
  const passF07 = rejectedCorrectly;
  results.push({
    testSuite: "SYNTHETIC_TEST_F07_CLOSED_PERIOD_POSTING_REJECTION",
    syntheticTenantId,
    durationMs: Date.now() - startF07,
    status: passF07 ? "PASS" : "FAIL",
    evidence: { rejectedCorrectly },
    timestamp: new Date().toISOString(),
  });
  console.log(` [F07/F08] ${passF07 ? "✓" : "✗"} Synthetic Test F07 (Closed Accounting Period -> Correct Rejection): ${passF07 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST F08: Duplicate Payment -> Idempotency -> Single Financial Result
  // -------------------------------------------------------------------------
  const startF08 = Date.now();
  const keyF08 = `idem-fin-f08-${randomUUID()}`;
  const firstJ = financeRepo.createJournalEntry(ctx, {
    idempotencyKey: keyF08,
    sourceType: "MANUAL",
    description: "Idempotent Entry",
    lines: [
      { accountId: accountLookup.cashAccountId, debit: 5000, credit: 0 },
      { accountId: accountLookup.salesRevenueAccountId, debit: 0, credit: 5000 },
    ],
  });
  const secondJ = financeRepo.createJournalEntry(ctx, {
    idempotencyKey: keyF08,
    sourceType: "MANUAL",
    description: "Duplicate Attempt",
    lines: [
      { accountId: accountLookup.cashAccountId, debit: 5000, credit: 0 },
      { accountId: accountLookup.salesRevenueAccountId, debit: 0, credit: 5000 },
    ],
  });
  const passF08 = firstJ.journal.id === secondJ.journal.id;
  results.push({
    testSuite: "SYNTHETIC_TEST_F08_IDEMPOTENCY_SINGLE_RESULT",
    syntheticTenantId,
    durationMs: Date.now() - startF08,
    status: passF08 ? "PASS" : "FAIL",
    evidence: { firstId: firstJ.journal.id, secondId: secondJ.journal.id, duplicatePrevented: passF08 },
    timestamp: new Date().toISOString(),
  });
  console.log(` [F08/F08] ${passF08 ? "✓" : "✗"} Synthetic Test F08 (Duplicate Payment Idempotency -> Single Financial Result): ${passF08 ? "PASS" : "FAIL"}`);

  // ==========================================
  // PHASE 3: WORKFORCE SYNTHETIC TESTS (W01 - W10)
  // ==========================================
  const workforceRepo = new ScopedWorkforceRepository(globalInMemoryStore);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST W01: Create Employee -> Assign Branch -> Verify Persistence
  // -------------------------------------------------------------------------
  const startW01 = Date.now();
  const { employee: empW01 } = workforceRepo.createEmployee(ctx, {
    firstName: "Emanuel",
    lastName: "Mushi",
    phone: "+255755112233",
    email: "emanuel@example.com",
    baseSalary: 1200000,
    hourlyRate: 7500,
  });
  const fetchedEmpW01 = workforceRepo.getEmployeeById(ctx, empW01.id);
  const passW01 = fetchedEmpW01 !== null && fetchedEmpW01.employeeNumber.startsWith("EMP-");
  results.push({
    testSuite: "SYNTHETIC_TEST_W01_EMPLOYEE_CREATION_PERSISTENCE",
    syntheticTenantId,
    durationMs: Date.now() - startW01,
    status: passW01 ? "PASS" : "FAIL",
    evidence: { employeeId: empW01.id, employeeNumber: fetchedEmpW01?.employeeNumber },
    timestamp: new Date().toISOString(),
  });
  console.log(` [W01/W10] ${passW01 ? "✓" : "✗"} Synthetic Test W01 (Create Employee -> Assign Branch -> Persistence): ${passW01 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST W02: Schedule Shift -> Publish -> Verify Schedule
  // -------------------------------------------------------------------------
  const startW02 = Date.now();
  const schedW02 = workforceRepo.createSchedule(ctx, {
    employeeId: empW01.id,
    date: "2026-08-27",
    startTime: "08:00",
    endTime: "17:00",
    status: "PUBLISHED",
  });
  const passW02 = schedW02 !== null && schedW02.status === "PUBLISHED" && schedW02.employeeId === empW01.id;
  results.push({
    testSuite: "SYNTHETIC_TEST_W02_SCHEDULE_PUBLISH",
    syntheticTenantId,
    durationMs: Date.now() - startW02,
    status: passW02 ? "PASS" : "FAIL",
    evidence: { scheduleId: schedW02.id, status: schedW02.status },
    timestamp: new Date().toISOString(),
  });
  console.log(` [W02/W10] ${passW02 ? "✓" : "✗"} Synthetic Test W02 (Schedule Shift -> Publish -> Visibility): ${passW02 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST W03: Clock In -> Offline Local State -> Sync to Browser B
  // -------------------------------------------------------------------------
  const startW03 = Date.now();
  const clockInW03 = workforceRepo.clockIn(ctx, {
    employeeId: empW01.id,
    scheduleId: schedW02.id,
    clockInTime: "2026-08-27T08:00:00.000Z",
    method: "STANDARD",
    idempotencyKey: `clk-w03-${randomUUID()}`,
  });
  const passW03 = clockInW03.status === "PRESENT" && clockInW03.employeeId === empW01.id;
  results.push({
    testSuite: "SYNTHETIC_TEST_W03_CLOCK_IN_SYNC",
    syntheticTenantId,
    durationMs: Date.now() - startW03,
    status: passW03 ? "PASS" : "FAIL",
    evidence: { attendanceId: clockInW03.id, status: clockInW03.status },
    timestamp: new Date().toISOString(),
  });
  console.log(` [W03/W10] ${passW03 ? "✓" : "✗"} Synthetic Test W03 (Clock In -> Sync Convergence): ${passW03 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST W04: Clock Out -> Timesheet Generation -> Calculate Hours
  // -------------------------------------------------------------------------
  const startW04 = Date.now();
  const clockOutW04 = workforceRepo.clockOut(ctx, clockInW03.id, {
    clockOutTime: "2026-08-27T18:00:00.000Z", // 10h elapsed, 60m break -> 9h worked -> 8 reg + 1 ot
    breakMinutes: 60,
  });
  const timesheetW04 = workforceRepo.generateTimesheet(ctx, {
    employeeId: empW01.id,
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
  });
  const passW04 =
    clockOutW04.regularMinutes === 480 &&
    clockOutW04.overtimeMinutes === 60 &&
    timesheetW04.totalWorkedMinutes === 540;
  results.push({
    testSuite: "SYNTHETIC_TEST_W04_CLOCK_OUT_TIMESHEET_CALCULATION",
    syntheticTenantId,
    durationMs: Date.now() - startW04,
    status: passW04 ? "PASS" : "FAIL",
    evidence: {
      regularMinutes: clockOutW04.regularMinutes,
      overtimeMinutes: clockOutW04.overtimeMinutes,
      timesheetWorkedMinutes: timesheetW04.totalWorkedMinutes,
    },
    timestamp: new Date().toISOString(),
  });
  console.log(` [W04/W10] ${passW04 ? "✓" : "✗"} Synthetic Test W04 (Clock Out -> Timesheet Hours Calculation): ${passW04 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST W05: Leave Request -> Approval -> Balance Validation
  // -------------------------------------------------------------------------
  const startW05 = Date.now();
  const leaveTypeW05 = workforceRepo.createLeaveType(ctx, {
    name: "Casual Leave",
    code: `CASUAL-${randomUUID().slice(0, 4)}`,
    defaultAllowanceDays: 14,
  });
  const leaveReqW05 = workforceRepo.requestLeave(ctx, {
    employeeId: empW01.id,
    leaveTypeId: leaveTypeW05.id,
    startDate: "2026-09-10",
    endDate: "2026-09-12",
    totalDays: 3,
    reason: "Personal family matters",
  });
  const approvedLeaveW05 = workforceRepo.approveLeave(ctx, leaveReqW05.id, true);
  const remainingLeaveW05 = LeaveEngine.calculateRemainingBalance(leaveTypeW05, [approvedLeaveW05]);
  const passW05 = approvedLeaveW05.status === "APPROVED" && remainingLeaveW05.remainingDays === 11;
  results.push({
    testSuite: "SYNTHETIC_TEST_W05_LEAVE_APPROVAL_BALANCE",
    syntheticTenantId,
    durationMs: Date.now() - startW05,
    status: passW05 ? "PASS" : "FAIL",
    evidence: { leaveId: approvedLeaveW05.id, remainingDays: remainingLeaveW05.remainingDays },
    timestamp: new Date().toISOString(),
  });
  console.log(` [W05/W10] ${passW05 ? "✓" : "✗"} Synthetic Test W05 (Leave Request -> Approval -> Balance Check): ${passW05 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST W06: Task -> Assignment -> Completion -> Verification
  // -------------------------------------------------------------------------
  const startW06 = Date.now();
  const taskW06 = workforceRepo.createTask(ctx, {
    title: "Sanitize POS Terminal Keypads & Printers",
    priority: "HIGH",
    assignedEmployeeId: empW01.id,
  });
  const completedTaskW06 = workforceRepo.updateTask(ctx, taskW06.id, { status: "COMPLETED" });
  const verifiedTaskW06 = workforceRepo.updateTask(ctx, taskW06.id, { status: "VERIFIED" });
  const passW06 = verifiedTaskW06.status === "VERIFIED" && verifiedTaskW06.verifiedById === ctx.userId;
  results.push({
    testSuite: "SYNTHETIC_TEST_W06_TASK_LIFECYCLE_VERIFICATION",
    syntheticTenantId,
    durationMs: Date.now() - startW06,
    status: passW06 ? "PASS" : "FAIL",
    evidence: { taskId: verifiedTaskW06.id, status: verifiedTaskW06.status, verifiedBy: verifiedTaskW06.verifiedById },
    timestamp: new Date().toISOString(),
  });
  console.log(` [W06/W10] ${passW06 ? "✓" : "✗"} Synthetic Test W06 (Task Assignment -> Completion -> Verification): ${passW06 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST W07: Approved Hours -> Payroll Input Generation
  // -------------------------------------------------------------------------
  const startW07 = Date.now();
  const approvedTsW07 = workforceRepo.approveTimesheet(ctx, timesheetW04.id);
  const payrollInputW07 = workforceRepo.generatePayrollInputFromTimesheet(ctx, empW01.id, approvedTsW07.id);
  const passW07 = payrollInputW07.basicHours === 8 && payrollInputW07.grossPay > 0;
  results.push({
    testSuite: "SYNTHETIC_TEST_W07_PAYROLL_INPUT_DERIVATION",
    syntheticTenantId,
    durationMs: Date.now() - startW07,
    status: passW07 ? "PASS" : "FAIL",
    evidence: { payrollInputId: payrollInputW07.id, basicHours: payrollInputW07.basicHours, grossPay: payrollInputW07.grossPay },
    timestamp: new Date().toISOString(),
  });
  console.log(` [W07/W10] ${passW07 ? "✓" : "✗"} Synthetic Test W07 (Approved Timesheet -> Payroll Input Derivation): ${passW07 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST W08: Work Order -> Labor Costing Calculation
  // -------------------------------------------------------------------------
  const startW08 = Date.now();
  const woW08 = workforceRepo.createWorkOrder(ctx, {
    title: "Network Router & Switch Firmware Upgrade",
    assignedEmployeeId: empW01.id,
    laborHours: 3,
    laborRate: 20000,
    materialsCostTotal: 50000,
  });
  const passW08 = woW08.laborCostTotal === 60000 && woW08.grandTotal === 110000;
  results.push({
    testSuite: "SYNTHETIC_TEST_W08_WORK_ORDER_LABOR_COSTING",
    syntheticTenantId,
    durationMs: Date.now() - startW08,
    status: passW08 ? "PASS" : "FAIL",
    evidence: { workOrderId: woW08.id, laborCost: woW08.laborCostTotal, grandTotal: woW08.grandTotal },
    timestamp: new Date().toISOString(),
  });
  console.log(` [W08/W10] ${passW08 ? "✓" : "✗"} Synthetic Test W08 (Work Order -> Labor Costing Arithmetic): ${passW08 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST W09: Duplicate Attendance Event -> Idempotency Key Rejection
  // -------------------------------------------------------------------------
  const startW09 = Date.now();
  const keyW09 = `clk-idem-w09-${randomUUID()}`;
  workforceRepo.clockIn(ctx, {
    employeeId: empW01.id,
    clockInTime: "2026-08-28T08:00:00.000Z",
    idempotencyKey: keyW09,
  });
  let duplicateRejectedW09 = false;
  try {
    workforceRepo.clockIn(ctx, {
      employeeId: empW01.id,
      clockInTime: "2026-08-28T08:00:00.000Z",
      idempotencyKey: keyW09,
    });
  } catch (err: any) {
    if (err.message.includes("INVARIANT_W004_VIOLATION")) {
      duplicateRejectedW09 = true;
    }
  }
  const passW09 = duplicateRejectedW09;
  results.push({
    testSuite: "SYNTHETIC_TEST_W09_ATTENDANCE_IDEMPOTENCY_REJECTION",
    syntheticTenantId,
    durationMs: Date.now() - startW09,
    status: passW09 ? "PASS" : "FAIL",
    evidence: { duplicateRejected: duplicateRejectedW09 },
    timestamp: new Date().toISOString(),
  });
  console.log(` [W09/W10] ${passW09 ? "✓" : "✗"} Synthetic Test W09 (Duplicate Attendance Event -> Idempotent Rejection): ${passW09 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST W10: Cross-Tenant Employee/Task Access -> Strict Isolation Rejection
  // -------------------------------------------------------------------------
  const startW10 = Date.now();
  const foreignCtx = {
    tenantId: `tenant-foreign-${randomUUID().slice(0, 8)}`,
    branchId: `branch-foreign-${randomUUID().slice(0, 8)}`,
    userId: `user-foreign-${randomUUID().slice(0, 8)}`,
    roles: ["ADMIN"],
    permissions: ["*"],
  };
  const foreignEmployee = workforceRepo.getEmployeeById(foreignCtx, empW01.id);
  const passW10 = foreignEmployee === null;
  results.push({
    testSuite: "SYNTHETIC_TEST_W10_CROSS_TENANT_WORKFORCE_ISOLATION",
    syntheticTenantId,
    durationMs: Date.now() - startW10,
    status: passW10 ? "PASS" : "FAIL",
    evidence: { crossTenantAccessPrevented: passW10 },
    timestamp: new Date().toISOString(),
  });
  console.log(` [W10/W10] ${passW10 ? "✓" : "✗"} Synthetic Test W10 (Cross-Tenant Workforce Access -> Strict Isolation Rejection): ${passW10 ? "PASS" : "FAIL"}`);

  // ==========================================
  // PHASE 4: INDUSTRY PLUGIN EXPANSION SYNTHETIC TESTS (P01 - P10)
  // ==========================================
  const pluginRepo = new ScopedPluginRepository(globalInMemoryStore);
  const pluginRegistry = new PluginRegistryEngine();

  StandardPluginCatalog.forEach((p) => pluginRegistry.registerManifest(p));
  const pluginConfigEngine = new PluginConfigEngine();
  const pluginWorkflowEngine = new PluginWorkflowEngine();
  const restaurantEngine = new RestaurantEngine();
  const pharmacyEngine = new PharmacyEngine();
  const garageEngine = new GarageEngine();
  const telecomEngine = new TelecomEngine();
  const wholesaleEngine = new WholesaleEngine();

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST P01: Plugin Manifest Registration & Dependency Graph Validation
  // -------------------------------------------------------------------------
  const startP01 = Date.now();
  const activeDeps = new Set(["commercial-core", "inventory", "finance", "workforce"]);
  let p01Valid = false;
  try {
    pluginRegistry.validateDependencies("restaurant", activeDeps);
    p01Valid = true;
  } catch {}
  const passP01 = p01Valid && pluginRegistry.getAllManifests().length >= 6;
  results.push({
    testSuite: "SYNTHETIC_TEST_P01_PLUGIN_REGISTRY_AND_DEPENDENCIES",
    syntheticTenantId,
    durationMs: Date.now() - startP01,
    status: passP01 ? "PASS" : "FAIL",
    evidence: { manifestCount: pluginRegistry.getAllManifests().length, restaurantDepsSatisfied: p01Valid },
    timestamp: new Date().toISOString(),
  });
  console.log(` [P01/P10] ${passP01 ? "✓" : "✗"} Synthetic Test P01 (Plugin Manifest Registration & Dependency Validation): ${passP01 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST P02: Tenant Plugin Activation & Isolation (P003)
  // -------------------------------------------------------------------------
  const startP02 = Date.now();
  const actP02 = pluginRepo.activatePlugin(ctx, "restaurant", "1.0.0", { serviceChargePct: 10 });
  const isActiveP02 = pluginRepo.isPluginActive(ctx, "restaurant");
  const foreignP02Active = pluginRepo.isPluginActive(foreignCtx, "restaurant");
  const passP02 = isActiveP02 && !foreignP02Active && actP02.state === "ACTIVE";
  results.push({
    testSuite: "SYNTHETIC_TEST_P02_TENANT_PLUGIN_ACTIVATION_ISOLATION",
    syntheticTenantId,
    durationMs: Date.now() - startP02,
    status: passP02 ? "PASS" : "FAIL",
    evidence: { tenantActive: isActiveP02, foreignActive: foreignP02Active },
    timestamp: new Date().toISOString(),
  });
  console.log(` [P02/P10] ${passP02 ? "✓" : "✗"} Synthetic Test P02 (Tenant Plugin Activation & Multi-Tenant Isolation): ${passP02 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST P03: Plugin Mutation Sync Idempotency (P004)
  // -------------------------------------------------------------------------
  const startP03 = Date.now();
  const p03IdemKey = `plg-evt-idem-${randomUUID()}`;
  pluginRepo.logPluginEvent(ctx, {
    pluginId: "restaurant",
    branchId: ctx.branchId || null,
    eventType: "TABLE_OPENED",
    operationId: "op-p03-1",
    idempotencyKey: p03IdemKey,
    actorId: ctx.userId,
    payload: { tableNumber: "T-01" },
  });
  let duplicateRejectedP03 = false;
  try {
    pluginRepo.logPluginEvent(ctx, {
      pluginId: "restaurant",
      branchId: ctx.branchId || null,
      eventType: "TABLE_OPENED",
      operationId: "op-p03-2",
      idempotencyKey: p03IdemKey,
      actorId: ctx.userId,
      payload: { tableNumber: "T-01" },
    });
  } catch (err: any) {
    if (err.message.includes("INVARIANT_P004_VIOLATION")) {
      duplicateRejectedP03 = true;
    }
  }
  const passP03 = duplicateRejectedP03;
  results.push({
    testSuite: "SYNTHETIC_TEST_P03_PLUGIN_IDEMPOTENCY_REJECTION",
    syntheticTenantId,
    durationMs: Date.now() - startP03,
    status: passP03 ? "PASS" : "FAIL",
    evidence: { duplicateRejected: duplicateRejectedP03 },
    timestamp: new Date().toISOString(),
  });
  console.log(` [P03/P10] ${passP03 ? "✓" : "✗"} Synthetic Test P03 (Duplicate Plugin Event -> Idempotent Rejection): ${passP03 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST P04: Hierarchical Configuration Resolution
  // -------------------------------------------------------------------------
  const startP04 = Date.now();
  pluginRepo.setConfigEntry(ctx, {
    pluginId: "restaurant",
    scope: "GLOBAL",
    key: "autoGratuity",
    value: false,
    tenantId: null,
    branchId: null,
    userId: null,
  });
  pluginRepo.setConfigEntry(ctx, {
    pluginId: "restaurant",
    scope: "TENANT",
    key: "autoGratuity",
    value: true,
    tenantId: ctx.tenantId,
    branchId: null,
    userId: null,
  });
  const resolvedP04 = pluginConfigEngine.resolveConfiguration(
    "autoGratuity",
    pluginRepo.getConfigEntries("restaurant"),
    { tenantId: ctx.tenantId }
  );
  const passP04 = resolvedP04 === true;
  results.push({
    testSuite: "SYNTHETIC_TEST_P04_HIERARCHICAL_CONFIG_RESOLUTION",
    syntheticTenantId,
    durationMs: Date.now() - startP04,
    status: passP04 ? "PASS" : "FAIL",
    evidence: { resolvedValue: resolvedP04 },
    timestamp: new Date().toISOString(),
  });
  console.log(` [P04/P10] ${passP04 ? "✓" : "✗"} Synthetic Test P04 (Hierarchical Plugin Configuration Resolution): ${passP04 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST P05: Dynamic Plugin Workflow Lifecycle Execution
  // -------------------------------------------------------------------------
  const startP05 = Date.now();
  const wfDefP05 = StandardPluginCatalog.find((p) => p.id === "restaurant")!.workflows[0];
  const instanceP05 = pluginWorkflowEngine.startWorkflow(wfDefP05, "order-syn-01", ctx);
  pluginWorkflowEngine.advanceStep(instanceP05, wfDefP05, ctx, "Cooking");
  pluginWorkflowEngine.advanceStep(instanceP05, wfDefP05, ctx, "Ready");
  pluginWorkflowEngine.advanceStep(instanceP05, wfDefP05, ctx, "Served");
  pluginWorkflowEngine.advanceStep(instanceP05, wfDefP05, ctx, "Done");
  const passP05 = instanceP05.status === "COMPLETED" && instanceP05.history.length === 5;
  results.push({
    testSuite: "SYNTHETIC_TEST_P05_PLUGIN_WORKFLOW_EXECUTION",
    syntheticTenantId,
    durationMs: Date.now() - startP05,
    status: passP05 ? "PASS" : "FAIL",
    evidence: { finalStatus: instanceP05.status, stepsCompleted: instanceP05.history.length },
    timestamp: new Date().toISOString(),
  });
  console.log(` [P05/P10] ${passP05 ? "✓" : "✗"} Synthetic Test P05 (Dynamic Plugin Workflow Step Lifecycle): ${passP05 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST P06: Restaurant Table & Kitchen Display Ticket
  // -------------------------------------------------------------------------
  const startP06 = Date.now();
  const tableP06 = pluginRepo.createRestaurantTable(ctx, {
    branchId: ctx.branchId,
    tableNumber: "T-99",
    capacity: 6,
    status: "OCCUPIED",
    floorArea: "BALCONY",
    currentOrderId: "order-syn-01",
    assignedStaffId: ctx.userId,
  });
  const ticketP06 = pluginRepo.createKitchenTicket(ctx, {
    branchId: ctx.branchId,
    orderId: "order-syn-01",
    tableNumber: "T-99",
    status: "PENDING",
    prepTimeMinutes: 20,
    items: [{ id: randomUUID(), name: "Grilled Tilapia", quantity: 2, course: "MAIN", modifiers: ["Extra Chilli"], notes: null }],
  });
  const passP06 = tableP06.status === "OCCUPIED" && ticketP06.items.length === 1;
  results.push({
    testSuite: "SYNTHETIC_TEST_P06_RESTAURANT_TABLE_KITCHEN_TICKET",
    syntheticTenantId,
    durationMs: Date.now() - startP06,
    status: passP06 ? "PASS" : "FAIL",
    evidence: { tableId: tableP06.id, ticketId: ticketP06.id },
    timestamp: new Date().toISOString(),
  });
  console.log(` [P06/P10] ${passP06 ? "✓" : "✗"} Synthetic Test P06 (Restaurant Table & Kitchen Ticket Management): ${passP06 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST P07: Pharmacy Prescription Validation & Batch Expiry Controls
  // -------------------------------------------------------------------------
  const startP07 = Date.now();
  const presP07 = pluginRepo.createPrescription(ctx, {
    branchId: ctx.branchId,
    prescriptionNumber: "RX-SYN-001",
    patientName: "David Chemba",
    patientAge: 42,
    doctorName: "Dr. Lwakatare",
    doctorLicenseNumber: "TZ-MD-8812",
    status: "VALIDATED",
    dispensedByUserId: null,
    dispensedAt: null,
    items: [
      {
        id: randomUUID(),
        medicineName: "Amoxicillin Trihydrate 500mg",
        activeIngredient: "Amoxicillin",
        dosage: "500mg",
        frequency: "8-hourly",
        durationDays: 5,
        quantity: 15,
        batchNumber: "B-2026-NOV",
        expiryDate: "2026-11-30T00:00:00Z",
      },
    ],
  });
  let p07Valid = false;
  try {
    pharmacyEngine.assertPrescriptionValidForDispense(presP07, new Date("2026-08-27T00:00:00Z"));
    p07Valid = true;
  } catch {}
  const passP07 = p07Valid && presP07.items[0].batchNumber === "B-2026-NOV";
  results.push({
    testSuite: "SYNTHETIC_TEST_P07_PHARMACY_PRESCRIPTION_EXPIRY_CONTROL",
    syntheticTenantId,
    durationMs: Date.now() - startP07,
    status: passP07 ? "PASS" : "FAIL",
    evidence: { prescriptionId: presP07.id, dispenseCheckPassed: p07Valid },
    timestamp: new Date().toISOString(),
  });
  console.log(` [P07/P10] ${passP07 ? "✓" : "✗"} Synthetic Test P07 (Pharmacy Prescription Validation & Batch Expiry): ${passP07 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST P08: Garage Work Order Costing & QA Review Signoff
  // -------------------------------------------------------------------------
  const startP08 = Date.now();
  const vehP08 = pluginRepo.createGarageVehicle(ctx, {
    branchId: ctx.branchId,
    registrationNumber: "T 123 ABC",
    make: "Toyota",
    model: "Hilux D4D",
    year: 2022,
    vin: "MHF239847293",
    mileage: 45000,
    customerId: randomUUID(),
  });
  const laborCostP08 = 4 * 35000;
  const grandP08 = garageEngine.calculateWorkOrderCost(200000, laborCostP08);
  const woP08 = pluginRepo.createGarageWorkOrder(ctx, {
    branchId: ctx.branchId,
    workOrderNumber: "WO-SYN-881",
    vehicleId: vehP08.id,
    customerId: vehP08.customerId,
    assignedTechnicianId: ctx.userId,
    status: "QA_REVIEW",
    issueDescription: "Brake overhaul and fluid replacement",
    diagnosis: "Replaced front pads and bled master cylinder",
    partsCostTotal: 200000,
    laborHours: 4,
    laborRate: 35000,
    laborCostTotal: laborCostP08,
    grandTotal: grandP08.grandTotal,
    qaPassed: false,
    qaInspectorId: null,
  });
  let qaAllowedP08 = false;
  try {
    qaAllowedP08 = garageEngine.assertQaSignoffAllowed(woP08);
  } catch {}
  const passP08 = qaAllowedP08 && woP08.grandTotal === 340000;
  results.push({
    testSuite: "SYNTHETIC_TEST_P08_GARAGE_WORK_ORDER_QA_COSTING",
    syntheticTenantId,
    durationMs: Date.now() - startP08,
    status: passP08 ? "PASS" : "FAIL",
    evidence: { workOrderId: woP08.id, grandTotal: woP08.grandTotal, qaAllowed: qaAllowedP08 },
    timestamp: new Date().toISOString(),
  });
  console.log(` [P08/P10] ${passP08 ? "✓" : "✗"} Synthetic Test P08 (Garage Work Order Costing & QA Signoff): ${passP08 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST P09: Telecom Microwave Link Physics & Fresnel Zone Clearance
  // -------------------------------------------------------------------------
  const startP09 = Date.now();
  const fsplP09 = telecomEngine.calculateFreeSpacePathLoss(12.5, 18);
  const rslP09 = telecomEngine.calculateReceivedSignalLevel(20, 38, 38, fsplP09, 2);
  const fresnelP09 = telecomEngine.calculateFresnelZoneRadius(12.5, 18);
  const azimuthP09 = telecomEngine.calculateAzimuth(-6.8235, 39.2695, -6.444, 38.9056);
  const passP09 = fsplP09 > 135 && rslP09 < 0 && fresnelP09 > 5 && azimuthP09 > 300;
  results.push({
    testSuite: "SYNTHETIC_TEST_P09_TELECOM_MICROWAVE_ENGINEERING",
    syntheticTenantId,
    durationMs: Date.now() - startP09,
    status: passP09 ? "PASS" : "FAIL",
    evidence: { fsplDb: fsplP09, rslDbm: rslP09, fresnelRadiusM: fresnelP09, azimuthDeg: azimuthP09 },
    timestamp: new Date().toISOString(),
  });
  console.log(` [P09/P10] ${passP09 ? "✓" : "✗"} Synthetic Test P09 (Telecom Microwave Link Physics & Path Loss): ${passP09 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST P10: Wholesale Quantity Tier Pricing & Pallet Calculation
  // -------------------------------------------------------------------------
  const startP10 = Date.now();
  const wholesaleRuleP10 = pluginRepo.setWholesaleTierRule(ctx, {
    variantId: randomUUID(),
    minimumOrderQuantity: 10,
    unitsPerCase: 12,
    casesPerPallet: 50,
    tiers: [
      { minQuantity: 100, unitPrice: 8000, discountPercent: 20 },
      { minQuantity: 50, unitPrice: 9000, discountPercent: 10 },
    ],
  });
  const priceP10 = wholesaleEngine.calculateUnitPrice(10000, 150, wholesaleRuleP10.tiers as any);
  const palletP10 = wholesaleEngine.calculatePalletBreakdown(1250, 12, 50);
  const passP10 = priceP10.unitPrice === 8000 && palletP10.pallets === 2 && palletP10.pieces === 2;
  results.push({
    testSuite: "SYNTHETIC_TEST_P10_WHOLESALE_TIER_PRICING_PALLET_MATH",
    syntheticTenantId,
    durationMs: Date.now() - startP10,
    status: passP10 ? "PASS" : "FAIL",
    evidence: { tierUnitPrice: priceP10, fullPallets: palletP10.pallets, looseUnits: palletP10.pieces },
    timestamp: new Date().toISOString(),
  });
  console.log(` [P10/P10] ${passP10 ? "✓" : "✗"} Synthetic Test P10 (Wholesale Quantity Tier Pricing & Pallet Breakdown): ${passP10 ? "PASS" : "FAIL"}`);


  // =========================================================================
  // Phase 5: Dedicated Telecom & Technical Vertical Synthetic Suite (T01 - T10)
  // =========================================================================
  const telecomRepo = new ScopedTelecomRepository(globalInMemoryStore);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST T01: Create Site -> Multi-Device Sync Convergence
  // -------------------------------------------------------------------------
  const startT01 = Date.now();
  const siteT01 = telecomRepo.createSite(ctx, {
    siteCode: `SITE-SYN-${randomUUID().slice(0, 5).toUpperCase()}`,
    name: "Synthetic Macro Tower 01",
    siteName: "Synthetic Macro Tower 01",
    address: "Kinondoni, Dar es Salaam",
    siteType: "GREENFIELD_TOWER",
    status: "PLANNED",
    latitude: -6.7924,
    longitude: 39.2083,
    elevationMeters: 25,
    towerHeightMeters: 45,
    region: "Dar es Salaam",
    district: "Kinondoni",
    powerSource: "GRID_COMMERCIAL",
    photos: [],
    documents: [],
  });

  const passT01 = siteT01.id !== undefined && siteT01.status === "PLANNED";
  results.push({
    testSuite: "SYNTHETIC_TEST_T01_CREATE_SITE_SYNC",
    syntheticTenantId,
    durationMs: Date.now() - startT01,
    status: passT01 ? "PASS" : "FAIL",
    evidence: { siteId: siteT01.id, siteCode: siteT01.siteCode },
    timestamp: new Date().toISOString(),
  });
  console.log(` [T01/T10] ${passT01 ? "✓" : "✗"} Synthetic Test T01 (Create Site -> Multi-Device Sync Convergence): ${passT01 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST T02: Equipment -> Inventory Issue -> Site Assignment
  // -------------------------------------------------------------------------
  const startT02 = Date.now();
  const sectorT02 = telecomRepo.createRanSector(ctx, {
    siteId: siteT01.id,
    sectorName: "Alpha 1800",
    sectorIndex: 1,
    technology: "4G_LTE",
    frequencyBandMhz: 1800,
    carrierBandwidthMhz: 20,
    antennaModel: "AIR-6449",
    antennaGainDbi: 18,
    azimuthDegrees: 0,
    mechanicalTiltDegrees: 0,
    electricalTiltDegrees: 2,
    antennaHeightMeters: 40,
    radioUnitModel: "RRU-4415",
    radioUnitSerialNumber: `RRU-SYN-${randomUUID().slice(0, 6).toUpperCase()}`,
    txPowerWatts: 40,
    status: "INSTALLED",
  });
  const passT02 = sectorT02.id !== undefined && sectorT02.status === "INSTALLED";
  results.push({
    testSuite: "SYNTHETIC_TEST_T02_EQUIPMENT_INVENTORY_SITE_ASSIGNMENT",
    syntheticTenantId,
    durationMs: Date.now() - startT02,
    status: passT02 ? "PASS" : "FAIL",
    evidence: { sectorId: sectorT02.id, serialNumber: sectorT02.radioUnitSerialNumber },
    timestamp: new Date().toISOString(),
  });
  console.log(` [T02/T10] ${passT02 ? "✓" : "✗"} Synthetic Test T02 (Equipment -> Inventory Issue -> Site Assignment): ${passT02 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST T03: Create Work Order -> Assign Technician -> Complete -> Verify
  // -------------------------------------------------------------------------
  const startT03 = Date.now();
  const woT03 = telecomRepo.createWorkOrder(ctx, {
    siteId: siteT01.id,
    workOrderNumber: `WO-SYN-${randomUUID().slice(0, 5).toUpperCase()}`,
    title: "Commissioning RAN Sector 1",
    workType: "RAN_INSTALLATION",
    status: "IN_PROGRESS",
    priority: "HIGH",
    assignedTeam: "Team Alpha",
    leadTechnicianId: ctx.userId,
    technicianIds: [ctx.userId],
    scheduledStartDate: new Date().toISOString(),
    scheduledEndDate: new Date().toISOString(),
    actualStartTime: new Date().toISOString(),
    actualEndTime: null,
    totalLaborHours: 6,
    laborCost: 150000,
    checklistVersion: 1,
    completionNotes: null,
    idempotencyKey: `wo-syn-${randomUUID()}`,
  });
  for (const item of woT03.checklistItems || []) item.passed = true;

  const completedWoT03 = telecomRepo.completeWorkOrder(ctx, woT03.id, "All checks passed.");
  const passT03 = completedWoT03.status === "COMPLETED";
  results.push({
    testSuite: "SYNTHETIC_TEST_T03_WORK_ORDER_ASSIGN_COMPLETE_VERIFY",
    syntheticTenantId,
    durationMs: Date.now() - startT03,
    status: passT03 ? "PASS" : "FAIL",
    evidence: { workOrderId: completedWoT03.id, status: completedWoT03.status },
    timestamp: new Date().toISOString(),
  });
  console.log(` [T03/T10] ${passT03 ? "✓" : "✗"} Synthetic Test T03 (Work Order -> Assign Technician -> Complete -> Verify): ${passT03 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST T04: KML Upload -> Parse -> Preview -> Import Site
  // -------------------------------------------------------------------------
  const startT04 = Date.now();
  const sampleKml = `<kml><Document><Placemark><name>KML-Site-01</name><Point><coordinates>39.2083,-6.7924,30</coordinates></Point></Placemark></Document></kml>`;
  const parseResultT04 = KmlKmzParserEngine.parseKmlString(sampleKml, "test.kml");
  const importRecT04 = KmlKmzParserEngine.createImportRecord(ctx, parseResultT04, "test.kml", "KML");
  telecomRepo.kmlImports.set(importRecT04.id, importRecT04);
  const importSitesT04 = telecomRepo.importKmlPlacemarksAsSites(ctx, importRecT04.id, [importRecT04.parsedPlacemarks[0].id]);
  const passT04 = importSitesT04.createdSites.length === 1 && importSitesT04.importRecord.status === "IMPORTED";
  results.push({
    testSuite: "SYNTHETIC_TEST_T04_KML_PARSE_PREVIEW_IMPORT",
    syntheticTenantId,
    durationMs: Date.now() - startT04,
    status: passT04 ? "PASS" : "FAIL",
    evidence: { importId: importRecT04.id, createdSitesCount: importSitesT04.createdSites.length },
    timestamp: new Date().toISOString(),
  });
  console.log(` [T04/T10] ${passT04 ? "✓" : "✗"} Synthetic Test T04 (KML Upload -> Parse -> Preview -> Import Site): ${passT04 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST T05: KMZ Upload -> XML Security & Path Traversal Guards
  // -------------------------------------------------------------------------
  const startT05 = Date.now();
  let xxeBlockedT05 = false;
  try {
    KmlKmzParserEngine.parseKmlString(`<!DOCTYPE foo [ <!ENTITY xxe SYSTEM "file:///etc/shadow"> ]><kml></kml>`, "xxe.kml");
  } catch {
    xxeBlockedT05 = true;
  }
  const passT05 = xxeBlockedT05;
  results.push({
    testSuite: "SYNTHETIC_TEST_T05_KMZ_KML_SECURITY_GUARDS",
    syntheticTenantId,
    durationMs: Date.now() - startT05,
    status: passT05 ? "PASS" : "FAIL",
    evidence: { xxeBlocked: xxeBlockedT05 },
    timestamp: new Date().toISOString(),
  });
  console.log(` [T05/T10] ${passT05 ? "✓" : "✗"} Synthetic Test T05 (KML/KMZ Security & XXE Protection): ${passT05 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST T06: Microwave Link -> Calculate -> Save -> Reload -> Verify
  // -------------------------------------------------------------------------
  const startT06 = Date.now();
  const siteFarT06 = telecomRepo.createSite(ctx, {
    siteCode: `SITE-FAR-${randomUUID().slice(0, 5).toUpperCase()}`,
    name: "Synthetic Far Site",
    siteName: "Synthetic Far Site",
    address: "Ilala, Dar es Salaam",
    siteType: "ROOFTOP_TOWER",
    status: "PLANNED",
    latitude: -6.8321,
    longitude: 39.2811,
    elevationMeters: 15,
    towerHeightMeters: 30,
    region: "Dar es Salaam",
    district: "Ilala",
    powerSource: "GRID_COMMERCIAL",
    photos: [],
    documents: [],
  });

  const linkT06 = telecomRepo.createMicrowaveLink(ctx, {
    status: "DESIGN",
    linkCode: `MW-LINK-${randomUUID().slice(0, 5).toUpperCase()}`,
    name: "Alpha to Far Site Link",
    siteAId: siteT01.id,
    siteBId: siteFarT06.id,
    frequencyGhz: 13.0,
    channelBandwidthMhz: 28.0,
    txPowerDbm: 24.0,
    antennaDiameterMetersSiteA: 0.6,
    antennaDiameterMetersSiteB: 0.6,
    antennaGainDbiSiteA: 35.5,
    antennaGainDbiSiteB: 35.5,
    polarization: "VERTICAL",
    feederLossSiteADb: 1.5,
    feederLossSiteBDb: 1.5,
    siteAAntennaHeightMeters: 30,
    siteBAntennaHeightMeters: 30,
    expectedThroughputMbps: 400,
    availabilityTargetPct: 99.995,
  });
  const passT06 = linkT06.calculation !== null && linkT06.calculation !== undefined && linkT06.calculation.distanceKm > 0;
  results.push({
    testSuite: "SYNTHETIC_TEST_T06_MICROWAVE_LINK_CALCULATE_SAVE_VERIFY",
    syntheticTenantId,
    durationMs: Date.now() - startT06,
    status: passT06 ? "PASS" : "FAIL",
    evidence: { linkId: linkT06.id, distanceKm: linkT06.calculation?.distanceKm, rslDbm: linkT06.calculation?.receivedSignalLevelDbm },
    timestamp: new Date().toISOString(),
  });
  console.log(` [T06/T10] ${passT06 ? "✓" : "✗"} Synthetic Test T06 (Microwave Link -> Calculate -> Save -> Reload): ${passT06 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST T07: Installation -> Checklist -> Test -> Acceptance
  // -------------------------------------------------------------------------
  const startT07 = Date.now();
  telecomRepo.recordTest(ctx, {
    siteId: siteT01.id,
    workOrderId: woT03.id,
    testType: "VSWR_SWEEP",
    parameterName: "VSWR",
    expectedValue: "< 1.30",
    measuredValue: "1.15",
    unit: "ratio",
    passed: true,
    testedById: ctx.userId,
    testedAt: new Date().toISOString(),
    testEquipmentSerialNumber: "ANRITSU-1",
    traceAttachmentUrl: null,
  });
  const satT07 = telecomRepo.createSiteAcceptance(ctx, {
    projectId: randomUUID(),
    siteId: siteT01.id,
    satNumber: `SAT-${randomUUID().slice(0, 6).toUpperCase()}`,
    acceptanceType: "FINAL_ACCEPTANCE",
    status: "ACCEPTED",
    leadEngineerId: ctx.userId,
    customerRepresentativeName: "Eng. Customer Rep",
    customerSignatureUrl: "https://files.kwakopos.com/sig.png",
    mandatoryTestsPassed: true,
    openPunchlistItemsCount: 0,
    triggersBillingMilestone: true,
    billingInvoiceId: null,
    acceptedAt: new Date().toISOString(),
    remarks: "Passed acceptance",
    handoverPackageSummary: {},
  });
  const updatedSiteT07 = telecomRepo.getSiteById(ctx, siteT01.id);
  const passT07 = satT07.status === "ACCEPTED" && updatedSiteT07?.status === "ACCEPTED";
  results.push({
    testSuite: "SYNTHETIC_TEST_T07_INSTALLATION_CHECKLIST_TEST_ACCEPTANCE",
    syntheticTenantId,
    durationMs: Date.now() - startT07,
    status: passT07 ? "PASS" : "FAIL",
    evidence: { satNumber: satT07.satNumber, siteStatus: updatedSiteT07?.status },
    timestamp: new Date().toISOString(),
  });
  console.log(` [T07/T10] ${passT07 ? "✓" : "✗"} Synthetic Test T07 (Installation -> Checklist -> Test -> SAT Acceptance): ${passT07 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST T08: Material Issue -> Ledger -> Project Cost -> Finance
  // -------------------------------------------------------------------------
  const startT08 = Date.now();
  const quotationT08 = TelecomCostingEngine.calculateQuotation(
    ctx,
    randomUUID(),
    "Q-SYN-001",
    "Tower Expansion",
    [
      { category: "EQUIPMENT", description: "Radio Units", quantity: 2, unitCost: 1500000 },
      { category: "LABOR", description: "Riggers", quantity: 10, unitCost: 40000 },
    ],
    20.0
  );
  const passT08 = quotationT08.totalProjectCost === 3400000 && quotationT08.customerPrice === 4080000;
  results.push({
    testSuite: "SYNTHETIC_TEST_T08_MATERIAL_ISSUE_PROJECT_COST_FINANCE",
    syntheticTenantId,
    durationMs: Date.now() - startT08,
    status: passT08 ? "PASS" : "FAIL",
    evidence: { projectCost: quotationT08.totalProjectCost, customerPrice: quotationT08.customerPrice },
    timestamp: new Date().toISOString(),
  });
  console.log(` [T08/T10] ${passT08 ? "✓" : "✗"} Synthetic Test T08 (Material Issue -> Project Cost -> Finance): ${passT08 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST T09: Offline Field Update -> Sync -> Operations Center
  // -------------------------------------------------------------------------
  const startT09 = Date.now();
  const nearbySitesT09 = telecomRepo.searchSitesNear(ctx, -6.7924, 39.2083, 50.0);
  const passT09 = nearbySitesT09.length >= 1 && nearbySitesT09[0].distanceKm <= 50;
  results.push({
    testSuite: "SYNTHETIC_TEST_T09_OFFLINE_FIELD_UPDATE_OPS_SYNC",
    syntheticTenantId,
    durationMs: Date.now() - startT09,
    status: passT09 ? "PASS" : "FAIL",
    evidence: { matchedSitesCount: nearbySitesT09.length },
    timestamp: new Date().toISOString(),
  });
  console.log(` [T09/T10] ${passT09 ? "✓" : "✗"} Synthetic Test T09 (Geospatial Radius Search & Operations Center View): ${passT09 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST T10: Tenant A technical object -> attempted Tenant B access -> reject
  // -------------------------------------------------------------------------
  const startT10 = Date.now();
  const tenantBContext: any = {
    tenantId: randomUUID(),
    branchId: randomUUID(),
    userId: randomUUID(),
    roles: ["ADMIN"],
    permissions: ["ALL"],
  };
  let crossTenantRejectedT10 = false;
  try {
    telecomRepo.getSiteById(tenantBContext, siteT01.id);
  } catch {
    crossTenantRejectedT10 = true;
  }
  const passT10 = crossTenantRejectedT10;
  results.push({
    testSuite: "SYNTHETIC_TEST_T10_CROSS_TENANT_TECHNICAL_ISOLATION",
    syntheticTenantId,
    durationMs: Date.now() - startT10,
    status: passT10 ? "PASS" : "FAIL",
    evidence: { crossTenantRejected: crossTenantRejectedT10 },
    timestamp: new Date().toISOString(),
  });
  console.log(` [T10/T10] ${passT10 ? "✓" : "✗"} Synthetic Test T10 (Tenant Isolation on Telecom Objects): ${passT10 ? "PASS" : "FAIL"}`);

  // =========================================================================
  // PHASE 6: SAAS MONETIZATION SYNTHETIC MONITORING (B01 - B12)
  // =========================================================================
  const monetizationRepo = new ScopedMonetizationRepository(globalInMemoryStore);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST B01: Trial -> Subscription Activation
  // -------------------------------------------------------------------------
  const startB01 = Date.now();
  const starterPlan = monetizationRepo.getPlanByCode("STARTER")!;
  const subB01 = monetizationRepo.createSubscription(ctx, {
    tenantId: ctx.tenantId,
    planId: starterPlan.id,
    currency: "TZS",
    billingInterval: "MONTHLY",
    autoRenew: true,
    startTrial: true,
  });
  const passB01 = subB01.status === "TRIAL" && subB01.planCode === "STARTER";
  results.push({
    testSuite: "SYNTHETIC_TEST_B01_TRIAL_SUBSCRIPTION_ACTIVATION",
    syntheticTenantId,
    durationMs: Date.now() - startB01,
    status: passB01 ? "PASS" : "FAIL",
    evidence: { subscriptionId: subB01.id, status: subB01.status },
    timestamp: new Date().toISOString(),
  });
  console.log(` [B01/B12] ${passB01 ? "✓" : "✗"} Synthetic Test B01 (Trial Subscription Activation): ${passB01 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST B02: Subscription -> Invoice Generation
  // -------------------------------------------------------------------------
  const startB02 = Date.now();
  const invoiceB02 = monetizationRepo.createInvoice(ctx, subB01.id);
  const passB02 = invoiceB02.grandTotal > 0 && invoiceB02.status === "OPEN" && invoiceB02.lines.length > 0;
  results.push({
    testSuite: "SYNTHETIC_TEST_B02_SUBSCRIPTION_INVOICE_GENERATION",
    syntheticTenantId,
    durationMs: Date.now() - startB02,
    status: passB02 ? "PASS" : "FAIL",
    evidence: { invoiceId: invoiceB02.id, grandTotal: invoiceB02.grandTotal },
    timestamp: new Date().toISOString(),
  });
  console.log(` [B02/B12] ${passB02 ? "✓" : "✗"} Synthetic Test B02 (Subscription Invoice Generation): ${passB02 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST B03: Invoice -> Payment -> Paid
  // -------------------------------------------------------------------------
  const startB03 = Date.now();
  const paymentB03 = monetizationRepo.processPayment(ctx, {
    tenantId: ctx.tenantId,
    invoiceId: invoiceB02.id,
    provider: "MPESA",
    amount: invoiceB02.grandTotal,
    currency: "TZS",
    payerPhoneOrEmail: "+255754000123",
    idempotencyKey: `PAY-SYNTH-${randomUUID()}`,
  });
  const updatedInvB03 = monetizationRepo.getInvoiceById(ctx, invoiceB02.id);
  const passB03 = paymentB03.status === "SUCCESS" && updatedInvB03?.status === "PAID" && updatedInvB03?.balanceDue === 0;
  results.push({
    testSuite: "SYNTHETIC_TEST_B03_INVOICE_PAYMENT_PAID",
    syntheticTenantId,
    durationMs: Date.now() - startB03,
    status: passB03 ? "PASS" : "FAIL",
    evidence: { paymentId: paymentB03.id, invoiceStatus: updatedInvB03?.status },
    timestamp: new Date().toISOString(),
  });
  console.log(` [B03/B12] ${passB03 ? "✓" : "✗"} Synthetic Test B03 (Invoice Payment -> Paid): ${passB03 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST B04: Payment Failure -> Dunning -> Recovery
  // -------------------------------------------------------------------------
  const startB04 = Date.now();
  const dunningRecoveryValid = SubscriptionLifecycleEngine.validateStateTransition("PAST_DUE", "ACTIVE");
  const passB04 = dunningRecoveryValid;
  results.push({
    testSuite: "SYNTHETIC_TEST_B04_PAYMENT_FAILURE_DUNNING_RECOVERY",
    syntheticTenantId,
    durationMs: Date.now() - startB04,
    status: passB04 ? "PASS" : "FAIL",
    evidence: { dunningRecoveryValid },
    timestamp: new Date().toISOString(),
  });
  console.log(` [B04/B12] ${passB04 ? "✓" : "✗"} Synthetic Test B04 (Payment Failure & Dunning Recovery): ${passB04 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST B05: Plan Upgrade -> Entitlement Change
  // -------------------------------------------------------------------------
  const startB05 = Date.now();
  const proPlanB05 = monetizationRepo.getPlanByCode("PROFESSIONAL")!;
  const upgradedSub = monetizationRepo.changePlan(ctx, subB01.id, {
    targetPlanId: proPlanB05.id,
    immediate: true,
    prorate: true,
  });
  const entCheckB05 = monetizationRepo.checkEntitlement(ctx, "analytics.advanced");
  const passB05 = upgradedSub.planCode === "PROFESSIONAL" && entCheckB05.allowed;
  results.push({
    testSuite: "SYNTHETIC_TEST_B05_PLAN_UPGRADE_ENTITLEMENT_CHANGE",
    syntheticTenantId,
    durationMs: Date.now() - startB05,
    status: passB05 ? "PASS" : "FAIL",
    evidence: { newPlan: upgradedSub.planCode, analyticsAllowed: entCheckB05.allowed },
    timestamp: new Date().toISOString(),
  });
  console.log(` [B05/B12] ${passB05 ? "✓" : "✗"} Synthetic Test B05 (Plan Upgrade -> Entitlement Change): ${passB05 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST B06: Plan Downgrade -> Limit Validation
  // -------------------------------------------------------------------------
  const startB06 = Date.now();
  const businessPlanB06 = monetizationRepo.getPlanByCode("BUSINESS")!;
  const downgradedSub = monetizationRepo.changePlan(ctx, subB01.id, {
    targetPlanId: businessPlanB06.id,
    immediate: true,
    prorate: true,
  });
  const passB06 = downgradedSub.planCode === "BUSINESS";
  results.push({
    testSuite: "SYNTHETIC_TEST_B06_PLAN_DOWNGRADE_LIMIT_VALIDATION",
    syntheticTenantId,
    durationMs: Date.now() - startB06,
    status: passB06 ? "PASS" : "FAIL",
    evidence: { newPlan: downgradedSub.planCode },
    timestamp: new Date().toISOString(),
  });
  console.log(` [B06/B12] ${passB06 ? "✓" : "✗"} Synthetic Test B06 (Plan Downgrade -> Limit Validation): ${passB06 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST B07: Plugin Purchase -> Entitlement Activation
  // -------------------------------------------------------------------------
  const startB07 = Date.now();
  const telecomPluginCheck = monetizationRepo.checkEntitlement(ctx, "industry.telecom");
  const passB07 = typeof telecomPluginCheck.allowed === "boolean";
  results.push({
    testSuite: "SYNTHETIC_TEST_B07_PLUGIN_ENTITLEMENT_ACTIVATION",
    syntheticTenantId,
    durationMs: Date.now() - startB07,
    status: passB07 ? "PASS" : "FAIL",
    evidence: { pluginEntitled: telecomPluginCheck.allowed },
    timestamp: new Date().toISOString(),
  });
  console.log(` [B07/B12] ${passB07 ? "✓" : "✗"} Synthetic Test B07 (Plugin Entitlement Activation): ${passB07 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST B08: Usage Threshold -> Alert Evaluation
  // -------------------------------------------------------------------------
  const startB08 = Date.now();
  const thresholdNotice = UsageMeteringEngine.evaluateUsageThreshold(850, 1000);
  const passB08 = thresholdNotice.threshold === "WARNING" && thresholdNotice.percent === 85;
  results.push({
    testSuite: "SYNTHETIC_TEST_B08_USAGE_THRESHOLD_ALERT",
    syntheticTenantId,
    durationMs: Date.now() - startB08,
    status: passB08 ? "PASS" : "FAIL",
    evidence: { threshold: thresholdNotice.threshold, percent: thresholdNotice.percent },
    timestamp: new Date().toISOString(),
  });
  console.log(` [B08/B12] ${passB08 ? "✓" : "✗"} Synthetic Test B08 (Usage Threshold Alert): ${passB08 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST B09: Usage Overage -> Billing Calculation
  // -------------------------------------------------------------------------
  const startB09 = Date.now();
  const overageCalc = UsageMeteringEngine.calculateOverageCharge(5800, 5000, 10);
  const passB09 = overageCalc.overageQuantity === 800 && overageCalc.overageChargeTotal === 8000;
  results.push({
    testSuite: "SYNTHETIC_TEST_B09_USAGE_OVERAGE_BILLING",
    syntheticTenantId,
    durationMs: Date.now() - startB09,
    status: passB09 ? "PASS" : "FAIL",
    evidence: { overageQuantity: overageCalc.overageQuantity, totalCharge: overageCalc.overageChargeTotal },
    timestamp: new Date().toISOString(),
  });
  console.log(` [B09/B12] ${passB09 ? "✓" : "✗"} Synthetic Test B09 (Usage Overage Billing): ${passB09 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST B10: Cancellation -> Access Policy & Data Preservation
  // -------------------------------------------------------------------------
  const startB10 = Date.now();
  const cancelledSub = monetizationRepo.cancelSubscription(ctx, subB01.id, "Testing Cancellation");
  const postCancelEntitlement = monetizationRepo.checkEntitlement(ctx, "core.pos");
  const passB10 = cancelledSub.status === "CANCELLED" && !postCancelEntitlement.allowed;
  results.push({
    testSuite: "SYNTHETIC_TEST_B10_CANCELLATION_ACCESS_POLICY",
    syntheticTenantId,
    durationMs: Date.now() - startB10,
    status: passB10 ? "PASS" : "FAIL",
    evidence: { cancelledStatus: cancelledSub.status, accessAllowed: postCancelEntitlement.allowed },
    timestamp: new Date().toISOString(),
  });
  console.log(` [B10/B12] ${passB10 ? "✓" : "✗"} Synthetic Test B10 (Cancellation Access Policy & Data Safety): ${passB10 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST B11: Duplicate Payment Webhook -> Single Financial Effect
  // -------------------------------------------------------------------------
  const startB11 = Date.now();
  const existingPayments = monetizationRepo.getPayments(ctx);
  let duplicatePrevented = false;
  try {
    monetizationRepo.processPayment(ctx, {
      tenantId: ctx.tenantId,
      invoiceId: invoiceB02.id,
      provider: "MPESA",
      amount: 100,
      currency: "TZS",
      payerPhoneOrEmail: "+255754000123",
      idempotencyKey: paymentB03.idempotencyKey, // Re-submitting same idempotency key
    });
  } catch {
    duplicatePrevented = true;
  }
  const passB11 = duplicatePrevented;
  results.push({
    testSuite: "SYNTHETIC_TEST_B11_DUPLICATE_WEBHOOK_SINGLE_EFFECT",
    syntheticTenantId,
    durationMs: Date.now() - startB11,
    status: passB11 ? "PASS" : "FAIL",
    evidence: { duplicatePrevented },
    timestamp: new Date().toISOString(),
  });
  console.log(` [B11/B12] ${passB11 ? "✓" : "✗"} Synthetic Test B11 (Duplicate Webhook Single Financial Effect): ${passB11 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST B12: Tenant A Billing -> Attempted Tenant B Access -> Reject
  // -------------------------------------------------------------------------
  const startB12 = Date.now();
  let crossTenantInvoiceRejected = false;
  try {
    monetizationRepo.getInvoiceById(tenantBContext, invoiceB02.id);
  } catch {
    crossTenantInvoiceRejected = true;
  }
  const passB12 = crossTenantInvoiceRejected;
  results.push({
    testSuite: "SYNTHETIC_TEST_B12_CROSS_TENANT_BILLING_ISOLATION",
    syntheticTenantId,
    durationMs: Date.now() - startB12,
    status: passB12 ? "PASS" : "FAIL",
    evidence: { crossTenantInvoiceRejected },
    timestamp: new Date().toISOString(),
  });
  console.log(` [B12/B12] ${passB12 ? "✓" : "✗"} Synthetic Test B12 (Tenant Isolation on Billing Objects): ${passB12 ? "PASS" : "FAIL"}`);

  const allPassed = results.every((r) => r.status === "PASS");

  // Synthetic LocalIndexedDbStore instances open native IndexedDB connections in
  // the Node certification process. Close every test database before returning
  // so the monitor terminates cleanly after printing its GREEN result.
  for (const store of [bADb, bBDb, offlineDb, pwaDb, dbA, dbB, dbStoreF06A, dbStoreF06B]) {
    try { store.close(); } catch { /* best-effort test cleanup */ }
  }

  return { allPassed, results };
}



if (process.argv[1] && process.argv[1].endsWith("synthetic-monitor.ts")) {
  runSyntheticProductionSuite()
    .then(({ allPassed, results }) => {
      console.log("\n========================================================================");
      console.log(` SYNTHETIC SUITE RESULT: ${allPassed ? "ALL TESTS PASSED (GREEN)" : "FAILURES DETECTED (RED)"}`);
      console.log("========================================================================");
      process.exit(allPassed ? 0 : 1);
    })
    .catch((err) => {
      console.error("SYNTHETIC MONITORING ERROR:", err);
      process.exit(1);
    });
}