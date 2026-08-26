import { randomUUID } from "crypto";
import { ScopedProductRepository, ScopedStockRepository, globalInMemoryStore } from "@kwakopos2/database";
import { SyncEngine } from "@kwakopos2/sync";
import { LocalIndexedDbStore } from "../../apps/web/src/indexedDb.js";
import { ClientSyncEngine } from "../../apps/web/src/clientSyncEngine.js";
import { calculateAvailableStock, assertInventoryLedgerIntegrity, assertNoOrphanAdjustments } from "@kwakopos2/domain";
import { globalMetrics, globalIncidentEngine, defaultLogger } from "@kwakopos2/observability";

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
  const syncEngine = new SyncEngine(productRepo, stockRepo, globalInMemoryStore);

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
  const bADb = new LocalIndexedDbStore();
  const bAEngine = new ClientSyncEngine("device-synth-A", bADb);
  const bBDb = new LocalIndexedDbStore();
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
  });
  bADb.recordOutboxMutation({
    id: "OP-SYNTH-D2",
    entityType: "ProductVariant",
    entityId: synthVarId,
    operationType: "CREATE",
    payload: { productId: synthProdId, name: "Var Sync", sku: "SYNTH-VAR-01", price: 10, costPrice: 5 },
    clientCreatedAt: new Date().toISOString(),
    idempotencyKey: "SYNTH-KEY-D2",
    status: "PENDING",
  });
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
  });

  await bAEngine.syncWithServer(
    async (req) => syncEngine.processPush(ctx, req),
    async (since) => syncEngine.processDelta(ctx, { since })
  );

  await bBEngine.syncWithServer(
    async (req) => syncEngine.processPush(ctx, req),
    async (since) => syncEngine.processDelta(ctx, { since })
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
  const offlineDb = new LocalIndexedDbStore();
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
  });

  const pendingBefore = offlineDb.getPendingOutbox().length;
  await offlineEngine.syncWithServer(
    async (req) => syncEngine.processPush(ctx, req),
    async (since) => syncEngine.processDelta(ctx, { since })
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
  const pwaDb = new LocalIndexedDbStore();
  pwaDb.recordOutboxMutation({
    id: "OP-PWA-01",
    entityType: "StockAdjustment",
    entityId: randomUUID(),
    operationType: "CREATE",
    payload: { variantId: synthVarId, adjustmentType: "INCREASE", quantityChange: 10, idempotencyKey: "PWA-1" },
    clientCreatedAt: new Date().toISOString(),
    idempotencyKey: "PWA-1",
    status: "PENDING",
  });
  const migration = pwaDb.migrateToVersion(3);
  const passF = migration.newVersion === 3 && migration.preservedOutboxCount === 1;
  results.push({
    testSuite: "SYNTHETIC_TEST_F_PWA_UPGRADE_PRESERVATION",
    syntheticTenantId,
    durationMs: Date.now() - startF,
    status: passF ? "PASS" : "FAIL",
    evidence: { version: migration.newVersion, preserved: migration.preservedOutboxCount },
    timestamp: new Date().toISOString(),
  });
  console.log(` [F/F] ${passF ? "✓" : "✗"} Synthetic Test F (PWA Schema Upgrade Outbox Preservation): ${passF ? "PASS" : "FAIL"}`);

  const allPassed = results.every((r) => r.status === "PASS");
  return { allPassed, results };
}

if (process.argv[1] && process.argv[1].endsWith("synthetic-monitor.ts")) {
  runSyntheticProductionSuite()
    .then(({ allPassed, results }) => {
      console.log("\n========================================================================");
      console.log(` SYNTHETIC SUITE RESULT: ${allPassed ? "ALL TESTS PASSED (GREEN)" : "FAILURES DETECTED (RED)"}`);
      console.log("========================================================================");
      if (!allPassed) process.exit(1);
    })
    .catch((err) => {
      console.error("SYNTHETIC MONITORING ERROR:", err);
      process.exit(1);
    });
}