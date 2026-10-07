import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma, PrismaCommercialRepository } from "@kwakopos2/database";
import { hashPassword } from "@kwakopos2/auth";
import type { TenantContext } from "@kwakopos2/contracts";

describe("Cash Management Production Lock v1 — authoritative lifecycle", () => {
  const tenantId = randomUUID();
  const branchId = randomUUID();
  const cashierId = randomUUID();
  const managerId = randomUUID();
  const cashierRoleId = randomUUID();
  const managerRoleId = randomUUID();
  const saleCashId = randomUUID();
  const saleCardId = randomUUID();
  const cashierCtx: TenantContext = {
    tenantId, branchId, userId: cashierId, roles: ["CASHIER"], permissions: ["cashdrawer.open", "cashdrawer.close", "cashdrawer.move"],
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
    await prisma.user.create({
      data: { id: cashierId, tenantId, branchId, email: "cashier-" + tenantId.slice(0, 8) + "@example.invalid", passwordHash: await hashPassword("CashLock!123"), name: "Cash Lock Cashier", roleId: cashierRoleId, status: "ACTIVE" },
    });
    await prisma.user.create({
      data: { id: managerId, tenantId, branchId, email: "manager-" + tenantId.slice(0, 8) + "@example.invalid", passwordHash: await hashPassword("CashLock!456"), name: "Cash Lock Manager", roleId: managerRoleId, status: "ACTIVE" },
    });
    repository = new PrismaCommercialRepository();
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
  });

  it("binds a till to a named register and prevents duplicate live register sessions", async () => {
    const opened = await repository.openCashSession(cashierCtx, { openingCash: 100000, registerCode: "REG-A", deviceId: "DEVICE-A" });
    sourceSessionId = opened.id;
    expect(opened.registerCode).toBe("REG-A");
    expect(opened.status).toBe("OPEN");

    await expect(
      repository.openCashSession(managerCtx, { openingCash: 50000, registerCode: "REG-A", deviceId: "DEVICE-M" }),
    ).rejects.toThrow("CASH_REGISTER_SESSION_ALREADY_OPEN");

    const destination = await repository.openCashSession(managerCtx, { openingCash: 0, registerCode: "REG-B", deviceId: "DEVICE-M" });
    destinationSessionId = destination.id;
  });

  it("reconciles payment channels from authoritative sale/payment records", async () => {
    await prisma.sale.create({
      data: {
        id: saleCashId, tenantId, branchId, saleNumber: "CASH-LOCK-SALE-1", cashSessionId: sourceSessionId,
        grandTotal: 10000, subtotal: 10000, deviceId: "DEVICE-A", operationId: randomUUID(), idempotencyKey: "cash-lock-sale-1",
      },
    });
    await prisma.payment.create({
      data: { id: randomUUID(), tenantId, branchId, paymentNumber: "CASH-LOCK-PAY-1", saleId: saleCashId, amount: 10000, paymentMethod: "CASH", provider: "CASH", status: "COMPLETED" },
    });
    await prisma.sale.create({
      data: {
        id: saleCardId, tenantId, branchId, saleNumber: "CASH-LOCK-SALE-2", cashSessionId: sourceSessionId,
        grandTotal: 5000, subtotal: 5000, deviceId: "DEVICE-A", operationId: randomUUID(), idempotencyKey: "cash-lock-sale-2",
      },
    });
    await prisma.payment.create({
      data: { id: randomUUID(), tenantId, branchId, paymentNumber: "CASH-LOCK-PAY-2", saleId: saleCardId, amount: 5000, paymentMethod: "CARD", provider: "CRDB", status: "COMPLETED" },
    });
    await prisma.cashSession.update({ where: { id: sourceSessionId }, data: { cashSalesTotal: 10000 } });

    const result = await repository.getPaymentChannelReconciliation(cashierCtx, sourceSessionId);
    expect(result.balanced).toBe(true);
    expect(result.paymentDelta).toBe(0);
    expect(result.cashDelta).toBe(0);
    expect(result.channels.find((row: any) => row.channel === "CASH")?.net).toBe(10000);
    expect(result.channels.find((row: any) => row.channel === "CARD")?.net).toBe(5000);
  });

  it("prevents over-withdrawal, double posting, and movement after the blind count is sealed", async () => {
    const moveKey = "cash-lock-move-" + randomUUID();
    const movement = await repository.createCashMovement(cashierCtx, {
      id: randomUUID(), cashSessionId: sourceSessionId, type: "CASH_OUT", amount: 2000,
      reason: "Controlled cash-out", deviceId: "DEVICE-A", idempotencyKey: moveKey, occurredAt: new Date().toISOString(),
    });
    expect(Number(movement.amount)).toBe(2000);

    const replay = await repository.createCashMovement(cashierCtx, {
      id: randomUUID(), cashSessionId: sourceSessionId, type: "CASH_OUT", amount: 2000,
      reason: "Controlled cash-out", deviceId: "DEVICE-A", idempotencyKey: moveKey, occurredAt: new Date().toISOString(),
    });
    expect(replay.id).toBe(movement.id);
    await expect(
      repository.createCashMovement(cashierCtx, {
        id: randomUUID(), cashSessionId: sourceSessionId, type: "CASH_OUT", amount: 1000000,
        reason: "Too large", deviceId: "DEVICE-A", idempotencyKey: "cash-lock-too-large", occurredAt: new Date().toISOString(),
      }),
    ).rejects.toThrow("CASH_INSUFFICIENT_DRAWER_BALANCE");

    await repository.sealCashSessionCount(cashierCtx, sourceSessionId, { actualCash: 108000, deviceId: "DEVICE-A" });
    await expect(
      repository.createCashMovement(cashierCtx, {
        id: randomUUID(), cashSessionId: sourceSessionId, type: "CASH_IN", amount: 100,
        reason: "After count", deviceId: "DEVICE-A", idempotencyKey: "cash-lock-after-seal", occurredAt: new Date().toISOString(),
      }),
    ).rejects.toThrow("CASH_COUNT_ALREADY_SEALED");
  });

  it("moves cash atomically between open tills and enforces manager approval on large variance", async () => {
    await expect(
      repository.transferCash(cashierCtx, sourceSessionId, {
        destinationCashSessionId: destinationSessionId, amount: 10000, reason: "Rebalance tills",
        deviceId: "DEVICE-A", idempotencyKey: "cash-lock-transfer-1",
      }),
    ).rejects.toThrow("CASH_COUNT_SEALED");

    // The source is sealed above, so perform the transfer with a fresh source session.
    await prisma.cashSession.update({ where: { id: destinationSessionId }, data: { openingCash: 10000, cashInTotal: 0 } });
    const source2 = await repository.openCashSession(managerCtx, { openingCash: 50000, registerCode: "REG-C", deviceId: "DEVICE-M" });
    const destination2 = await repository.openCashSession(managerCtx, { openingCash: 0, registerCode: "REG-D", deviceId: "DEVICE-M" });
    const transfer = await repository.transferCash(managerCtx, source2.id, {
      destinationCashSessionId: destination2.id, amount: 10000, reason: "Manager float rebalance",
      deviceId: "DEVICE-M", idempotencyKey: "cash-lock-transfer-2",
    });
    expect(transfer.sourceMovement.type).toBe("CASH_OUT");
    expect(transfer.destinationMovement.type).toBe("CASH_IN");

    await repository.sealCashSessionCount(managerCtx, source2.id, { actualCash: 39000, deviceId: "DEVICE-M" });
    await expect(repository.closeCashSession(managerCtx, source2.id, {})).rejects.toThrow("CASH_VARIANCE_MANAGER_APPROVAL_REQUIRED");
  });

  it("posts a balanced variance journal and preserves an auditable lifecycle", async () => {
    // Manager approval is explicit and attributable; use the source session from the first scenario.
    const closed = await repository.closeCashSession(managerCtx, sourceSessionId, {
      managerApprovalReference: "MANAGER-AUTH-CASH-LOCK-001",
      notes: "Approved test variance",
    });
    expect(closed.status).toBe("CLOSED");
    expect(Number(closed.variance)).toBe(-1000);

    const journal = await prisma.journalEntry.findFirst({
      where: { tenantId, branchId, sourceType: "CASH_SESSION", sourceId: sourceSessionId, idempotencyKey: "jrn-var-" + sourceSessionId },
      include: { lines: true },
    });
    expect(journal).toBeTruthy();
    expect(Number(journal?.totalDebit)).toBe(1000);
    expect(Number(journal?.totalCredit)).toBe(1000);
    expect(journal?.lines).toHaveLength(2);

    const audit = await repository.getCashAuditTrail(managerCtx, sourceSessionId);
    const actions = audit.map((event: any) => event.action);
    expect(actions).toContain("CASH_SESSION_OPENED");
    expect(actions).toContain("CASH_COUNT_SEALED");
    expect(actions).toContain("CASH_MOVEMENT_CREATED");
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
    const key = "cross-tenant-" + randomUUID();
    await repository.createCashMovement(cashierCtx, {
      id: randomUUID(), cashSessionId: sourceSessionId, type: "CASH_IN", amount: 10,
      reason: "Cross tenant seed", deviceId: "DEVICE-A", idempotencyKey: key,
    }).catch(() => undefined);
    await expect(
      repository.createCashMovement(otherCtx, {
        id: randomUUID(), cashSessionId: otherSession.id, type: "CASH_IN", amount: 10,
        reason: "Cross tenant replay", deviceId: "OTHER", idempotencyKey: key,
      }),
    ).rejects.toThrow(/CASH_MOVEMENT_IDEMPOTENCY_BOUNDARY_VIOLATION|CASH_MOVEMENT_IDEMPOTENCY_CONFLICT/);
    await prisma.tenant.delete({ where: { id: otherTenant } }).catch(() => undefined);
  });
});
