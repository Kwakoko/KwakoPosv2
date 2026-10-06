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
      cashSession: { findUnique: async () => ({ id: "cash-session-oversell", tenantId: tenantCtx.tenantId, branchId: tenantCtx.branchId, cashierId: tenantCtx.userId, status: "OPEN" }) },
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
      setting: {
        // These unit fixtures use a minimal Prisma transaction mock. An empty
        // branch tax-config result preserves the production default of no VAT.
        findMany: async () => [],
      },
      account: {
        findFirst: async () => ({ id: "acc-dummy" }),
        create: async () => ({ id: "acc-dummy" }),
      },
      journalEntry: {
        findUnique: async () => null,
        count: async () => 0,
        create: async ({ data }: any) => data,
      },
      journalLine: {
        findMany: async () => [],
        create: async ({ data }: any) => data,
      },
      auditEvent: {
        create: async () => ({ id: randomUUID() }),
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

  it("rejects oversell atomically before creating sale or stock movements", async () => {
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
      inventoryQuantity: 3,
      price: 150,
      costPrice: 90,
      isActive: true,
    });

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

    const saleId = randomUUID();
    const saleReq = {
      id: saleId,
      operationId: `OP-OVERSELL-${saleId}`,
      idempotencyKey: `IDEM-OVERSELL-${saleId}`,
      cashSessionId: "cash-session-oversell",
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
          paymentMethod: "BANK",
        },
      ],
    };

    await expect(financeService.createSale(tenantCtx, saleReq)).rejects.toThrow(
      "INSUFFICIENT_STOCK",
    );

    expect(mockStore.sales.size).toBe(0);
    expect(mockStore.conflicts.length).toBe(0);
    expect(mockStore.ledgers).toHaveLength(1);
    expect(mockStore.ledgers[0].quantityAfter).toBe(3);
    expect(mockStore.variants.get(variantId).inventoryQuantity).toBe(3);

    const validSaleReq = {
      ...saleReq,
      id: randomUUID(),
      operationId: `OP-VALID-${saleId}`,
      idempotencyKey: `IDEM-VALID-${saleId}`,
      items: [{ ...saleReq.items[0], quantity: 2 }],
      payments: [{ amount: 300, paymentMethod: "BANK" }],
    };
    const validSale = await financeService.createSale(tenantCtx, validSaleReq);
    expect(validSale.ledgers[0].quantityBefore).toBe(3);
    expect(validSale.ledgers[0].quantityChange).toBe(-2);
    expect(validSale.ledgers[0].quantityAfter).toBe(1);
  });
});
