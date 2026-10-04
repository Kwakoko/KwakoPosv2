import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma, PrismaProductRepository, PrismaStockRepository } from "@kwakopos2/database";
import { WorldStandardPrismaSyncEngine } from "../../packages/sync/src/worldStandardPrismaSyncEngine.js";

const enabled = Boolean(process.env.DATABASE_URL);

describe("Settings P0/P1 closed-loop certification", () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const branchA = randomUUID();
  const branchB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();

  beforeAll(async () => {
    if (!enabled) return;
    await prisma.tenant.create({ data: { id: tenantA, name: "Settings A", slug: "settings-a-" + tenantA.slice(0, 8) } });
    await prisma.branch.create({ data: { id: branchA, tenantId: tenantA, name: "Main A", code: "SET-A", isMain: true } });
    await prisma.tenant.create({ data: { id: tenantB, name: "Settings B", slug: "settings-b-" + tenantB.slice(0, 8) } });
    await prisma.branch.create({ data: { id: branchB, tenantId: tenantB, name: "Main B", code: "SET-B", isMain: true } });
  });

  afterAll(async () => {
    if (!enabled) return;
    await prisma.auditEvent.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
    await prisma.setting.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
    await prisma.syncOperation.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
    await prisma.branch.deleteMany({ where: { id: { in: [branchA, branchB] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
  });

  it("persists branch Settings, writes audit/journal, and isolates tenants", async () => {
    if (!enabled) return;
    const engine = new WorldStandardPrismaSyncEngine(new PrismaProductRepository(), new PrismaStockRepository());
    const ctxA: any = { tenantId: tenantA, branchId: branchA, userId: userA, roles: ["ADMIN"], permissions: ["settings.manage"] };
    const ctxB: any = { tenantId: tenantB, branchId: branchB, userId: userB, roles: ["ADMIN"], permissions: ["settings.manage"] };
    const settingId = randomUUID();
    const operationId = randomUUID();
    const pushed = await engine.processPush(ctxA, {
      deviceId: "settings-device-a",
      operations: [{
        operationId,
        idempotencyKey: "SETTINGS:" + operationId,
        entityType: "Setting",
        entityId: settingId,
        operationType: "CREATE",
        payload: { key: "tax.config", scope: "BRANCH", branchId: branchA, value: { vatEnabled: true, vatRatePercent: 18, currencyCode: "TZS" } },
        clientCreatedAt: new Date().toISOString(),
      }],
    } as any);

    expect(pushed.results[0]?.status).toBe("SUCCESS");
    const row = await prisma.setting.findUnique({ where: { id: settingId } });
    expect(row?.tenantId).toBe(tenantA);
    expect(row?.branchId).toBe(branchA);
    expect(row?.scope).toBe("BRANCH");
    expect(row?.key).toBe("tax.config");

    const audit = await prisma.auditEvent.findFirst({ where: { tenantId: tenantA, entityId: settingId, action: "SETTING_UPDATED" } });
    expect(audit?.userId).toBe(userA);

    const deltaB: any = await engine.processDelta(ctxB, { since: "rev:0" } as any);
    expect(deltaB.changes?.some((change: any) => change.entityId === settingId)).toBe(false);

    const deltaA: any = await engine.processDelta(ctxA, { since: "rev:0" } as any);
    expect(deltaA.changes?.some((change: any) => change.entityId === settingId && change.entityType === "Setting")).toBe(true);

    const updateOpId = randomUUID();
    const updated = await engine.processPush(ctxA, {
      deviceId: "settings-device-a",
      operations: [{
        operationId: updateOpId,
        idempotencyKey: "SETTINGS:" + updateOpId,
        entityType: "Setting",
        entityId: settingId,
        operationType: "UPDATE",
        payload: { key: "tax.config", scope: "BRANCH", branchId: branchA, value: { vatEnabled: true, vatRatePercent: 20, currencyCode: "TZS" } },
        clientCreatedAt: new Date().toISOString(),
      }],
    } as any);
    expect(updated.results[0]?.status).toBe("SUCCESS");

    const current = await prisma.setting.findUnique({ where: { id: settingId } });
    expect((current?.value as any)?.vatRatePercent).toBe(20);
    expect(current?.version).toBeGreaterThan(1);

    const deleteOpId = randomUUID();
    const deleted = await engine.processPush(ctxA, {
      deviceId: "settings-device-a",
      operations: [{
        operationId: deleteOpId,
        idempotencyKey: "SETTINGS:" + deleteOpId,
        entityType: "Setting",
        entityId: settingId,
        operationType: "DELETE",
        payload: { key: "tax.config", scope: "BRANCH", branchId: branchA },
        clientCreatedAt: new Date().toISOString(),
      }],
    } as any);
    expect(deleted.results[0]?.status).toBe("SUCCESS");

    const tombstoned = await prisma.setting.findUnique({ where: { id: settingId } });
    expect(tombstoned?.isActive).toBe(false);
  });

  it("fails closed for a cashier without settings.manage", async () => {
    if (!enabled) return;
    const engine = new WorldStandardPrismaSyncEngine(new PrismaProductRepository(), new PrismaStockRepository());
    const ctx: any = { tenantId: tenantA, branchId: branchA, userId: userA, roles: ["CASHIER"], permissions: [] };
    await expect(engine.processPush(ctx, {
      deviceId: "settings-cashier",
      operations: [{
        operationId: randomUUID(),
        idempotencyKey: "DENY:" + randomUUID(),
        entityType: "Setting",
        entityId: randomUUID(),
        operationType: "UPDATE",
        payload: { key: "tax.config", scope: "BRANCH", branchId: branchA, value: { vatRatePercent: 5 } },
        clientCreatedAt: new Date().toISOString(),
      }],
    } as any)).rejects.toThrow("SETTINGS_MANAGE_REQUIRED");
  });
});
