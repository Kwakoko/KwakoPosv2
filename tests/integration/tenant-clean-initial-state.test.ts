import { describe, expect, it, vi } from "vitest";
import { TenantOnboardingService } from "../../apps/api/src/services/tenantOnboardingService.js";
import { PrismaCatalogRepository } from "@kwakopos2/database";

const actor = {
  userId: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  isSuperAdmin: true,
};

const input = {
  businessName: "Clean Initialization Test Tenant",
  ownerName: "Owner User",
  ownerEmail: "owner@clean.example",
  ownerPassword: "a-strong-production-password",
  branchName: "Main Branch",
  country: "TZ",
  currency: "TZS",
  timezone: "Africa/Dar_es_Salaam",
  locale: "en-TZ",
  industry: "Retail",
  modules: ["Retail"],
  idempotencyKey: "clean-init-1234567890123456",
};

function makePrisma() {
  const tx = {
    tenant: { create: vi.fn(async ({ data }: any) => ({ ...data })), findUnique: vi.fn(async () => null) },
    branch: { create: vi.fn(async ({ data }: any) => ({ ...data })) },
    role: { create: vi.fn(async ({ data }: any) => ({ ...data })) },
    user: { create: vi.fn(async ({ data }: any) => ({ ...data })) },
    $queryRaw: vi.fn(async () => []),
    $executeRaw: vi.fn(async () => undefined),
  };
  return { $transaction: vi.fn(async (cb: any) => cb(tx)), __tx: tx } as any;
}

describe("Production tenant clean initialization", () => {
  it("provisions no business master data during tenant initialization", async () => {
    const prisma = makePrisma();
    const service = new TenantOnboardingService(prisma);

    const result = await service.create(input, actor);

    expect(result.status).toBe("READY");
    expect(prisma.__tx.tenant.create).toHaveBeenCalledTimes(1);
    expect(prisma.__tx.branch.create).toHaveBeenCalledTimes(1);
    expect(prisma.__tx.role.create).toHaveBeenCalledTimes(1);
    expect(prisma.__tx.user.create).toHaveBeenCalledTimes(1);

    const sqlCalls = prisma.__tx.$executeRaw.mock.calls
      .map(([query]: any[]) => String(query?.strings?.join?.(" ") ?? query ?? "").toLowerCase());
    expect(sqlCalls.some((sql: string) => sql.includes("insert into categories"))).toBe(false);
    expect(sqlCalls.some((sql: string) => sql.includes("insert into brands"))).toBe(false);
    expect(sqlCalls.some((sql: string) => sql.includes("insert into products"))).toBe(false);
    expect(sqlCalls.some((sql: string) => sql.includes("insert into customers"))).toBe(false);
    expect(sqlCalls.some((sql: string) => sql.includes("insert into suppliers"))).toBe(false);
    expect(sqlCalls.some((sql: string) => sql.includes("insert into sales"))).toBe(false);
    expect(sqlCalls.some((sql: string) => sql.includes("insert into stock"))).toBe(false);
  });

  it("does not seed Categories or Brands when a fresh tenant lists its catalog", async () => {
    const categoryUpsert = vi.spyOn((PrismaCatalogRepository as any).prototype, "ensureDefaults");
    const catalog = new PrismaCatalogRepository();

    const defaultsResult = await catalog.ensureDefaults({
      tenantId: actor.tenantId,
      branchId: "33333333-3333-4333-8333-333333333333",
      userId: actor.userId,
    } as any);

    expect(categoryUpsert).toHaveBeenCalledTimes(1);
    expect(defaultsResult).toBeUndefined();
    categoryUpsert.mockRestore();
  });
});
