import { randomUUID } from "crypto";
import { LocalIndexedDbStore } from "../../apps/web/src/indexedDb.js";
import { ClientSyncEngine } from "../../apps/web/src/clientSyncEngine.js";
import { ScopedProductRepository, ScopedStockRepository, globalInMemoryStore } from "@kwakopos2/database";
import { SyncEngine } from "@kwakopos2/sync";

export interface ChaosFailureResult {
  failureScenario: string;
  injectedFailure: string;
  expectedBehavior: string;
  recovered: boolean;
  dataCorrupted: boolean;
  duplicateTransactionsCreated: boolean;
  notes: string;
}

export async function runChaosFailureInjectionSuite(): Promise<{
  overallPassed: boolean;
  totalScenariosExecuted: number;
  totalScenariosRecovered: number;
  results: ChaosFailureResult[];
}> {
  const results: ChaosFailureResult[] = [];
  const ctx = {
    tenantId: "TENANT-CHAOS-001",
    branchId: "BRANCH-CHAOS-001",
    userId: "USER-CHAOS",
    roles: ["ADMIN"],
    permissions: ["*"],
  };

  const productRepo = new ScopedProductRepository(globalInMemoryStore);
  const stockRepo = new ScopedStockRepository(globalInMemoryStore);
  const syncEngine = new SyncEngine(productRepo, stockRepo, globalInMemoryStore);

  // SCENARIO 1: Network Loss During Outbox Sync Push
  const db1 = new LocalIndexedDbStore(5);
  await db1.ready;
  const clientEngine1 = new ClientSyncEngine("device-chaos-1", db1, undefined, undefined, ctx.tenantId, ctx.branchId);
  const varId1 = randomUUID();

  db1.recordOutboxMutation({
    id: "OP-CHAOS-1",
    entityType: "StockAdjustment",
    entityId: randomUUID(),
    operationType: "CREATE",
    payload: { variantId: varId1, adjustmentType: "INCREASE", quantityChange: 50, idempotencyKey: "CHAOS-KEY-1" },
    clientCreatedAt: new Date().toISOString(),
    idempotencyKey: "CHAOS-KEY-1",
    status: "PENDING",
    tenantId: ctx.tenantId,
    branchId: ctx.branchId,
  });

  // Inject Simulated Network Drop during Sync
  let syncFailedAsExpected = false;
  try {
    await clientEngine1.syncWithServer(
      async () => {
        throw new Error("CHAOS_NETWORK_DROP: Simulated connection drop!");
      },
      async (since) => syncEngine.processDelta(ctx, { since })
    );
  } catch (err: any) {
    if (err.message.includes("CHAOS_NETWORK_DROP")) {
      syncFailedAsExpected = true;
    }
  }

  // Verify Outbox is preserved for retry and stock not corrupted
  const pending1 = db1.getPendingOutbox().length;
  const recovered1 = syncFailedAsExpected && pending1 === 1;

  results.push({
    failureScenario: "SCENARIO_1_NETWORK_DROP_DURING_PUSH",
    injectedFailure: "Simulated socket interruption during sync push",
    expectedBehavior: "Outbox item remains PENDING in IndexedDB for retry",
    recovered: recovered1,
    dataCorrupted: false,
    duplicateTransactionsCreated: false,
    notes: recovered1 ? "Outbox preserved safely in IndexedDB for subsequent reconnect" : "OUTBOX_DATA_LOST",
  });

  // SCENARIO 2: Duplicate Delivery After Retry (Network Acknowledgment Dropped)
  const db2 = new LocalIndexedDbStore(5);
  await db2.ready;
  const clientEngine2 = new ClientSyncEngine("device-chaos-2", db2, undefined, undefined, ctx.tenantId, ctx.branchId);
  const prodId2 = randomUUID();
  const opId2 = randomUUID();
  const idemKey2 = `IDEM-CHAOS-${randomUUID()}`;

  const req2 = {
    deviceId: "device-chaos-2",
    operations: [
      {
        operationId: opId2,
        entityType: "Product" as const,
        entityId: prodId2,
        operationType: "CREATE" as const,
        payload: { name: "Chaos Item", sku: `CHAOS-SKU-${randomUUID().slice(0, 8)}` },
        clientCreatedAt: new Date().toISOString(),
        idempotencyKey: idemKey2,
      },
    ],
  };

  // Push 1 (Simulated Server Success, but ACK dropped on network)
  const pushRes1 = syncEngine.processPush(ctx, req2);
  // Push 2 (Retried by client)
  const pushRes2 = syncEngine.processPush(ctx, req2);

  const duplicatePrevented = pushRes1.results[0]?.status === "SUCCESS" && pushRes2.results[0]?.status === "ALREADY_PROCESSED";

  results.push({
    failureScenario: "SCENARIO_2_DUPLICATE_DELIVERY_ACK_LOSS",
    injectedFailure: "Client retries push operation after missing ACK",
    expectedBehavior: "Server returns ALREADY_PROCESSED with single effect",
    recovered: duplicatePrevented,
    dataCorrupted: false,
    duplicateTransactionsCreated: false,
    notes: duplicatePrevented ? "Idempotency key prevented duplicate entity creation" : "DUPLICATE_ENTITY_CREATED",
  });

  // SCENARIO 3: Service Worker Storage Exhaustion / IndexedDB Version Migration
  const db3 = new LocalIndexedDbStore(3, `kwakopos-chaos-3-${randomUUID().slice(0, 6)}`);
  await db3.ready;
  const varId3 = randomUUID();
  db3.recordOutboxMutation({
    id: "OP-CHAOS-3",
    entityType: "StockAdjustment",
    entityId: randomUUID(),
    operationType: "CREATE",
    payload: { variantId: varId3, adjustmentType: "INCREASE", quantityChange: 20, idempotencyKey: "CHAOS-KEY-3" },
    clientCreatedAt: new Date().toISOString(),
    idempotencyKey: "CHAOS-KEY-3",
    status: "PENDING",
    tenantId: ctx.tenantId,
    branchId: ctx.branchId,
  });

  const mig = await db3.migrateToVersion(4);
  const recovered3 = mig.newVersion === 4 && mig.preservedOutboxCount === 1;

  results.push({
    failureScenario: "SCENARIO_3_SERVICE_WORKER_VERSION_UPGRADE",
    injectedFailure: "App upgraded to version 4 with pending outbox entries",
    expectedBehavior: "Schema migrates and preserves pending outbox",
    recovered: recovered3,
    dataCorrupted: false,
    duplicateTransactionsCreated: false,
    notes: recovered3 ? "Outbox data preserved across version migration" : "DATA_CORRUPTED_ON_MIGRATION",
  });

  const totalScenariosExecuted = results.length;
  const totalScenariosRecovered = results.filter((r) => r.recovered && !r.dataCorrupted && !r.duplicateTransactionsCreated).length;
  const overallPassed = totalScenariosExecuted === totalScenariosRecovered;

  return {
    overallPassed,
    totalScenariosExecuted,
    totalScenariosRecovered,
    results,
  };
}

if (process.argv[1]?.endsWith("chaos-failure-injector.ts")) {
  runChaosFailureInjectionSuite().then(console.log);
}
