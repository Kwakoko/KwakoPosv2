import { describe, it, expect, beforeEach } from "vitest";
import {
  ScopedProductRepository,
  ScopedStockRepository,
  globalInMemoryStore,
} from "@kwakopos2/database";
import { SyncEngine } from "@kwakopos2/sync";
import { LocalIndexedDbStore } from "../../apps/web/src/indexedDb";
import { ClientSyncEngine } from "../../apps/web/src/clientSyncEngine";
import type { TenantContext, SyncPushRequest, SyncPushResponse } from "@kwakopos2/contracts";
import { randomUUID } from "crypto";

describe("Pillar 1 — Outbox Guarantees: Flaky Network Integration Drill", () => {
  let tenantCtx: TenantContext;
  let serverProductRepo: ScopedProductRepository;
  let serverStockRepo: ScopedStockRepository;
  let serverSyncEngine: SyncEngine;
  let clientDb: LocalIndexedDbStore;
  let clientEngine: ClientSyncEngine;

  beforeEach(() => {
    globalInMemoryStore.clear();

    tenantCtx = {
      tenantId: "tenant-outbox-drill",
      branchId: "branch-outbox-drill",
      userId: "user-outbox-drill",
      roles: ["CASHIER"],
      permissions: ["*"],
    };

    serverProductRepo = new ScopedProductRepository(globalInMemoryStore);
    serverStockRepo = new ScopedStockRepository(globalInMemoryStore);
    serverSyncEngine = new SyncEngine(serverProductRepo, serverStockRepo, globalInMemoryStore);

    clientDb = new LocalIndexedDbStore();
    clientEngine = new ClientSyncEngine("pos-terminal-01", clientDb);
  });

  it("ensures outbox queue length never decreases without verified server ACK during network drops", async () => {
    const saleId = randomUUID();
    const now = new Date().toISOString();

    // 1. Enqueue mutation to outbox
    clientDb.recordOutboxMutation({
      id: "OP-SALE-101",
      entityType: "Customer",
      entityId: saleId,
      operationType: "CREATE",
      payload: {
        id: saleId,
        name: "Juma Ally",
        phone: "+255711223344",
      },
      clientCreatedAt: now,
      idempotencyKey: `POS-SALE-${saleId}`,
      status: "PENDING",
      tenantId: tenantCtx.tenantId,
      branchId: tenantCtx.branchId,
    });

    const initialPendingCount = clientDb.getPendingOutbox().length;
    expect(initialPendingCount).toBe(1);

    // 2. Simulate flaky network: Push fails midway due to network disconnect
    let networkOnline = false;
    const mockPushApi = async (req: SyncPushRequest): Promise<SyncPushResponse> => {
      if (!networkOnline) {
        throw new Error("HTTP 504 Gateway Timeout: Carrier packet loss simulated");
      }
      return serverSyncEngine.processPush(tenantCtx, req);
    };

    const mockDeltaApi = async (since?: string) => {
      return serverSyncEngine.processDelta(tenantCtx, { since });
    };

    // Attempt sync while network is down
    await expect(clientEngine.syncWithServer(mockPushApi, mockDeltaApi, tenantCtx.tenantId)).rejects.toThrow();

    // Critical Metric Verification: Outbox queue length MUST NOT decrease
    const pendingAfterFailure = clientDb.getPendingOutbox();
    expect(pendingAfterFailure.length).toBe(initialPendingCount);
    expect(pendingAfterFailure[0].status).toBe("PENDING");

    // 3. Reconnect network: Network restores
    networkOnline = true;
    const syncResult = await clientEngine.syncWithServer(mockPushApi, mockDeltaApi, tenantCtx.tenantId);

    // Server acknowledged the push
    expect(syncResult.pushed).toBe(1);

    // Now outbox count safely decreases to 0
    const pendingAfterSuccess = clientDb.getPendingOutbox();
    expect(pendingAfterSuccess.length).toBe(0);

    const syncedItem = clientDb.syncOutbox.get("OP-SALE-101");
    expect(syncedItem?.status).toBe("SYNCED");
  });
});
