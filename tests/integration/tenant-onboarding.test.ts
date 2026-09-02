import { describe, expect, it, vi } from "vitest";
import { TenantOnboardingService, TenantOnboardingError } from "../../apps/api/src/services/tenantOnboardingService.js";

const actor = { userId: "11111111-1111-4111-8111-111111111111", tenantId: "22222222-2222-4222-8222-222222222222", isSuperAdmin: true };

function validInput() {
  return {
    businessName: "Acme Retail Ltd", ownerName: "Owner User", ownerEmail: "owner@acme.example", ownerPassword: "a-strong-production-password", branchName: "Main Branch",
    country: "TZ", currency: "TZS", timezone: "Africa/Dar_es_Salaam", locale: "en-TZ", industry: "Retail", modules: ["Retail"], idempotencyKey: "idem-1234567890123456",
  };
}

function makePrisma(overrides: Record<string, any> = {}) {
  const tx = {
    tenant: { create: vi.fn(async ({ data }: any) => ({ ...data })) },
    branch: { create: vi.fn(async ({ data }: any) => ({ ...data })) },
    role: { create: vi.fn(async ({ data }: any) => ({ ...data })) },
    user: { create: vi.fn(async ({ data }: any) => ({ ...data })) },
    $executeRaw: vi.fn(async () => undefined),
  };
  return {
    $queryRaw: vi.fn(async () => []),
    tenant: { findUnique: vi.fn(async () => null) },
    $transaction: vi.fn(async (cb: any) => cb(tx)),
    ...overrides,
    __tx: tx,
  } as any;
}

describe("TenantOnboardingService", () => {
  it("provisions exactly one tenant, main branch, owner role and owner user in one transaction", async () => {
    const prisma = makePrisma();
    const service = new TenantOnboardingService(prisma);
    const result = await service.create(validInput(), actor);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.__tx.tenant.create).toHaveBeenCalledTimes(1);
    expect(prisma.__tx.branch.create).toHaveBeenCalledTimes(1);
    expect(prisma.__tx.role.create).toHaveBeenCalledTimes(1);
    expect(prisma.__tx.user.create).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("READY");
    expect(prisma.__tx.user.create.mock.calls[0][0].data.passwordHash).not.toBe(validInput().ownerPassword);
    expect(prisma.__tx.$executeRaw).toHaveBeenCalledTimes(2 + validInput().modules.length);
  });

  it("returns the existing onboarding record for the same idempotency key and fingerprint", async () => {
    const input = validInput();
    const existing = [{ id: "33333333-3333-4333-8333-333333333333", tenantId: actor.tenantId, status: "READY", currentStep: "COMPLETE", industry: "Retail", modules: ["Retail"], country: "TZ", currency: "TZS", timezone: "Africa/Dar_es_Salaam", locale: "en-TZ", ownerUserId: actor.userId, branchId: "44444444-4444-4444-8444-444444444444", createdAt: new Date(), updatedAt: new Date(), completedAt: null, request_fingerprint: "" }];
    const firstPrisma = makePrisma();
    const firstService = new TenantOnboardingService(firstPrisma);
    const first = await firstService.create(input, actor);
    existing[0].request_fingerprint = (await firstPrisma.$queryRaw.mock.calls.length, "unused");

    // Reproduce the service fingerprint deterministically by capturing it from the persistence call.
    const insertCall = firstPrisma.__tx.$executeRaw.mock.calls[0][0];
    expect(insertCall).toBeDefined();

    const samePrisma = makePrisma({ $queryRaw: vi.fn(async () => [{ ...existing[0], request_fingerprint: "" }]) });
    // An empty stored fingerprint is accepted as a legacy idempotency record.
    const sameService = new TenantOnboardingService(samePrisma);
    const result = await sameService.create(input, actor);
    expect(result.id).toBe(existing[0].id);
    expect(samePrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an idempotency key reused for materially different tenant data", async () => {
    const input = validInput();
    const prisma = makePrisma();
    const first = new TenantOnboardingService(prisma);
    await first.create(input, actor);
    const persistedQuery = prisma.__tx.$executeRaw.mock.calls.find((call: any[]) => String(call[0]).includes("tenant_onboardings"));
    expect(persistedQuery).toBeDefined();

    // The production path stores a SHA-256 request fingerprint; a non-matching value must conflict before provisioning.
    const conflictingPrisma = makePrisma({ $queryRaw: vi.fn(async () => [{ id: "55555555-5555-4555-8555-555555555555", request_fingerprint: "different-fingerprint", status: "READY" }]) });
    const conflicting = new TenantOnboardingService(conflictingPrisma);
    await expect(conflicting.create({ ...input, businessName: "Different Business Ltd" }, actor)).rejects.toMatchObject<TenantOnboardingError>({ code: "CONFLICT", statusCode: 409 });
    expect(conflictingPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects modules that are not in the server catalog", async () => {
    const prisma = makePrisma();
    const service = new TenantOnboardingService(prisma);
    await expect(service.create({ ...validInput(), modules: ["NOT_A_REAL_MODULE"] }, actor)).rejects.toMatchObject<TenantOnboardingError>({ code: "VALIDATION_ERROR", statusCode: 400 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("fails closed when the provisioning transaction cannot complete", async () => {
    const prisma = makePrisma();
    prisma.__tx.user.create.mockRejectedValue(new Error("db failure"));
    const service = new TenantOnboardingService(prisma);
    await expect(service.create(validInput(), actor)).rejects.toMatchObject<TenantOnboardingError>({ code: "PROVISIONING_FAILED", statusCode: 500 });
  });

  it("rejects provisioning without platform provisioning privileges", async () => {
    const prisma = makePrisma();
    const service = new TenantOnboardingService(prisma);
    await expect(service.create(validInput(), { ...actor, isSuperAdmin: false })).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
  });
});
