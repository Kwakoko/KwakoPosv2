import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma, PrismaCommercialRepository } from "@kwakopos2/database";
import { hashPassword } from "@kwakopos2/auth";
import type { TenantContext } from "@kwakopos2/contracts";

describe("Cash Management Production Lock v1 — authoritative lifecycle", () => {
  const tenantId = randomUUID();
  const branchId = randomUUID();
  const cashierId = randomUUID();
  const cashier2Id = randomUUID();
  const managerId = randomUUID();
  const cashierRoleId = randomUUID();
  const cashier2RoleId = randomUUID();
  const managerRoleId = randomUUID();
  const saleCashId = randomUUID();
  const saleCardId = randomUUID();
  const cashierCtx: TenantContext = {
    tenantId, branchId, userId: cashierId, roles: ["CASHIER"], permissions: ["cashdrawer.open", "cashdrawer.close", "cashdrawer.move"],
  };
  const cashier2Ctx: TenantContext = {
    tenantId, branchId, userId: cashier2Id, roles: ["CASHIER"], permissions: ["cashdrawer.open", "cashdrawer.close", "cashdrawer.move"],
  };
  const managerCtx: TenantContext = {
    tenantId, branchId, userId: managerId, roles: ["MANAGER"], permissions: ["cashdrawer.approve", "cashdrawer.move", "cashdrawer.close", "cashdrawer.view"],
  };

  let repository: PrismaCommercialRepository;
  let sourceSessionId = "";
  let destinationSessionId = "";

  beforeAll(async () => {
    await prisma.tenant.create({ data: { id: tenantId, name: "Cash Lock Test", slug: "cash-lock-" + tenantId.slice(0, 8), status: "ACTIVE" } });
    await prisma.branch.create({ data: { id: branchId, tenantId, name: "Main", code: "CASHLOCK", isMain: true } });
    await prisma.role.create({ data: { id: cashierRoleId, tenantId, name: "CASHIER", permissions: cashierCtx.permissions } });
    await prisma.role.create({ data: { id: managerRoleId, tenantId, name: "MANAGER", permissions: managerCtx.permissions } });
    await prisma.role.create({ data: { id: cashier2RoleId, tenantId, name: "CASHIER-2", permissions: cashier2Ctx.permissions } });
    await prisma.user.create({
      data: { id: cashierId, tenantId, branchId, email: "cashier-" + tenantId.slice(0, 8) + "@example.invalid", passwordHash: await hashPassword("CashLock!123"), name: "Cash Lock Cashier", roleId: cashierRoleId, status: "ACTIVE" },
    });
    await prisma.user.create({
      data: { id: cashier2Id, tenantId, branchId, email: "cashier2-" + tenantId.slice(0, 8) + "@example.invalid", passwordHash: await hashPassword("CashLock!789"), name: "Cash Lock Cashier 2", roleId: cashier2RoleId, status: "ACTIVE" },
    });
    await prisma.user.create({
      data: { id: managerId, tenantId, branchId, email: "manager-" + tenantId.slice(0, 8) + "@example.invalid", passwordHash: await hashPassword("CashLock!456"), name: "Cash Lock Manager", roleId: managerRoleId, status: "ACTIVE" },
    });
    repository = new PrismaCommercialRepository();
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
  });

  it("runs the locked cash lifecycle across registers, channels, movement, variance and audit controls", async () => {
    const source = await repository.openCashSession(cashierCtx, { openingCash: 100000, registerCode: "REG-A", deviceId: "DEVICE-A" });
    const destination = await repository.openCashSession(cashier2Ctx, { openingCash: 0, registerCode: "REG-B", deviceId: "DEVICE-B" });
    sourceSessionId = source.id;
    destinationSessionId = destination.id;
    expect(source.registerCode).toBe("REG-A");
    expect(destination.registerCode).toBe("REG-B");

    await expect(
      repository.openCashSession(managerCtx, { openingCash: 50000, registerCode: "REG-A", deviceId: "DEVICE-M" }),
    ).rejects.toThrow("CASH_REGISTER_SESSION_ALREADY_OPEN");

    await prisma.sale.create({
      data: {
        id: saleCashId, tenantId, branchId, saleNumber: "CASH-LOCK-SALE-1", cashSessionId: source.id,
        grandTotal: 10000, subtotal: 10000, deviceId: "DEVICE-A", operationId: randomUUID(), idempotencyKey: "cash-lock-sale-1",
      },
    });
    await prisma.payment.create({
      data: { id: randomUUID(), tenantId, branchId, paymentNumber: "CASH-LOCK-PAY-1", saleId: saleCashId, amount: 10000, paymentMethod: "CASH", provider: "CASH", status: "COMPLETED" },
    });
    await prisma.sale.create({
      data: {
        id: saleCardId, tenantId, branchId, saleNumber: "CASH-LOCK-SALE-2", cashSessionId: source.id,
        grandTotal: 5000, subtotal: 5000, deviceId: "DEVICE-A", operationId: randomUUID(), idempotencyKey: "cash-lock-sale-2",
      },
    });
    await prisma.payment.create({
      data: { id: randomUUID(), tenantId, branchId, paymentNumber: "CASH-LOCK-PAY-2", saleId: saleCardId, amount: 5000, paymentMethod: "CARD", provider: "CRDB", status: "COMPLETED" },
    });
    await prisma.cashSession.update({ where: { id: source.id }, data: { cashSalesTotal: 10000 } });

    const recon = await repository.getPaymentChannelReconciliation(cashierCtx, source.id);
    expect(recon.balanced).toBe(true);
    expect(recon.paymentDelta).toBe(0);
    expect(recon.cashDelta).toBe(0);
    expect(recon.channels.find((row: any) => row.channel === "CASH")?.net).toBe(10000);
    expect(recon.channels.find((row: any) => row.channel === "CARD")?.net).toBe(5000);

    const moveKey = "cash-lock-move-" + randomUUID();
    const movement = await repository.createCashMovement(cashierCtx, {
      id: randomUUID(), cashSessionId: source.id, type: "CASH_OUT", amount: 2000,
      reason: "Controlled cash-out", deviceId: "DEVICE-A", idempotencyKey: moveKey, occurredAt: new Date().toISOString(),
    });
    const replay = await repository.createCashMovement(cashierCtx, {
      id: randomUUID(), cashSessionId: source.id, type: "CASH_OUT", amount: 2000,
      reason: "Controlled cash-out", deviceId: "DEVICE-A", idempotencyKey: moveKey, occurredAt: new Date().toISOString(),
    });
    expect(replay.id).toBe(movement.id);

    await expect(
      repository.createCashMovement(cashierCtx, {
        id: randomUUID(), cashSessionId: source.id, type: "CASH_OUT", amount: 1000000,
        reason: "Too large", deviceId: "DEVICE-A", idempotencyKey: "cash-lock-too-large", occurredAt: new Date().toISOString(),
      }),
    ).rejects.toThrow("CASH_INSUFFICIENT_DRAWER_BALANCE");

    const transfer = await repository.transferCash(managerCtx, source.id, {
      destinationCashSessionId: destination.id, amount: 10000, reason: "Manager float rebalance",
      deviceId: "DEVICE-M", idempotencyKey: "cash-lock-transfer-1",
    });
    expect(transfer.sourceMovement.type).toBe("CASH_OUT");
    expect(transfer.destinationMovement.type).toBe("CASH_IN");

    await repository.sealCashSessionCount(cashierCtx, source.id, { actualCash: 97000, deviceId: "DEVICE-A" });
    await expect(repository.createCashMovement(cashierCtx, {
      id: randomUUID(), cashSessionId: source.id, type: "CASH_IN", amount: 100,
      reason: "After count", deviceId: "DEVICE-A", idempotencyKey: "cash-lock-after-seal", occurredAt: new Date().toISOString(),
    })).rejects.toThrow("CASH_COUNT_ALREADY_SEALED");

    await expect(repository.closeCashSession(cashierCtx, source.id, {})).rejects.toThrow("CASH_VARIANCE_MANAGER_APPROVAL_REQUIRED");
    await expect(repository.closeCashSession(managerCtx, source.id, {})).rejects.toThrow("CASH_VARIANCE_MANAGER_APPROVAL_REQUIRED");
    const closed = await repository.closeCashSession(managerCtx, source.id, {
      managerApprovalReference: "MANAGER-AUTH-CASH-LOCK-001",
      notes: "Approved test variance",
    });
    expect(closed.status).toBe("CLOSED");
    expect(Number(closed.variance)).toBe(-1000);

    await repository.sealCashSessionCount(cashier2Ctx, destination.id, { actualCash: 10000, deviceId: "DEVICE-B" });
    const destinationClosed = await repository.closeCashSession(cashier2Ctx, destination.id, {});
    expect(destinationClosed.status).toBe("CLOSED");
    expect(Number(destinationClosed.variance)).toBe(0);

    const journal = await prisma.journalEntry.findFirst({
      where: { tenantId, branchId, sourceType: "CASH_SESSION", sourceId: source.id, idempotencyKey: "jrn-var-" + source.id },
      include: { lines: true },
    });
    expect(journal).toBeTruthy();
    expect(Number(journal?.totalDebit)).toBe(1000);
    expect(Number(journal?.totalCredit)).toBe(1000);
    expect(journal?.lines).toHaveLength(2);

    const audit = await repository.getCashAuditTrail(managerCtx, source.id);
    const actions = audit.map((event: any) => event.action);
    expect(actions).toContain("CASH_SESSION_OPENED");
    expect(actions).toContain("CASH_COUNT_SEALED");
    expect(actions).toContain("CASH_MOVEMENT_CREATED");
    expect(actions).toContain("CASH_TRANSFER_COMPLETED");
    expect(actions).toContain("CASH_SESSION_CLOSED");
  });

  it("rejects an idempotency key crossing tenant boundaries", async () => {
    const otherTenant = randomUUID();
    const otherBranch = randomUUID();
    const otherUser = randomUUID();
    const otherRole = randomUUID();
    await prisma.tenant.create({ data: { id: otherTenant, name: "Other Cash Tenant", slug: "other-cash-" + otherTenant.slice(0, 8), status: "ACTIVE" } });
    await prisma.branch.create({ data: { id: otherBranch, tenantId: otherTenant, name: "Main", code: "MAIN", isMain: true } });
    await prisma.role.create({ data: { id: otherRole, tenantId: otherTenant, name: "CASHIER", permissions: ["cashdrawer.move"] } });
    await prisma.user.create({
      data: { id: otherUser, tenantId: otherTenant, branchId: otherBranch, email: "other-" + otherTenant.slice(0, 8) + "@example.invalid", passwordHash: await hashPassword("OtherCash!123"), name: "Other Cashier", roleId: otherRole, status: "ACTIVE" },
    });
    const otherCtx: TenantContext = { tenantId: otherTenant, branchId: otherBranch, userId: otherUser, roles: ["CASHIER"], permissions: ["cashdrawer.move"] };
    const otherSession = await repository.openCashSession(otherCtx, { openingCash: 50000, registerCode: "OTHER-REG", deviceId: "OTHER" });
    const seedSession = await repository.openCashSession(managerCtx, { openingCash: 1000, registerCode: "REG-X", deviceId: "DEVICE-M" });
    const key = "cash-lock-cross-tenant-key";
    await repository.createCashMovement(managerCtx, {
      id: randomUUID(), cashSessionId: seedSession.id, type: "CASH_IN", amount: 10,
      reason: "Cross tenant seed", deviceId: "DEVICE-M", idempotencyKey: key,
    });
    await expect(
      repository.createCashMovement(otherCtx, {
        id: randomUUID(), cashSessionId: otherSession.id, type: "CASH_IN", amount: 10,
        reason: "Cross tenant replay", deviceId: "OTHER", idempotencyKey: key,
      }),
    ).rejects.toThrow("CASH_MOVEMENT_IDEMPOTENCY_BOUNDARY_VIOLATION");
    await prisma.tenant.delete({ where: { id: otherTenant } }).catch(() => undefined);
  });
});
