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

describe("Pillar 5 — Conflict Detection: Offline Sale & Delta Pull Integration Drill", () => {
  let tenantCtx: TenantContext;
  let serverProductRepo: ScopedProductRepository;
  let serverStockRepo: ScopedStockRepository;
  let serverSyncEngine: SyncEngine;
  let terminalDb: LocalIndexedDbStore;
  let terminalEngine: ClientSyncEngine;

  beforeEach(() => {
    globalInMemoryStore.clear();

    tenantCtx = {
      tenantId: "tenant-delta-drill",
      branchId: "branch-delta-drill",
      userId: "cashier-01",
      roles: ["CASHIER"],
      permissions: ["*"],
    };

    serverProductRepo = new ScopedProductRepository(globalInMemoryStore);
    serverStockRepo = new ScopedStockRepository(globalInMemoryStore);
    serverSyncEngine = new SyncEngine(serverProductRepo, serverStockRepo, globalInMemoryStore);

    terminalDb = new LocalIndexedDbStore();
    terminalEngine = new ClientSyncEngine("terminal-delta-01", terminalDb);
  });

  it("preserves local offline mutation against incoming server deltas and logs conflict record", async () => {
    const productId = randomUUID();
    const variantId = randomUUID();
    const now = new Date().toISOString();

    // 1. Initial product and variant on server
    serverProductRepo.createProduct(tenantCtx, {
      id: productId,
      name: "Premium Coffee Beans",
      sku: "COFFEE-01",
      category: "Beverages",
      variants: [
        {
          id: variantId,
          name: "1kg Bag",
          sku: "COFFEE-1KG",
          price: 20.0,
          costPrice: 12.0,
          inventoryQuantity: 10,
          stock: 10,
        },
      ],
    });

    const pushApi = async (req: any) => serverSyncEngine.processPush(tenantCtx, req);
    const deltaApi = async (since?: string) => serverSyncEngine.processDelta(tenantCtx, { since });

    // Initial baseline sync
    await terminalEngine.syncWithServer(pushApi, deltaApi, tenantCtx.tenantId);
    expect(terminalDb.productVariants.get(variantId)?.price).toBe(20.0);

    // 2. Terminal goes offline and modifies the variant locally (e.g. price adjustment / emergency override)
    terminalDb.recordOutboxMutation({
      id: "OP-OFFLINE-PRICE-UPDATE",
      entityType: "ProductVariant",
      entityId: variantId,
      operationType: "UPDATE",
      payload: {
        id: variantId,
        productId,
        name: "1kg Bag",
        sku: "COFFEE-1KG",
        price: 24.0, // Local offline price update
        _baseUpdatedAt: now,
      },
      clientCreatedAt: now,
      idempotencyKey: `UPDATE-PRICE-${variantId}`,
      status: "PENDING",
      tenantId: tenantCtx.tenantId,
      branchId: tenantCtx.branchId,
    });

    // 3. Concurrently, Server updates the same variant with a different price from cloud headquarters
    serverProductRepo.updateVariant(tenantCtx, variantId, {
      price: 22.0, // Remote server price
    });

    // 4. Terminal does a delta pull directly before pushing its local outbox
    const serverDelta = serverSyncEngine.processDelta(tenantCtx, {});
    const applied = await terminalDb.applyServerDelta(serverDelta);

    // Verification Metric 1: Local pending mutation protects the record from being silently overwritten
    const localVariantAfterPull = terminalDb.productVariants.get(variantId);
    // Remote delta price 22.0 must NOT silently overwrite local pending edit
    expect(localVariantAfterPull?.price).not.toBe(22.0);

    // Verification Metric 2: Conflict flag is stored in syncMetadata
    const conflictMeta = terminalDb.syncMetadata.get(`sync_conflict_ProductVariant_${variantId}`);
    expect(conflictMeta).toBeDefined();
    const parsedConflict = JSON.parse(conflictMeta!);
    expect(parsedConflict.entityId).toBe(variantId);
    expect(parsedConflict.entityType).toBe("ProductVariant");
  });
});
