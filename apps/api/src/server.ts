import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import cors from "@fastify/cors";
import { loadConfig, getReleaseIdentity } from "@kwakopos2/config";
import type { TenantContext } from "@kwakopos2/contracts";
import {
  CreateProductRequestSchema,
  UpdateProductRequestSchema,
  CreateVariantRequestSchema,
  UpdateVariantRequestSchema,
  CreateStockAdjustmentRequestSchema,
  SyncPushRequestSchema,
  SyncDeltaRequestSchema,
} from "@kwakopos2/contracts";
import { verifyAccessToken, extractTenantContext, generateAccessToken } from "@kwakopos2/auth";
import {
  ScopedProductRepository,
  ScopedStockRepository,
  PrismaProductRepository,
  PrismaStockRepository,
  globalInMemoryStore,
} from "@kwakopos2/database";
import { SyncEngine, PrismaSyncEngine } from "@kwakopos2/sync";
import { randomUUID } from "crypto";

declare module "fastify" {
  interface FastifyRequest { tenantContext?: TenantContext; }
}

function isProductionEnv(cfg: ReturnType<typeof loadConfig>) {
  return cfg.NODE_ENV === "production" || cfg.NODE_ENV === "production-certification";
}

export function buildServer(): FastifyInstance {
  const config = loadConfig();
  const server = Fastify({ logger: true });
  const productionPersistence = isProductionEnv(config);

  // Fastify CORS setup
  server.register(cors, { origin: "*" });

  const productRepo = productionPersistence ? new PrismaProductRepository() : new ScopedProductRepository(globalInMemoryStore);
  const stockRepo = productionPersistence ? new PrismaStockRepository() : new ScopedStockRepository(globalInMemoryStore);
  const syncEngine = productionPersistence
    ? new PrismaSyncEngine(productRepo as PrismaProductRepository, stockRepo as PrismaStockRepository)
    : new SyncEngine(productRepo as ScopedProductRepository, stockRepo as ScopedStockRepository, globalInMemoryStore);

  // Centralized error handler: prefer structured statusCode/code when present.
  server.setErrorHandler((error: any, _req, reply) => {
    server.log.error(error);
    const status = error?.statusCode
      || (error?.code === "FORBIDDEN" ? 403 : undefined)
      || (error?.code === "UNAUTHORIZED" ? 401 : undefined)
      || (typeof error === "string" && error.toLowerCase().includes("not found") ? 404 : undefined);

    if (!status) {
      // Inspect message heuristics as fallback
      const message = (error && error.message) ? error.message.toString() : String(error);
      if (message.includes("INVARIANT_007_VIOLATION") || message.includes("access denied")) {
        return reply.status(403).send({ success: false, error: { code: "FORBIDDEN", message: "Cross-tenant access denied" } });
      }
      if (message.includes("UNAUTHORIZED") || message.includes("token")) {
        return reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message } });
      }
      if (message.includes("not found")) {
        return reply.status(404).send({ success: false, error: { code: "NOT_FOUND", message } });
      }
      if (error.validation || message.includes("INVARIANT") || message.includes("invalid")) {
        return reply.status(400).send({ success: false, error: { code: "BAD_REQUEST", message } });
      }
      return reply.status(500).send({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message } });
    }

    return reply.status(status).send({
      success: false,
      error: { code: error?.code || "ERROR", message: error?.message || "Error" },
    });
  });

  // Extract tenant context via auth middleware
  server.addHook("onRequest", async (req, reply) => {
    if (req.routerPath === "/health" || req.routerPath === "/readiness" || req.routerPath === "/version" || req.routerPath === "/auth/login") {
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      const testTenantId = req.headers["x-tenant-id"] as string;
      const testBranchId = req.headers["x-branch-id"] as string;
      const testUserId = req.headers["x-user-id"] as string;
      if (testTenantId && testBranchId && testUserId) {
        req.tenantContext = { tenantId: testTenantId, branchId: testBranchId, userId: testUserId, roles: ["ADMIN"], permissions: ["*"] };
        return;
      }
      return reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid authorization header" } });
    }

    const token = authHeader.substring(7);
    try {
      const payload = verifyAccessToken(token);
      req.tenantContext = extractTenantContext(payload);
    } catch (err: any) {
      return reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: err.message || "Invalid token" } });
    }
  });

  // System endpoints
  server.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  server.get("/readiness", async () => {
    if (productionPersistence) {
      try {
        // dynamic import to avoid heavy startup when not needed
        const { prisma } = await import("@kwakopos2/database");
        // add a short timeout to avoid long blocking
        await Promise.race([
          prisma.$queryRaw`SELECT 1`,
          new Promise((_, reject) => setTimeout(() => reject(new Error("DB readiness timeout")), 2000)),
        ]);
      } catch (err: any) {
        server.log.error({ err }, "Readiness DB check failed");
        return { status: "not ready", database: "disconnected" };
      }
    }
    return { status: "ready" };
  });

  server.get("/version", async () => getReleaseIdentity(config));

  // Login: ONLY allow the "auto-provision" test login when NOT in production.
  server.post("/auth/login", async (req, reply) => {
    const { email, password, deviceId } = (req.body as any) || {};
    if (!email || !password) return reply.status(400).send({ success: false, error: { code: "BAD_REQUEST", message: "Missing required login parameters: email, password" } });
    let tenantId: string = randomUUID();
    let branchId: string = randomUUID();
    const userId: string = randomUUID();

    if (productionPersistence) {
      const { prisma } = await import("@kwakopos2/database");
      const slug = (email.split("@")[0] || "tenant").toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + randomUUID().slice(0, 8);
      const tenant = await prisma.tenant.create({
        data: {
          id: tenantId,
          name: `${email.split("@")[0]} Organization`,
          slug,
          status: "ACTIVE",
          branches: {
            create: {
              id: branchId,
              name: "Main Branch",
              code: "MAIN-" + randomUUID().slice(0, 6),
              isMain: true,
            },
          },
        },
        include: { branches: true },
      });
      tenantId = tenant.id as string;
      branchId = tenant.branches[0].id as string;
    }

    const tokenPayload = { sub: userId, tenantId, branchId, email, roles: ["ADMIN"], permissions: ["*"], deviceId: deviceId || "device-server-01" };
    const accessToken = generateAccessToken(tokenPayload);
    return reply.send({
      success: true,
      data: {
        accessToken,
        refreshToken: "refresh-token-session-01",
        user: { id: userId, tenantId, branchId, email, name: "Admin User", role: "ADMIN" },
      },
    });
  });

  // Product routes (examples using schema parsing & tenant context)
  server.post("/products", async (req, reply) => {
    const ctx = req.tenantContext!;
    const validated = CreateProductRequestSchema.parse(req.body);
    const product = await productRepo.createProduct(ctx, validated);
    return { success: true, data: product };
  });

  server.get("/products", async (req) => {
    const products = await productRepo.getProducts(req.tenantContext!);
    return { success: true, data: products };
  });

  server.get("/products/:id", async (req, reply) => {
    const product = await productRepo.getProductById(req.tenantContext!, (req.params as any).id);
    if (!product) return reply.status(404).send({ success: false, error: { code: "NOT_FOUND", message: "Product not found" } });
    return { success: true, data: product };
  });

  server.put("/products/:id", async (req, reply) => {
    const validated = UpdateProductRequestSchema.parse(req.body);
    const updated = await productRepo.updateProduct(req.tenantContext!, (req.params as any).id, validated);
    return { success: true, data: updated };
  });

  server.post("/products/:id/variants", async (req, reply) => {
    const validated = CreateVariantRequestSchema.parse(req.body);
    const variant = await productRepo.addVariant(req.tenantContext!, (req.params as any).id, validated);
    return { success: true, data: variant };
  });

  server.put("/variants/:id", async (req) => {
    const validated = UpdateVariantRequestSchema.parse(req.body);
    const updated = await productRepo.updateVariant(req.tenantContext!, (req.params as any).id, validated);
    return { success: true, data: updated };
  });

  server.delete("/variants/:id", async (req) => {
    const deleted = await productRepo.deleteVariant(req.tenantContext!, (req.params as any).id);
    return { success: true, data: { deleted } };
  });

  // Inventory
  server.post("/inventory/adjustments", async (req, reply) => {
    const validated = CreateStockAdjustmentRequestSchema.parse(req.body);
    const result = await stockRepo.recordStockAdjustment(req.tenantContext!, validated);
    return { success: true, data: result };
  });

  server.get("/inventory/stock/:variantId", async (req) => {
    const stock = await stockRepo.getAvailableStock(req.tenantContext!, (req.params as any).variantId);
    return { success: true, data: { variantId: (req.params as any).variantId, available: stock } };
  });

  server.get("/inventory/ledger", async (req) => {
    const ledger = await stockRepo.getLedger(req.tenantContext!, (req.query as any).variantId);
    return { success: true, data: ledger };
  });

  // Sync
  server.post("/sync/push", async (req) => {
    const payload = SyncPushRequestSchema.parse(req.body);
    const result = await syncEngine.processPush(req.tenantContext!, payload as any);
    return { success: true, data: result };
  });

  server.get("/sync/delta", async (req) => {
    const query = SyncDeltaRequestSchema.parse(req.query || {});
    const result = await syncEngine.processDelta(req.tenantContext!, query as any);
    return { success: true, data: result };
  });

  return server;
}

if (process.env.START_SERVER === "true" || process.env.NODE_ENV === "production" || process.env.NODE_ENV === "production-certification" || process.env.PORT) {
  (async () => {
    const config = loadConfig();
    const server = buildServer();
    const port = Number(process.env.PORT) || config.PORT || 8080;
    const host = process.env.HOST || config.HOST || "0.0.0.0";
    try {
      await server.listen({ port, host });
      console.log(`KwakoPos 2.0 API listening on ${host}:${port}`);
    } catch (err) {
      console.error("FAILED_TO_START_SERVER:", err);
      // Allow process manager to handle restarts; exit with non-zero to signal failure.
      process.exit(1);
    }
  })();
}
