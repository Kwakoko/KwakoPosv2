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

describe("Pillar 2 — Server-Side Variant Synthesis: Integration Drill", () => {
  let tenantCtx: TenantContext;
  let serverProductRepo: ScopedProductRepository;
  let serverStockRepo: ScopedStockRepository;
  let serverSyncEngine: SyncEngine;
  let clientDb: LocalIndexedDbStore;
  let clientEngine: ClientSyncEngine;
  let secondClientDb: LocalIndexedDbStore;
  let secondClientEngine: ClientSyncEngine;

  beforeEach(async () => {
    globalInMemoryStore.clear();

    tenantCtx = {
      tenantId: "tenant-syn-integration",
      branchId: "branch-syn-integration",
      userId: "cashier-001",
      roles: ["CASHIER"],
      permissions: ["*"],
    };

    serverProductRepo = new ScopedProductRepository(globalInMemoryStore);
    serverStockRepo = new ScopedStockRepository(globalInMemoryStore);
    serverSyncEngine = new SyncEngine(serverProductRepo, serverStockRepo, globalInMemoryStore);

    clientDb = new LocalIndexedDbStore();
    clientEngine = new ClientSyncEngine("pos-terminal-A", clientDb);

    secondClientDb = new LocalIndexedDbStore();
    secondClientEngine = new ClientSyncEngine("pos-terminal-B", secondClientDb);
    await Promise.all([clientDb.ready, secondClientDb.ready]);
  });

  it("handles offline product sale when the client persists the deterministic default variant before sync", async () => {
    const productId = randomUUID();
    const syntheticVariantId = `${productId}-default`;
    const saleId = randomUUID();
    const now = new Date().toISOString();

    // 1. Client creates product offline (no variants registered yet)
    clientDb.recordOutboxMutation({
      id: "OP-PROD-01",
      entityType: "Product",
      entityId: productId,
      operationType: "CREATE",
      payload: {
        id: productId,
        name: "Artisan Bread",
        sku: "BREAD-ARTISAN",
        price: 3.5,
        costPrice: 2.0,
      },
      clientCreatedAt: now,
      idempotencyKey: `PROD-${productId}`,
      status: "PENDING",
      tenantId: tenantCtx.tenantId,
      branchId: tenantCtx.branchId,
    });

    // 2. Client persists the default variant explicitly while offline.
    // Production sync rejects unknown synthetic variant IDs; the client must carry
    // the canonical variant mutation with the sale.
    clientDb.recordOutboxMutation({
      id: "OP-VAR-SYN-01",
      entityType: "ProductVariant",
      entityId: syntheticVariantId,
      operationType: "CREATE",
      payload: {
        id: syntheticVariantId,
        productId,
        name: "Artisan Bread",
        sku: "BREAD-ARTISAN-DEFAULT",
        price: 3.5,
        costPrice: 2.0,
        inventoryQuantity: 0,
        attributes: { __systemDefaultVariant: true },
      },
      clientCreatedAt: now,
      idempotencyKey: "VAR-" + productId,
      status: "PENDING",
      tenantId: tenantCtx.tenantId,
      branchId: tenantCtx.branchId,
    });

    // 2. Client makes offline sale using synthetic fallback variant
    clientDb.recordOutboxMutation({
      id: "OP-SALE-SYN-01",
      entityType: "Sale" as any,
      entityId: saleId,
      operationType: "CREATE",
      payload: {
        id: saleId,
        items: [
          {
            productId,
            variantId: syntheticVariantId,
            quantity: 2,
            unitPrice: 3.5,
            unitCost: 2.0,
          },
        ],
        subtotal: 7.0,
        grandTotal: 7.0,
      },
      clientCreatedAt: now,
      idempotencyKey: `SALE-${saleId}`,
      status: "PENDING",
      tenantId: tenantCtx.tenantId,
      branchId: tenantCtx.branchId,
    });

    const pushApi = async (req: any) => serverSyncEngine.processPush(tenantCtx, req);
    const deltaApi = async (since?: string) => serverSyncEngine.processDelta(tenantCtx, { since });

    // 3. Client pushes product + explicit variant + sale to server
    const syncRes = await clientEngine.syncWithServer(pushApi, deltaApi, tenantCtx.tenantId);

    // Metric Verification: Zero rejected sales due to missing variants
    expect(syncRes.pushed).toBe(3);
    expect(clientDb.getPendingOutbox().length).toBe(0);

    // Verify synthetic variant exists in server repository or store
    const product = serverProductRepo.getProductById(tenantCtx, productId);
    const serverVariants = product?.variants || Array.from(globalInMemoryStore.variants.values()).filter((v) => v.productId === productId);
    expect(serverVariants.length).toBeGreaterThanOrEqual(1);
    expect(serverVariants.some((v) => v.id === `${productId}-default`)).toBe(true);
    const synth = serverVariants.find((v) => v.id === syntheticVariantId || v.id.endsWith("-default"));
    expect(synth).toBeDefined();

    // 4. Second client delta pulls from server and receives the synthetic variant
    const secondSyncRes = await secondClientEngine.syncWithServer(
      pushApi,
      deltaApi,
      tenantCtx.tenantId
    );

    expect(secondSyncRes.pulled).toBeGreaterThanOrEqual(1);
    const pulledVariant = secondClientDb.productVariants.get(syntheticVariantId);
    expect(pulledVariant).toBeDefined();
    expect(pulledVariant?.productId).toBe(productId);
  });
});
