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

describe("Pillar 3 — Atomic Conversion Rules: Multi-Terminal Integration Drill", () => {
  let tenantCtx: TenantContext;
  let serverProductRepo: ScopedProductRepository;
  let serverStockRepo: ScopedStockRepository;
  let serverSyncEngine: SyncEngine;

  let terminal1Db: LocalIndexedDbStore;
  let terminal1Engine: ClientSyncEngine;

  let terminal2Db: LocalIndexedDbStore;
  let terminal2Engine: ClientSyncEngine;

  beforeEach(() => {
    globalInMemoryStore.clear();

    tenantCtx = {
      tenantId: "tenant-conv-drill",
      branchId: "branch-conv-drill",
      userId: "user-admin",
      roles: ["ADMIN"],
      permissions: ["*"],
    };

    serverProductRepo = new ScopedProductRepository(globalInMemoryStore);
    serverStockRepo = new ScopedStockRepository(globalInMemoryStore);
    serverSyncEngine = new SyncEngine(serverProductRepo, serverStockRepo, globalInMemoryStore);

    terminal1Db = new LocalIndexedDbStore();
    terminal1Engine = new ClientSyncEngine("terminal-01", terminal1Db);

    terminal2Db = new LocalIndexedDbStore();
    terminal2Engine = new ClientSyncEngine("terminal-02", terminal2Db);
  });

  it("reconciles Terminal 1 Box sale and Terminal 2 Box->Pieces conversion and sale", async () => {
    const productId = randomUUID();
    const boxVariantId = randomUUID();    // 1 Box
    const piecesVariantId = randomUUID(); // Individual piece (10 per Box)
    const now = new Date().toISOString();

    // Setup initial catalog: 2 Boxes and 0 Pieces in stock
    serverProductRepo.createProduct(tenantCtx, {
      id: productId,
      name: "Milk Carton",
      sku: "MILK-PARENT",
      category: "Dairy",
      variants: [
        {
          id: boxVariantId,
          name: "Full Box (10x)",
          sku: "MILK-BOX",
          price: 25.0,
          costPrice: 18.0,
          inventoryQuantity: 2,
          stock: 2,
        },
        {
          id: piecesVariantId,
          name: "Individual Bottle",
          sku: "MILK-PIECE",
          price: 3.0,
          costPrice: 1.8,
          inventoryQuantity: 0,
          stock: 0,
        },
      ],
    });

    // Seed stock: 2 Boxes = +2
    serverStockRepo.recordMovement(tenantCtx, {
      id: randomUUID(),
      variantId: boxVariantId,
      movementType: "ADJUSTMENT",
      quantityChange: 2,
      notes: "Initial Box Stock",
      deviceId: "seed-device",
      operationId: "SEED-01",
      idempotencyKey: "SEED-BOXES-02",
    });

    // Both terminals delta-sync baseline state
    const pushApi = async (req: any) => serverSyncEngine.processPush(tenantCtx, req);
    const deltaApi = async (since?: string) => serverSyncEngine.processDelta(tenantCtx, { since });

    await terminal1Engine.syncWithServer(pushApi, deltaApi, tenantCtx.tenantId);
    await terminal2Engine.syncWithServer(pushApi, deltaApi, tenantCtx.tenantId);

    // Terminal 1 goes offline: sells 1 Box
    const sale1Id = randomUUID();
    terminal1Db.recordOutboxMutation({
      id: "OP-T1-SALE",
      entityType: "Sale" as any,
      entityId: sale1Id,
      operationType: "CREATE",
      payload: {
        id: sale1Id,
        items: [{ productId, variantId: boxVariantId, quantity: 1, unitPrice: 25.0 }],
        subtotal: 25.0,
        grandTotal: 25.0,
      },
      clientCreatedAt: now,
      idempotencyKey: `T1-SALE-${sale1Id}`,
      status: "PENDING",
      tenantId: tenantCtx.tenantId,
      branchId: tenantCtx.branchId,
    });

    // Terminal 2 goes offline: converts 1 Box into 10 Pieces, then sells 10 Pieces
    const convId = randomUUID();
    terminal2Db.recordOutboxMutation({
      id: "OP-T2-CONV",
      entityType: "UnitConversionTransaction" as any,
      entityId: convId,
      operationType: "CREATE",
      payload: {
        parentVariantId: boxVariantId,
        childVariantId: piecesVariantId,
        parentUnitsDeducted: 1,
        childUnitsProduced: 10,
        conversionFactor: 10,
      },
      clientCreatedAt: now,
      idempotencyKey: `T2-CONV-${convId}`,
      status: "PENDING",
      tenantId: tenantCtx.tenantId,
      branchId: tenantCtx.branchId,
    });

    const sale2Id = randomUUID();
    terminal2Db.recordOutboxMutation({
      id: "OP-T2-SALE",
      entityType: "Sale" as any,
      entityId: sale2Id,
      operationType: "CREATE",
      payload: {
        id: sale2Id,
        items: [{ productId, variantId: piecesVariantId, quantity: 10, unitPrice: 3.0 }],
        subtotal: 30.0,
        grandTotal: 30.0,
      },
      clientCreatedAt: now,
      idempotencyKey: `T2-SALE-${sale2Id}`,
      status: "PENDING",
      tenantId: tenantCtx.tenantId,
      branchId: tenantCtx.branchId,
    });

    // Now both terminals synchronize with the server
    const resT1 = await terminal1Engine.syncWithServer(pushApi, deltaApi, tenantCtx.tenantId);
    const resT2 = await terminal2Engine.syncWithServer(pushApi, deltaApi, tenantCtx.tenantId);

    expect(resT1.pushed).toBe(1);
    expect(resT2.pushed).toBe(2);

    // Validate that the inventory ledger reconciled cleanly:
    // Initial Boxes: 2
    // Terminal 1 sold 1 Box -> -1 Box
    // Terminal 2 converted 1 Box -> -1 Box, +10 Pieces
    // Terminal 2 sold 10 Pieces -> -10 Pieces
    // Net expected stock: Boxes = 0, Pieces = 0 (Total = 0)
    const boxLedgers = await serverStockRepo.getLedger(tenantCtx, boxVariantId);
    const netBoxStock = boxLedgers.reduce((acc, l) => acc + Number(l.quantityChange || 0), 0);

    const pieceLedgers = await serverStockRepo.getLedger(tenantCtx, piecesVariantId);
    const netPieceStock = pieceLedgers.reduce((acc, l) => acc + Number(l.quantityChange || 0), 0);

    expect(netBoxStock).toBe(0);
    expect(netPieceStock).toBe(0);
  });
});
