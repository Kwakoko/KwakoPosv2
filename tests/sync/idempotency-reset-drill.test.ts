import { describe, it, expect, beforeEach } from "vitest";
import {
  ScopedProductRepository,
  ScopedStockRepository,
  globalInMemoryStore,
} from "@kwakopos2/database";
import { SyncEngine } from "@kwakopos2/sync";
import { LocalIndexedDbStore } from "../../apps/web/src/indexedDb";
import { ClientSyncEngine } from "../../apps/web/src/clientSyncEngine";
import type { TenantContext } from "@kwakopos2/contracts";
import { randomUUID } from "crypto";

describe("Pillar 4 — Idempotency Scope: Device Reset Integration Drill", () => {
  let tenantCtx: TenantContext;
  let serverProductRepo: ScopedProductRepository;
  let serverStockRepo: ScopedStockRepository;
  let serverSyncEngine: SyncEngine;
  let clientDb: LocalIndexedDbStore;

  beforeEach(() => {
    globalInMemoryStore.clear();

    tenantCtx = {
      tenantId: "tenant-reset-drill",
      branchId: "branch-reset-drill",
      userId: "cashier-reset",
      roles: ["CASHIER"],
      permissions: ["*"],
    };

    serverProductRepo = new ScopedProductRepository(globalInMemoryStore);
    serverStockRepo = new ScopedStockRepository(globalInMemoryStore);
    serverSyncEngine = new SyncEngine(serverProductRepo, serverStockRepo, globalInMemoryStore);

    clientDb = new LocalIndexedDbStore();
  });

  it("prevents operations from getting stranded when client deviceId regenerates after browser reset", async () => {
    const saleId = randomUUID();
    const idempotencyKey = `POS-IDEM-${saleId}`;
    const now = new Date().toISOString();

    // 1. Terminal A starts with deviceId = "terminal-alpha-001"
    const clientEngine1 = new ClientSyncEngine("terminal-alpha-001", clientDb);

    clientDb.recordOutboxMutation({
      id: "OP-RESET-01",
      entityType: "Product",
      entityId: saleId,
      operationType: "CREATE",
      payload: {
        id: saleId,
        name: "Ginger Beer",
        sku: "GINGER-BEER-01",
      },
      clientCreatedAt: now,
      idempotencyKey,
      status: "PENDING",
      tenantId: tenantCtx.tenantId,
      branchId: tenantCtx.branchId,
    });

    const pushApi = async (req: any) => serverSyncEngine.processPush(tenantCtx, req);
    const deltaApi = async (since?: string) => serverSyncEngine.processDelta(tenantCtx, { since });

    // Initial push succeeds
    const res1 = await clientEngine1.syncWithServer(pushApi, deltaApi, tenantCtx.tenantId);
    expect(res1.pushed).toBe(1);
    expect(clientDb.getPendingOutbox().length).toBe(0);

    // 2. Simulate browser cache purge / localStorage wipe where device ID is regenerated
    // An outbox recovery or retry replay is initiated with deviceId = "terminal-beta-regenerated"
    const clientEngine2 = new ClientSyncEngine("terminal-beta-regenerated", clientDb);

    // Mark item back as PENDING to simulate a replay/re-sync after offline restore
    const outboxItem = clientDb.syncOutbox.get("OP-RESET-01");
    if (outboxItem) {
      outboxItem.status = "PENDING";
    }

    // Replay push with the new device ID
    const res2 = await clientEngine2.syncWithServer(pushApi, deltaApi, tenantCtx.tenantId);

    // Verification Metric: No permanent FAILED operations in outbox after device reset
    expect(clientDb.getPendingOutbox().length).toBe(0);
    expect(clientDb.syncOutbox.get("OP-RESET-01")?.status).toBe("SYNCED");

    // Check server hasn't duplicated the record
    const products = serverProductRepo.getProducts(tenantCtx);
    expect(products.length).toBe(1);
    expect(products[0].id).toBe(saleId);
  });
});
