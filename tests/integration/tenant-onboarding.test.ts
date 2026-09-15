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
  const normalized = { ...input, ownerPassword: createHash("sha256").update(input.ownerPassword).digest("hex") };
  return createHash("sha256").update(JSON.stringify(Object.fromEntries(Object.entries(normalized).sort(([a], [b]) => a.localeCompare(b))))).digest("hex");
}

function makePrisma(overrides: Record<string, any> = {}) {
  const tx = {
    tenant: { create: vi.fn(async ({ data }: any) => ({ ...data })), findUnique: vi.fn(async () => null), update: vi.fn(async ({ data }: any) => ({ ...data })) },
    branch: { create: vi.fn(async ({ data }: any) => ({ ...data })), update: vi.fn(async ({ data }: any) => ({ ...data })) },
    role: { create: vi.fn(async ({ data }: any) => ({ ...data })) },
    user: { create: vi.fn(async ({ data }: any) => ({ ...data })) },
    $queryRaw: vi.fn(async () => []),
    $executeRaw: vi.fn(async () => undefined),
  };
  return {
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
    expect(prisma.__tx.$executeRaw).toHaveBeenCalledTimes(3 + validInput().modules.length);
  });

  it("returns a create-shaped response for an idempotent replay", async () => {
    const input = validInput();
    const existing = [{ id: "33333333-3333-4333-8333-333333333333", tenant_id: actor.tenantId, status: "READY", current_step: "COMPLETE", industry: "Retail", modules: ["Retail"], country: "TZ", currency: "TZS", timezone: "Africa/Dar_es_Salaam", locale: "en-TZ", owner_user_id: actor.userId, branch_id: "44444444-4444-4444-8444-444444444444", created_at: new Date(), updated_at: new Date(), completed_at: null, request_fingerprint: requestFingerprint(input) }];
    const prisma = makePrisma();
    prisma.__tx.$queryRaw.mockResolvedValue(existing);
    const service = new TenantOnboardingService(prisma);
    const result = await service.create(input, actor);
    expect(result.onboardingId).toBe(existing[0].id);
    expect(result.tenantId).toBe(existing[0].tenant_id);
    expect(result.branchId).toBe(existing[0].branch_id);
    expect(prisma.__tx.tenant.create).not.toHaveBeenCalled();
  });

  it("rejects an idempotency key reused for materially different tenant data", async () => {
    const input = validInput();
    const prisma = makePrisma();
    prisma.__tx.$queryRaw.mockResolvedValue([{ id: "55555555-5555-4555-8555-555555555555", request_fingerprint: requestFingerprint(input), status: "READY" }]);
    const service = new TenantOnboardingService(prisma);
    await expect(service.create({ ...input, businessName: "Different Business Ltd" }, actor)).rejects.toMatchObject<TenantOnboardingError>({ code: "CONFLICT", statusCode: 409 });
    expect(prisma.__tx.tenant.create).not.toHaveBeenCalled();
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
