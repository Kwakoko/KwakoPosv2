import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  productionCleanupService,
  ReadinessChecklist,
  IntegrityCheckResult,
} from "../../apps/web/src/services/productionCleanupService.js";
import { tenantStoreCleanupService } from "../../apps/web/src/services/tenantStoreCleanupService.js";
import {
  generateCorrelationId,
  isChunkLoadError,
} from "../../apps/web/src/components/UI/ProductionErrorBoundary.js";

vi.mock("@kwakopos2/database", () => {
  const model = () => ({
    count: vi.fn(async () => 0),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  });
  const tx = new Proxy({}, { get: () => model() });
  return {
    prisma: new Proxy({}, {
      get: (_target: any, property: string) => property === "$transaction"
        ? vi.fn(async (fn: any) => fn(tx))
        : model(),
    }),
  };
});

// Mock minimal in-memory LocalIndexedDbStore
class MockIndexedDbStore {
  products = new Map<string, any>();
  productVariants = new Map<string, any>();
  stockLedger = new Map<string, any>();
  stockAdjustments = new Map<string, any>();
  stockBalance = new Map<string, any>();
  productPriceHistory = new Map<string, any>();
  sales = new Map<string, any>();
  payments = new Map<string, any>();
  receipts = new Map<string, any>();
  customers = new Map<string, any>();
  suppliers = new Map<string, any>();
  syncOutbox = new Map<string, any>();

  async flushPersistence() {
    return Promise.resolve();
  }
}

describe("System UI & Production Cleanliness Suite", () => {
  beforeEach(() => {
    // Reset localStorage mock
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => store[key] || null),
      setItem: vi.fn((key: string, val: string) => {
        store[key] = val;
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        for (const k in store) delete store[k];
      }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── 1. Production Cleanup Engine Tests ────────────────────────────────────

  describe("productionCleanupService", () => {
    it("manages production lock flags correctly", () => {
      expect(productionCleanupService.isProductionLocked()).toBe(false);

      productionCleanupService.lockProduction();
      expect(productionCleanupService.isProductionLocked()).toBe(true);

      productionCleanupService.unlockProduction();
      expect(productionCleanupService.isProductionLocked()).toBe(false);
    });

    it("executes total production clean and purges demo records while preserving platform configuration", async () => {
      const mockDb = new MockIndexedDbStore() as any;

      // Seed demo data
      mockDb.products.set("prod-demo-1", { id: "prod-demo-1", name: "Sample Coffee", tenantId: "tenant-demo" });
      mockDb.products.set("prod-demo-2", { id: "prod-demo-2", name: "Sample Tea", tenantId: "tenant-demo" });
      mockDb.sales.set("sale-demo-1", { id: "sale-demo-1", totalAmount: 5000, tenantId: "tenant-demo" });
      mockDb.stockLedger.set("ledger-1", { id: "ledger-1", quantityDelta: 10, tenantId: "tenant-demo" });
      mockDb.customers.set("cust-1", { id: "cust-1", name: "Walk-in Demo", tenantId: "tenant-demo" });
      mockDb.syncOutbox.set("outbox-1", { id: "outbox-1", entityType: "Sale", status: "PENDING" });

      expect(mockDb.products.size).toBe(2);
      expect(mockDb.sales.size).toBe(1);

      const report = await productionCleanupService.executeProductionCleanup(mockDb);

      expect(report.success).toBe(true);
      expect(mockDb.products.size).toBe(0);
      expect(mockDb.sales.size).toBe(0);
      expect(mockDb.stockLedger.size).toBe(0);
      expect(mockDb.customers.size).toBe(0);
      expect(mockDb.syncOutbox.size).toBe(0);

      // Verify Purged counts
      expect(report.purgedCounts.products).toBe(2);
      expect(report.purgedCounts.sales).toBe(1);

      // Verify Production lock was automatically applied
      expect(productionCleanupService.isProductionLocked()).toBe(true);

      // Verify Readiness Checklist
      expect(report.readinessChecklist.zeroDemoProducts).toBe(true);
      expect(report.readinessChecklist.zeroDemoSales).toBe(true);
      expect(report.readinessChecklist.zeroDemoInventory).toBe(true);
      expect(report.readinessChecklist.superAdminExists).toBe(true);
      expect(report.readinessChecklist.corePlansIntact).toBe(true);

      // Verify Database Integrity Check
      expect(report.integrityCheck.passed).toBe(true);
      expect(report.integrityCheck.foreignKeyOrphans).toBe(0);
      expect(report.integrityCheck.inventoryConsistency).toBe(true);
      expect(report.integrityCheck.financialConsistency).toBe(true);

      // Verify Preserved platform items
      expect(report.preservedItems.length).toBeGreaterThanOrEqual(4);
      expect(report.preservedItems.some((item) => item.includes("Super Admin Account"))).toBe(true);
      expect(report.preservedItems.some((item) => item.includes("Core SaaS Subscription Plans"))).toBe(true);
    });
  });

  // ─── 2. Tenant Store Cleanup Service Tests ──────────────────────────────────

  describe("tenantStoreCleanupService", () => {
    it("rejects cleanup attempts with empty or invalid tenantId", async () => {
      await expect(tenantStoreCleanupService.purgeProductsAndLedgers("")).rejects.toThrow(
        "Invalid tenant identifier",
      );
      await expect(tenantStoreCleanupService.purgeSalesAndReceipts("   ")).rejects.toThrow(
        "Invalid tenant identifier",
      );
      await expect(tenantStoreCleanupService.purgeContactsAndExpenses(null as any)).rejects.toThrow(
        "Invalid tenant identifier",
      );
    });

    it("purges products, variants, and stock ledgers exclusively for target tenant (tenant isolation)", async () => {
      const mockDb = new MockIndexedDbStore() as any;

      // Seed tenant A records
      mockDb.products.set("prod-a1", { id: "prod-a1", name: "Product A", tenantId: "tenant-A" });
      mockDb.productVariants.set("var-a1", { id: "var-a1", name: "Variant A", tenantId: "tenant-A" });
      mockDb.stockLedger.set("led-a1", { id: "led-a1", tenantId: "tenant-A" });

      // Seed tenant B records (should NOT be touched)
      mockDb.products.set("prod-b1", { id: "prod-b1", name: "Product B", tenantId: "tenant-B" });
      mockDb.productVariants.set("var-b1", { id: "var-b1", name: "Variant B", tenantId: "tenant-B" });
      mockDb.stockLedger.set("led-b1", { id: "led-b1", tenantId: "tenant-B" });

      const result = await tenantStoreCleanupService.purgeProductsAndLedgers("tenant-A", mockDb);

      expect(result.success).toBe(true);
      expect(result.tenantId).toBe("tenant-A");
      expect(result.purgedCounts.products).toBe(1);
      expect(result.purgedCounts.productVariants).toBe(1);
      expect(result.purgedCounts.stockLedger).toBe(1);

      // Verify Tenant A records were deleted
      expect(mockDb.products.has("prod-a1")).toBe(false);
      expect(mockDb.productVariants.has("var-a1")).toBe(false);
      expect(mockDb.stockLedger.has("led-a1")).toBe(false);

      // Verify Tenant B records were perfectly preserved
      expect(mockDb.products.has("prod-b1")).toBe(true);
      expect(mockDb.productVariants.has("var-b1")).toBe(true);
      expect(mockDb.stockLedger.has("led-b1")).toBe(true);
    });

    it("purges sales and receipts and sanitizes outbox queue exclusively for target tenant", async () => {
      const mockDb = new MockIndexedDbStore() as any;

      // Seed sales and outbox for tenant A and tenant B
      mockDb.sales.set("sale-a1", { id: "sale-a1", tenantId: "tenant-A" });
      mockDb.receipts.set("rec-a1", { id: "rec-a1", tenantId: "tenant-A" });
      mockDb.payments.set("pay-a1", { id: "pay-a1", tenantId: "tenant-A" });
      mockDb.syncOutbox.set("out-a1", { id: "out-a1", tenantId: "tenant-A", entityType: "Sale" });

      mockDb.sales.set("sale-b1", { id: "sale-b1", tenantId: "tenant-B" });
      mockDb.syncOutbox.set("out-b1", { id: "out-b1", tenantId: "tenant-B", entityType: "Sale" });

      const result = await tenantStoreCleanupService.purgeSalesAndReceipts("tenant-A", mockDb);

      expect(result.success).toBe(true);
      expect(result.purgedCounts.sales).toBe(1);
      expect(result.purgedCounts.receipts).toBe(1);
      expect(result.purgedCounts.payments).toBe(1);
      expect(result.purgedCounts.sanitizedOutbox).toBe(1);

      // Tenant A cleaned
      expect(mockDb.sales.has("sale-a1")).toBe(false);
      expect(mockDb.receipts.has("rec-a1")).toBe(false);
      expect(mockDb.syncOutbox.has("out-a1")).toBe(false);

      // Tenant B untouched
      expect(mockDb.sales.has("sale-b1")).toBe(true);
      expect(mockDb.syncOutbox.has("out-b1")).toBe(true);
    });

    it("purges customers and suppliers exclusively for target tenant", async () => {
      const mockDb = new MockIndexedDbStore() as any;

      mockDb.customers.set("cust-a1", { id: "cust-a1", tenantId: "tenant-A" });
      mockDb.suppliers.set("supp-a1", { id: "supp-a1", tenantId: "tenant-A" });
      mockDb.customers.set("cust-b1", { id: "cust-b1", tenantId: "tenant-B" });

      const result = await tenantStoreCleanupService.purgeContactsAndExpenses("tenant-A", mockDb);

      expect(result.success).toBe(true);
      expect(result.purgedCounts.customers).toBe(1);
      expect(result.purgedCounts.suppliers).toBe(1);

      expect(mockDb.customers.has("cust-a1")).toBe(false);
      expect(mockDb.suppliers.has("supp-a1")).toBe(false);
      expect(mockDb.customers.has("cust-b1")).toBe(true);
    });
  });

  // ─── 3. System UI Utilities Tests ──────────────────────────────────────────

  describe("System UI Production Error Boundary & Recovery", () => {
    it("generates unique correlation IDs formatted for production tracking", () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();

      expect(id1).toMatch(/^corr-v2-[a-z0-9]+-[a-z0-9]+$/);
      expect(id2).toMatch(/^corr-v2-[a-z0-9]+-[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    it("correctly identifies dynamic chunk import failure errors for auto-healing", () => {
      expect(isChunkLoadError(new Error("Failed to fetch dynamically imported module: /src/pages/PosPage.js"))).toBe(true);
      expect(isChunkLoadError(new Error("Loading chunk 418 failed"))).toBe(true);
      expect(isChunkLoadError(new Error("Importing a module script failed."))).toBe(true);
      expect(isChunkLoadError(new Error("Regular syntax error"))).toBe(false);
      expect(isChunkLoadError(null)).toBe(false);
    });
  });

  // ─── 4. Backend Production Cleanliness Routes Tests ────────────────────────

  describe("Backend productionCleanlinessRoutes", () => {
    it("registers and enforces RBAC authorization on /api/v1/tenant/purge", async () => {
      const Fastify = (await import("fastify")).default;
      const { productionCleanlinessRoutes } = await import(
        "../../apps/api/src/routes/productionCleanlinessRoutes.js"
      );

      const app = Fastify();
      app.addHook("preHandler", async (req: any) => {
        if (req.headers["x-admin-role"]) {
          req.tenantContext = {
            tenantId: "tenant-store-1",
            userId: "usr-admin-test",
            roles: [String(req.headers["x-admin-role"]).toUpperCase()],
            permissions: ["*"],
          };
        }
      });
      productionCleanlinessRoutes(app);
      await app.ready();

      // Unauthorized call without context or header should fail 403
      const unauthRes = await app.inject({
        method: "POST",
        url: "/api/v1/tenant/purge",
        payload: { tenantId: "tenant-store-1", scope: "products" },
      });
      expect(unauthRes.statusCode).toBe(403);
      expect(JSON.parse(unauthRes.payload).error?.code).toBe("FORBIDDEN");

      // Authorized call with x-admin-role header succeeds
      const authRes = await app.inject({
        method: "POST",
        url: "/api/v1/tenant/purge",
        headers: { "x-admin-role": "SUPER_ADMIN", "x-admin-id": "usr-admin-test" },
        payload: { tenantId: "tenant-store-1", scope: "products" },
      });
      expect(authRes.statusCode).toBe(200);
      const data = JSON.parse(authRes.payload);
      expect(data.success).toBe(true);
      expect(data.tenantId).toBe("tenant-store-1");
      expect(data.scope).toBe("products");

      await app.close();
    });

    it("verifies /api/v1/production-cleanup endpoint executes and preserves platform assets", async () => {
      const Fastify = (await import("fastify")).default;
      const { productionCleanlinessRoutes } = await import(
        "../../apps/api/src/routes/productionCleanlinessRoutes.js"
      );

      const app = Fastify();
      app.addHook("preHandler", async (req: any) => {
        if (String(req.headers["x-admin-role"] || "").toUpperCase() === "SUPER_ADMIN") {
          req.tenantContext = {
            tenantId: "tenant-platform",
            userId: "usr-admin-test",
            roles: ["SUPER_ADMIN"],
            permissions: ["*"],
          };
        }
      });
      productionCleanlinessRoutes(app);
      await app.ready();

      // Unauthorized call fails
      const unauthRes = await app.inject({
        method: "POST",
        url: "/api/v1/production-cleanup",
      });
      expect(unauthRes.statusCode).toBe(403);

      // Authorized call succeeds
      const authRes = await app.inject({
        method: "POST",
        url: "/api/v1/production-cleanup",
        headers: { "x-admin-role": "SUPER_ADMIN" },
      });
      expect(authRes.statusCode).toBe(200);
      const data = JSON.parse(authRes.payload);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.preserved)).toBe(true);
      expect(data.preserved).toContain("Users/Roles");
      expect(data.preserved).toContain("Subscription Plans");

      // Readiness endpoint returns readiness checklist
      const readinessRes = await app.inject({
        method: "GET",
        url: "/api/v1/production-cleanup/readiness",
        headers: { "x-admin-role": "SUPER_ADMIN" },
      });
      expect(readinessRes.statusCode).toBe(200);
      const readinessData = JSON.parse(readinessRes.payload);
      expect(readinessData.success).toBe(true);
      expect(readinessData.data.readinessChecklist.superAdminExists).toBe(true);
      expect(readinessData.data.readinessChecklist.corePlansIntact).toBe(true);

      await app.close();
    });
  });

  // ─── 5. UI Primitives & Fallbacks Verification ─────────────────────────────

  describe("System UI Component & Hook Contracts", () => {
    it("exports valid EmptyState component with functional variant fallback", async () => {
      const { EmptyState } = await import("../../apps/web/src/components/UI/EmptyState.js");
      expect(typeof EmptyState).toBe("function");
    });

    it("exports all Skeleton shimmer loaders with expected component signatures", async () => {
      const {
        Skeleton,
        SkeletonKPI,
        SkeletonTable,
        SkeletonTableRow,
        SkeletonCard,
        SkeletonDashboard,
      } = await import("../../apps/web/src/components/UI/Skeleton.js");

      expect(typeof Skeleton).toBe("function");
      expect(typeof SkeletonKPI).toBe("function");
      expect(typeof SkeletonTable).toBe("function");
      expect(typeof SkeletonTableRow).toBe("function");
      expect(typeof SkeletonCard).toBe("function");
      expect(typeof SkeletonDashboard).toBe("function");
    });

    it("useToast hook provides safe stubs when accessed outside ToastProvider", async () => {
      const { useToast } = await import("../../apps/web/src/components/UI/Toast.js");
      const stub = useToast();

      expect(typeof stub.success).toBe("function");
      expect(typeof stub.error).toBe("function");
      expect(typeof stub.warning).toBe("function");
      expect(typeof stub.info).toBe("function");
      expect(typeof stub.confirm).toBe("function");

      // Verify stub confirm returns Promise<boolean>
      const confirmed = await stub.confirm({ title: "Test", message: "Test message" });
      expect(confirmed).toBe(true);
    });

    it("defensively handles snake_case tenant_id and empty stores in tenantStoreCleanupService", async () => {
      const mockDb = new MockIndexedDbStore() as any;

      mockDb.products.set("prod-snake", { id: "prod-snake", name: "Snake Case Item", tenant_id: "tenant-XYZ" });
      mockDb.sales.set("sale-snake", { id: "sale-snake", tenant_id: "tenant-XYZ" });

      const prodRes = await tenantStoreCleanupService.purgeProductsAndLedgers("tenant-XYZ", mockDb);
      expect(prodRes.success).toBe(true);
      expect(prodRes.purgedCounts.products).toBe(1);
      expect(mockDb.products.has("prod-snake")).toBe(false);

      const saleRes = await tenantStoreCleanupService.purgeSalesAndReceipts("tenant-XYZ", mockDb);
      expect(saleRes.success).toBe(true);
      expect(saleRes.purgedCounts.sales).toBe(1);
      expect(mockDb.sales.has("sale-snake")).toBe(false);
    });

    it("executes full Production Cleanliness Certification engine and generates immutable evidence", async () => {
      const { runProductionCleanlinessCertification } = await import(
        "../../scripts/certification/runProductionCleanlinessCertification.js"
      );
      const cert = await runProductionCleanlinessCertification();
      expect(cert.totalPillars).toBe(10);
      expect(cert.passedPillars).toBe(10);
      expect(cert.failedPillars).toBe(0);
      expect(cert.successRatePct).toBe(100);
    });
  });
});
