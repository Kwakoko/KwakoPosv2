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
      },
      product: {
        findUnique: async ({ where }: any) => mockStore.products.get(where.id) || null,
        update: async ({ where, data }: any) => {
          const existing = mockStore.products.get(where.id);
          const updated = { ...existing, ...data };
          mockStore.products.set(where.id, updated);
          return updated;
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
      },
      stockLedger: {
        findMany: async () => [],
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
  });

  it("auto-provisions synthetic variant when sale references ${productId}-default", async () => {
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

    // Should succeed and auto-create synthetic variant instead of throwing FINANCE_VARIANT_BOUNDARY_VIOLATION
    const result = await service.createSale(tenantCtx, saleReq);
    expect(result.sale).toBeDefined();

    // Verify synthetic variant was created in store
    const createdVariant = mockStore.variants.get(syntheticVariantId);
    expect(createdVariant).toBeDefined();
    expect(createdVariant.attributes?.isSynthetic).toBe(true);
    expect(createdVariant.name).toBe("Standard");
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
