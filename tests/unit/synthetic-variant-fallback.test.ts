import { describe, it, expect, beforeEach } from "vitest";
import { PrismaAtomicCommercialFinanceService } from "@kwakopos2/database";
import { randomUUID } from "crypto";
import type { TenantContext } from "@kwakopos2/contracts";

describe("Synthetic Fallback Variant Auto-Provisioning", () => {
  let tenantCtx: TenantContext;
  let mockDb: any;
  let mockStore: {
    products: Map<string, any>;
    variants: Map<string, any>;
    sales: Map<string, any>;
    ledgers: Map<string, any>;
    conflicts: any[];
  };

  beforeEach(() => {
    tenantCtx = {
      tenantId: "tenant-syn-001",
      branchId: "branch-syn-001",
      userId: "user-syn-001",
      roles: ["CASHIER"],
      permissions: ["SALE_CREATE"],
    };

    mockStore = {
      products: new Map(),
      variants: new Map(),
      sales: new Map(),
      ledgers: new Map(),
      conflicts: [],
    };

    const createTx = () => ({
      sale: {
        findUnique: async ({ where }: any) => mockStore.sales.get(where.idempotencyKey) || null,
        count: async () => mockStore.sales.size,
        create: async ({ data }: any) => {
          mockStore.sales.set(data.idempotencyKey, data);
          return data;
        },
      },
      payment: {
        count: async () => 0,
        update: async ({ where, data }: any) => {
          for (const sale of mockStore.sales.values()) {
            if (Array.isArray(sale.payments)) {
              sale.payments = sale.payments.map((payment: any) =>
                payment.id === where.id ? { ...payment, ...data } : payment,
              );
            }
          }
          return { id: where.id, ...data };
        },
      },
      drawerOperation: {
        findUnique: async () => null,
        create: async ({ data }: any) => data,
      },
      cashSession: { findUnique: async () => ({ id: "cash-session-syn", tenantId: tenantCtx.tenantId, branchId: tenantCtx.branchId, cashierId: tenantCtx.userId, status: "OPEN" }) },
      product: {
        findUnique: async ({ where }: any) => mockStore.products.get(where.id) || null,
        update: async ({ where, data }: any) => {
          const existing = mockStore.products.get(where.id);
          const updated = { ...existing, ...data };
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
        create: async ({ data }: any) => {
          mockStore.variants.set(data.id, data);
          return data;
        },
        update: async ({ where, data }: any) => {
          const existing = mockStore.variants.get(where.id);
          const updated = { ...existing, ...data };
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
        findMany: async () => Array.from(mockStore.ledgers.values()),
        aggregate: async ({ where }: any) => ({
          _sum: {
            quantityChange: Array.from(mockStore.ledgers.values())
              .filter((row: any) =>
                (!where?.tenantId || row.tenantId === where.tenantId) &&
                (!where?.branchId || row.branchId === where.branchId) &&
                (!where?.variantId || row.variantId === where.variantId),
              )
              .reduce((sum: number, row: any) => sum + Number(row.quantityChange || 0), 0),
          },
        }),
        create: async ({ data }: any) => {
          mockStore.ledgers.set(data.idempotencyKey, data);
          return data;
        },
      },
      account: {
        findFirst: async () => ({ id: "acc-dummy-1" }),
        create: async () => ({ id: "acc-dummy-1" }),
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
      auditEvent: { create: async () => ({ id: randomUUID() }) },
      $executeRawUnsafe: async (sql: string, ...params: any[]) => {
        if (sql.includes("sync_conflict_record")) {
          mockStore.conflicts.push({ sql, params });
        }
      },
    });

    mockDb = {
      $transaction: async (work: any) => work(createTx()),
    };
  });

  it("fails closed when sale references an unregistered synthetic fallback variant", async () => {
    const service = new PrismaAtomicCommercialFinanceService(mockDb);
    const productId = randomUUID();
    const syntheticVariantId = `${productId}-default`;

    // Parent product exists, but no variants were defined yet
    mockStore.products.set(productId, {
      id: productId,
      tenantId: tenantCtx.tenantId,
      branchId: tenantCtx.branchId,
      name: "Generic Mineral Water",
      sku: "WATER-GEN",
      price: 1000,
      costPrice: 600,
    });

    const saleReq = {
      id: randomUUID(),
      idempotencyKey: `SALE-${randomUUID()}`,
      cashSessionId: "cash-session-syn",
      items: [
        {
          productId,
          variantId: syntheticVariantId,
          quantity: 3,
          unitPrice: 1000,
          unitCost: 600,
        },
      ],
      payments: [
        {
          amount: 3000,
          paymentMethod: "CASH",
        },
      ],
    };

    await expect(service.createSale(tenantCtx, saleReq)).rejects.toThrow("FINANCE_VARIANT_BOUNDARY_VIOLATION");
    expect(mockStore.variants.has(syntheticVariantId)).toBe(false);

  });

  it("detects oversell and logs conflict in sync_conflict_record", async () => {
    const service = new PrismaAtomicCommercialFinanceService(mockDb);
    const productId = randomUUID();
    const variantId = randomUUID();

    mockStore.products.set(productId, {
      id: productId,
      tenantId: tenantCtx.tenantId,
      branchId: tenantCtx.branchId,
      name: "Soda Can",
      sku: "SODA-BASE",
    });

    // Variant has only 2 units in stock
    mockStore.variants.set(variantId, {
      id: variantId,
      productId,
      tenantId: tenantCtx.tenantId,
      branchId: tenantCtx.branchId,
      inventoryQuantity: 2,
      price: 1500,
      costPrice: 900,
      isActive: true,
    });

    // Sale attempts to sell 5 units (oversell of 3 units)
    const saleReq = {
      id: randomUUID(),
      idempotencyKey: `SALE-OVERSELL-${randomUUID()}`,
      cashSessionId: "cash-session-syn",
      items: [
        {
          productId,
          variantId,
          quantity: 5,
          unitPrice: 1500,
          unitCost: 900,
        },
      ],
      payments: [
        {
          amount: 7500,
          paymentMethod: "CASH",
        },
      ],
    };

    const result = await service.createSale(tenantCtx, saleReq);
    expect(result.sale).toBeDefined();

    // Oversell conflict recorded
    expect(mockStore.conflicts.length).toBeGreaterThan(0);
    const conflictRecord = mockStore.conflicts[0];
    expect(conflictRecord.params).toContain("SaleOversell");
  });
});
