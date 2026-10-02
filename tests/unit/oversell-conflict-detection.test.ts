import { describe, it, expect, beforeEach } from "vitest";
import { PrismaAtomicCommercialFinanceService } from "@kwakopos2/database";
import type { TenantContext } from "@kwakopos2/contracts";
import { randomUUID } from "crypto";

describe("Pillar 5 — Conflict Detection: Oversell Unit Tests", () => {
  let tenantCtx: TenantContext;
  let mockStore: {
    products: Map<string, any>;
    variants: Map<string, any>;
    sales: Map<string, any>;
    ledgers: any[];
    conflicts: any[];
  };
  let mockDb: any;
  let financeService: PrismaAtomicCommercialFinanceService;

  beforeEach(() => {
    tenantCtx = {
      tenantId: "tenant-conflict-01",
      branchId: "branch-conflict-01",
      userId: "user-conflict-01",
      roles: ["CASHIER"],
      permissions: ["*"],
    };

    mockStore = {
      products: new Map(),
      variants: new Map(),
      sales: new Map(),
      ledgers: [],
      conflicts: [],
    };

    const createTx = () => ({
      sale: {
        findUnique: async () => null,
        count: async () => mockStore.sales.size,
        create: async ({ data }: any) => {
          mockStore.sales.set(data.id, data);
          return data;
        },
      },
      payment: {
        count: async () => 0,
        update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      },
      drawerOperation: {
        findUnique: async () => null,
        create: async ({ data }: any) => data,
      },
      product: {
        findUnique: async ({ where }: any) => mockStore.products.get(where.id) || null,
        update: async ({ where, data }: any) => {
          const p = mockStore.products.get(where.id);
          const updated = { ...p, ...data };
          mockStore.products.set(where.id, updated);
          return updated;
        },
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const [id, existing] of mockStore.products.entries()) {
            if (
              (!where?.id || id === where.id) &&
              (!where?.tenantId || existing.tenantId === where.tenantId) &&
              (!where?.branchId || existing.branchId === where.branchId)
            ) {
              mockStore.products.set(id, { ...existing, ...data });
              count += 1;
            }
          }
          return { count };
        },
      },
      productVariant: {
        findUnique: async ({ where }: any) => mockStore.variants.get(where.id) || null,
        findMany: async ({ where }: any) =>
          Array.from(mockStore.variants.values()).filter((v) => v.productId === where.productId),
        update: async ({ where, data }: any) => {
          const v = mockStore.variants.get(where.id);
          const updated = { ...v, ...data };
          mockStore.variants.set(where.id, updated);
          return updated;
        },
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const [id, existing] of mockStore.variants.entries()) {
            if (
              (!where?.id || id === where.id) &&
              (!where?.tenantId || existing.tenantId === where.tenantId) &&
              (!where?.branchId || existing.branchId === where.branchId)
            ) {
              mockStore.variants.set(id, { ...existing, ...data });
              count += 1;
            }
          }
          return { count };
        },
        findFirst: async ({ where }: any) =>
          Array.from(mockStore.variants.values()).find((v) =>
            v.id === where.id &&
            v.tenantId === where.tenantId &&
            v.branchId === where.branchId
          ) || null,
      },
      productBranchStock: {
        findFirst: async () => null,
        create: async ({ data }: any) => data,
        update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      },
      stockLedger: {
        findMany: async () => mockStore.ledgers,
        aggregate: async ({ where }: any) => ({
          _sum: {
            quantityChange: mockStore.ledgers
              .filter((row: any) =>
                (!where?.tenantId || row.tenantId === where.tenantId) &&
                (!where?.branchId || row.branchId === where.branchId) &&
                (!where?.variantId || row.variantId === where.variantId),
              )
              .reduce((sum: number, row: any) => sum + Number(row.quantityChange || 0), 0),
          },
        }),
        create: async ({ data }: any) => {
          mockStore.ledgers.push(data);
          return data;
        },
      },
      account: {
        findFirst: async () => ({ id: "acc-dummy" }),
        create: async () => ({ id: "acc-dummy" }),
      },
      journalEntry: {
        count: async () => 0,
        create: async ({ data }: any) => data,
      },
      journalLine: {
        create: async ({ data }: any) => data,
      },
      $executeRawUnsafe: async (sql: string, ...params: any[]) => {
        if (sql.includes("sync_conflict_record")) {
          mockStore.conflicts.push({ sql, params });
        }
      },
    });

    mockDb = {
      $transaction: async (work: any) => work(createTx()),
    };

    financeService = new PrismaAtomicCommercialFinanceService(mockDb);
  });

  it("detects oversell when sale quantity exceeds available variant inventory, logs conflict record, and preserves audit trail", async () => {
    const productId = randomUUID();
    const variantId = randomUUID();

    mockStore.products.set(productId, {
      id: productId,
      tenantId: tenantCtx.tenantId,
      branchId: tenantCtx.branchId,
      name: "Vintage Cognac",
      totalStock: 3,
      availableStock: 3,
      isActive: true,
    });

    mockStore.variants.set(variantId, {
      id: variantId,
      productId,
      tenantId: tenantCtx.tenantId,
      branchId: tenantCtx.branchId,
      name: "750ml Bottle",
      inventoryQuantity: 3, // Only 3 in stock
      price: 150,
      costPrice: 90,
      isActive: true,
    });

    // StockLedger is the inventory authority. Seed the opening balance in the
    // ledger rather than relying on the derived ProductVariant projection.
    mockStore.ledgers.push({
      id: randomUUID(),
      tenantId: tenantCtx.tenantId,
      branchId: tenantCtx.branchId,
      productId,
      variantId,
      quantityChange: 3,
      quantity: 3,
      quantityBefore: 0,
      quantityAfter: 3,
      movementType: "OPENING_STOCK",
      referenceType: "CERTIFICATION",
      idempotencyKey: "OPENING-" + variantId,
    });

    // Attempt to sell 5 units offline (2 units oversold)
    const saleId = randomUUID();
    const saleReq = {
      id: saleId,
      operationId: `OP-OVERSELL-${saleId}`,
      idempotencyKey: `IDEM-OVERSELL-${saleId}`,
      items: [
        {
          productId,
          variantId,
          quantity: 5,
          unitPrice: 150,
          unitCost: 90,
        },
      ],
      payments: [
        {
          amount: 750,
          paymentMethod: "CASH",
        },
      ],
    };

    const res = await financeService.createSale(tenantCtx, saleReq);
    expect(res).toBeDefined();

    // Verification Metric 1: Conflict logged in sync_conflict_record
    expect(mockStore.conflicts.length).toBe(1);
    const loggedConflict = mockStore.conflicts[0];
    expect(loggedConflict.params).toContain("SaleOversell");
    expect(loggedConflict.params).toContain(variantId);

    // Verification Metric 2: Stock ledger contains explicit OVERSELL DETECTED note with shortfall
    const saleLedgers = mockStore.ledgers.filter(
      (l) => l.variantId === variantId && Number(l.quantityChange) < 0,
    );
    expect(saleLedgers.length).toBe(1);
    expect(saleLedgers[0].notes).toContain("OVERSELL DETECTED: shortfall 2");

    // Inventory is not silently negative in variant table, clamped to 0 with ledger recording the true delta
    const variantAfter = mockStore.variants.get(variantId);
    expect(variantAfter.inventoryQuantity).toBe(0);
  });
});
