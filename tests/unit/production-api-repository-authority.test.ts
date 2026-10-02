import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("P0 production API PostgreSQL authority", () => {
  it("selects Prisma authorities for every production business repository", () => {
    const server = read("apps/api/src/server.ts");
    expect(server).toContain("const commercialRepository: any = productionPersistence ? new PrismaCommercialRepository()");
    expect(server).toContain("const workforceRepository: any = productionPersistence ? new PrismaWorkforceRepository()");
    expect(server).toContain("const pluginRepository: any = productionPersistence ? new PrismaPluginRepository()");
    expect(server).toContain("const telecomRepository: any = productionPersistence ? new PrismaTelecomRepository()");
    expect(server).toContain("const monetizationRepository: any = productionPersistence ? new PrismaMonetizationRepository()");
    expect(server).toContain('process.env.K_SERVICE != null');
    expect(server).toContain("const productionPersistence = isProductionEnv(config)");
    expect(server).toContain("PERSISTENCE_FATAL: Production API repository authority must be PostgreSQL-backed.");
  });

  it("does not expose in-memory or fabricated production route authorities", () => {
    const server = read("apps/api/src/server.ts");
    const routeStart = server.indexOf("// Commercial Core Routes");
    const routeEnd = server.indexOf("tenantOnboardingRoutes(server);");
    expect(routeStart).toBeGreaterThanOrEqual(0);
    expect(routeEnd).toBeGreaterThan(routeStart);

    const productionRoutes = server.slice(routeStart, routeEnd);
    for (const legacy of [
      "legacyGlobalCommercialRepository",
      "legacyGlobalWorkforceRepository",
      "legacyGlobalPluginRepository",
      "legacyGlobalTelecomRepository",
      "legacyGlobalMonetizationRepository",
    ]) expect(productionRoutes).not.toContain(legacy);

    expect(productionRoutes).not.toContain("commercialRepository.sales.get");
    expect(productionRoutes).not.toContain("commercialRepository.purchaseOrders.values");
    expect(productionRoutes).not.toContain("commercialRepository.cashSessions.values");
    expect(productionRoutes).not.toContain("pluginRepository.wholesaleTierRules.get");
    expect(productionRoutes).not.toContain("telecomRepository.ranSectors.values");
    expect(productionRoutes).not.toContain("telecomRepository.workOrders.values");

    const tenantExport = read("apps/api/src/routes/tenantExportRoutes.ts");
    expect(tenantExport).toContain('import { prisma } from "@kwakopos2/database";');
    expect(tenantExport).not.toContain("globalInMemoryStore");
    expect(tenantExport).not.toContain("globalCommercialRepository");
    expect(tenantExport).not.toContain("globalFinanceRepository");

    const cleanup = read("apps/api/src/routes/productionCleanlinessRoutes.ts");
    expect(cleanup).toContain("prisma.$transaction");
    expect(cleanup).not.toContain("globalInMemoryStore");
    expect(cleanup).not.toContain(".catch(() => {})");

    const dbConsole = read("apps/api/src/routes/superAdminDatabaseRoutes.ts");
    expect(dbConsole).not.toContain("globalInMemoryStore");
    expect(dbConsole).not.toContain("KNOWN_TABLES");
    expect(dbConsole).not.toContain("2450");

    const receipts = read("packages/database/src/receiptRepositories.ts");
    expect(receipts).toContain("constructor(private prisma: PrismaClient = new PrismaClient())");
    expect(receipts).toContain("export const globalReceiptRepository: ScopedReceiptRepository = new PrismaReceiptRepository();");

    expect(server).toContain('await telecomRepository.createKmlImport(req.tenantContext!, parsedRecord)');
  });
});
