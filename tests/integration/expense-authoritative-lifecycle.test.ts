import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma, PrismaAtomicCommercialFinanceService } from "@kwakopos2/database";
import { hashPassword } from "@kwakopos2/auth";
import type { TenantContext } from "@kwakopos2/contracts";

describe("Expenses — authoritative PostgreSQL lifecycle", () => {
  const tenantId = randomUUID();
  const branchId = randomUUID();
  const userId = randomUUID();
  const roleId = randomUUID();
  const cashSessionId = randomUUID();
  const expenseId = randomUUID();
  const ctx: TenantContext = {
    tenantId,
    branchId,
    userId,
    roles: ["FINANCE_MANAGER"],
    permissions: ["FINANCE_VIEW", "FINANCE_CREATE", "FINANCE_APPROVE", "JOURNAL_REVERSE"],
  };

  let finance: PrismaAtomicCommercialFinanceService;

  beforeAll(async () => {
    await prisma.tenant.create({
      data: { id: tenantId, name: "Expense Authority Test", slug: "expense-authority-" + tenantId.slice(0, 8), status: "ACTIVE" },
    });
    await prisma.branch.create({
      data: { id: branchId, tenantId, name: "Main", code: "MAIN", isMain: true },
    });
    await prisma.role.create({
      data: { id: roleId, tenantId, name: "FINANCE_MANAGER", permissions: ["FINANCE_VIEW", "FINANCE_CREATE", "JOURNAL_REVERSE"] },
    });
    await prisma.user.create({
      data: {
        id: userId,
        tenantId,
        branchId,
        email: "expense-authority@" + tenantId.slice(0, 8) + ".test",
        passwordHash: await hashPassword("ExpenseAuthority!123"),
        name: "Expense Authority",
        roleId,
        status: "ACTIVE",
      },
    });
    await prisma.cashSession.create({
      data: {
        id: cashSessionId,
        tenantId,
        branchId,
        sessionNumber: "CS-EXP-" + tenantId.slice(0, 8),
        cashierId: userId,
        openingCash: 100000,
        expectedCash: 100000,
        status: "OPEN",
      },
    });
    finance = new PrismaAtomicCommercialFinanceService(prisma);
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
  });

  it("records pending expense without posting cash or GL, then settles exactly once", async () => {
    const pending = await finance.recordExpense(ctx, {
      id: expenseId,
      category: "UTILITIES",
      amount: 25000,
      reason: "Electricity",
      description: "Electricity",
      payee: "Utility Company",
      paymentMethod: "CASH",
      status: "PENDING",
      taxDeductible: true,
      idempotencyKey: "expense-create-" + expenseId,
      operationId: "expense-op-" + expenseId,
      deviceId: "EXPENSE-TEST",
    });

    expect(pending.status).toBe("PENDING");
    expect(pending.cashSessionId).toBeNull();
    expect(await prisma.journalEntry.count({ where: { tenantId, branchId, sourceType: "EXPENSE", sourceId: expenseId, isReversal: false } })).toBe(0);
    const approved = await finance.approveExpense(ctx, expenseId, "Approved for settlement");
    expect(approved.approvalStatus).toBe("APPROVED");

    const paid = await finance.payExpense(ctx, expenseId, {
      paymentMethod: "CASH",
      cashSessionId,
      paymentRef: "CASH-25000",
      idempotencyKey: "expense-pay-" + expenseId,
      deviceId: "EXPENSE-TEST",
    });

    expect(paid.status).toBe("PAID");
    expect(paid.cashSessionId).toBe(cashSessionId);
    const session = await prisma.cashSession.findUnique({ where: { id: cashSessionId } });
    expect(Number(session?.cashExpensesTotal || 0)).toBe(25000);

    const journals = await prisma.journalEntry.findMany({
      where: { tenantId, branchId, sourceType: "EXPENSE", sourceId: expenseId },
      include: { lines: true },
    });
    expect(journals).toHaveLength(1);
    expect(Number(journals[0].totalDebit)).toBe(25000);
    expect(Number(journals[0].totalCredit)).toBe(25000);
    expect(journals[0].lines).toHaveLength(2);

    const replay = await finance.payExpense(ctx, expenseId, {
      paymentMethod: "CASH",
      cashSessionId,
      paymentRef: "CASH-25000",
      idempotencyKey: "expense-pay-replay-" + expenseId,
      deviceId: "EXPENSE-TEST",
    });
    expect(replay.status).toBe("PAID");
    const sessionAfterReplay = await prisma.cashSession.findUnique({ where: { id: cashSessionId } });
    expect(Number(sessionAfterReplay?.cashExpensesTotal || 0)).toBe(25000);
    expect(await prisma.journalEntry.count({ where: { tenantId, branchId, sourceType: "EXPENSE", sourceId: expenseId, isReversal: false } })).toBe(1);
  });

  it("voids a paid expense by reversal without deleting the original journal", async () => {
    const voided = await finance.voidExpense(ctx, expenseId, "Correction", {
      idempotencyKey: "expense-void-" + expenseId,
      deviceId: "EXPENSE-TEST",
    });

    expect(voided.status).toBe("VOIDED");
    const original = await prisma.journalEntry.findFirst({
      where: { tenantId, branchId, sourceType: "EXPENSE", sourceId: expenseId, isReversal: false },
    });
    const reversal = await prisma.journalEntry.findFirst({
      where: { tenantId, branchId, sourceType: "REVERSAL", sourceId: expenseId, isReversal: true },
    });
    expect(original?.status).toBe("REVERSED");
    expect(reversal).toBeTruthy();
    expect(Number(reversal?.totalDebit)).toBe(25000);
    expect(Number(reversal?.totalCredit)).toBe(25000);

    const session = await prisma.cashSession.findUnique({ where: { id: cashSessionId } });
    expect(Number(session?.cashExpensesTotal || 0)).toBe(0);
  });

  it("rejects cross-tenant Expense access", async () => {
    const otherTenant = randomUUID();
    const otherBranch = randomUUID();
    const otherUser = randomUUID();
    const otherRole = randomUUID();
    await prisma.tenant.create({
      data: { id: otherTenant, name: "Other Expense Tenant", slug: "other-expense-" + otherTenant.slice(0, 8), status: "ACTIVE" },
    });
    await prisma.branch.create({ data: { id: otherBranch, tenantId: otherTenant, name: "Main", code: "MAIN", isMain: true } });
    await prisma.role.create({ data: { id: otherRole, tenantId: otherTenant, name: "FINANCE", permissions: ["FINANCE_CREATE"] } });
    await prisma.user.create({
      data: {
        id: otherUser,
        tenantId: otherTenant,
        branchId: otherBranch,
        email: "other@" + otherTenant.slice(0, 8) + ".test",
        passwordHash: await hashPassword("OtherExpense!123"),
        name: "Other Finance",
        roleId: otherRole,
        status: "ACTIVE",
      },
    });

    await expect(
      finance.payExpense({ ...ctx, tenantId: otherTenant, branchId: otherBranch, userId: otherUser }, expenseId, {
        paymentMethod: "BANK",
        idempotencyKey: "cross-tenant-" + expenseId,
      }),
    ).rejects.toThrow("EXPENSE_NOT_FOUND");

    await prisma.tenant.delete({ where: { id: otherTenant } });
  });
});
