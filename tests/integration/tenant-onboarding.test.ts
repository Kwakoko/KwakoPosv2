import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { TenantOnboardingService, TenantOnboardingError } from "../../apps/api/src/services/tenantOnboardingService.js";

const actor = { userId: "11111111-1111-4111-8111-111111111111", tenantId: "22222222-2222-4222-8222-222222222222", isSuperAdmin: true };

function validInput() {
  return {
    businessName: "Acme Retail Ltd", ownerName: "Owner User", ownerEmail: "owner@acme.example", ownerPassword: "a-strong-production-password", branchName: "Main Branch",
    country: "TZ", currency: "TZS", timezone: "Africa/Dar_es_Salaam", locale: "en-TZ", industry: "Retail", modules: ["Retail"], idempotencyKey: "idem-1234567890123456",
  };
}

function requestFingerprint(input: ReturnType<typeof validInput>): string {
  const normalized = { ...input, ownerPassword: undefined };
  const text = JSON.stringify(normalized, Object.keys(normalized).sort());
  return createHash("sha256").update(text).digest("hex");
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
    const existing = [{ id: "33333333-3333-4333-8333-333333333333", tenantId: actor.tenantId, status: "READY", currentStep: "COMPLETE", industry: "Retail", modules: ["Retail"], country: "TZ", currency: "TZS", timezone: "Africa/Dar_es_Salaam", locale: "en-TZ", ownerUserId: actor.userId, branchId: "44444444-4444-4444-8444-444444444444", createdAt: new Date(), updatedAt: new Date(), completedAt: null, request_fingerprint: requestFingerprint(input) }];
    const prisma = makePrisma({ $queryRaw: vi.fn(async () => existing) });
    const service = new TenantOnboardingService(prisma);
    const result = await service.create(input, actor);
    expect(result.id).toBe(existing[0].id);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an idempotency key reused for materially different tenant data", async () => {
    const input = validInput();
    const prisma = makePrisma({ $queryRaw: vi.fn(async () => [{ id: "55555555-5555-4555-8555-555555555555", request_fingerprint: requestFingerprint(input), status: "READY" }]) });
    const conflicting = new TenantOnboardingService(prisma);
    await expect(conflicting.create({ ...input, businessName: "Different Business Ltd" }, actor)).rejects.toMatchObject<TenantOnboardingError>({ code: "CONFLICT", statusCode: 409 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
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
