import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { buildServer } from "../../apps/api/src/server.js";
import { hashPassword } from "@kwakopos2/auth";
import { prisma } from "@kwakopos2/database";
import { globalLegalGovernanceService } from "../../apps/api/src/services/legalGovernanceService.js";

describe("Expenses — authoritative API, PostgreSQL sync and bootstrap", () => {
  const tenantId = randomUUID();
  const branchId = randomUUID();
  const userId = randomUUID();
  const roleId = randomUUID();
  const pendingExpenseId = randomUUID();
  const syncedExpenseId = randomUUID();
  let app: any;

  const headers = {
    "x-tenant-id": tenantId,
    "x-branch-id": branchId,
    "x-user-id": userId,
    "x-device-id": "EXPENSE-API-TEST",
  };

  beforeAll(async () => {
    await prisma.tenant.create({
      data: { id: tenantId, name: "Expense API Test", slug: "expense-api-" + tenantId.slice(0, 8), status: "ACTIVE" },
    });
    await prisma.branch.create({
      data: { id: branchId, tenantId, name: "Main", code: "MAIN", isMain: true },
    });
    await prisma.role.create({
      data: { id: roleId, tenantId, name: "FINANCE_API_TEST", permissions: ["FINANCE_VIEW", "FINANCE_CREATE", "JOURNAL_REVERSE"] },
    });
    await prisma.user.create({
      data: {
        id: userId,
        tenantId,
        branchId,
        email: "expense-api@" + tenantId.slice(0, 8) + ".test",
        passwordHash: await hashPassword("ExpenseApiTest!123"),
        name: "Expense API Tester",
        roleId,
        status: "ACTIVE",
      },
    });

    const legal = globalLegalGovernanceService.checkUserAcceptanceStatus(userId, tenantId);
    for (const document of legal.requiredDocuments) {
      globalLegalGovernanceService.recordAcceptance(userId, tenantId, {
        documentId: document.documentId,
        documentVersion: document.requiredVersion,
        language: "en",
        acceptanceMethod: "CLICK_WRAP",
        sessionDeviceRef: "expense-api-test",
      });
    }

    app = buildServer({ productionPersistence: true });
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
  });

  it("serves authoritative Expenses from PostgreSQL", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/expenses",
      headers,
      payload: {
        id: pendingExpenseId,
        category: "SUPPLIES",
        amount: 12000,
        reason: "Printer paper",
        description: "Printer paper",
        payee: "Stationery Vendor",
        paymentMethod: "BANK",
        paymentRef: "BANK-12000",
        status: "PENDING",
        taxDeductible: true,
        incurredAt: "2026-10-03T10:00:00.000Z",
        idempotencyKey: "api-expense-" + pendingExpenseId,
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().data.status).toBe("PENDING");
    expect(Number(created.json().data.amount)).toBe(12000);

    const list = await app.inject({ method: "GET", url: "/api/v1/expenses", headers });
    expect(list.statusCode).toBe(200);
    expect(list.json().data.some((e: any) => e.id === pendingExpenseId)).toBe(true);
  });

  it("processes an Expense CREATE through the production sync engine and posts Bank GL", async () => {
    const pushed = await app.inject({
      method: "POST",
      url: "/sync/push",
      headers,
      payload: {
        deviceId: "EXPENSE-SYNC-TEST",
        operations: [{
          operationId: "expense-sync-op-" + syncedExpenseId,
          idempotencyKey: "expense-sync-key-" + syncedExpenseId,
          entityType: "Expense",
          entityId: syncedExpenseId,
          operationType: "CREATE",
          clientCreatedAt: "2026-10-03T10:05:00.000Z",
          payload: {
            id: syncedExpenseId,
            category: "UTILITIES",
            amount: 33000,
            reason: "Internet service",
            description: "Internet service",
            payee: "ISP",
            paymentMethod: "BANK",
            paymentRef: "BANK-33000",
            status: "PAID",
            taxDeductible: false,
            incurredAt: "2026-10-03T10:05:00.000Z",
            idempotencyKey: "expense-sync-key-" + syncedExpenseId,
          },
        }],
      },
    });
    expect(pushed.statusCode).toBe(200);
    expect(pushed.json().data.results[0].status).toBe("SUCCESS");

    const expense = await prisma.expense.findUnique({ where: { id: syncedExpenseId } });
    expect(expense?.tenantId).toBe(tenantId);
    expect(expense?.branchId).toBe(branchId);
    expect(expense?.status).toBe("PAID");
    expect(expense?.paymentMethod).toBe("BANK");

    const journal = await prisma.journalEntry.findFirst({
      where: { tenantId, branchId, sourceType: "EXPENSE", sourceId: syncedExpenseId, isReversal: false },
      include: { lines: true },
    });
    expect(journal).toBeTruthy();
    expect(Number(journal?.totalDebit)).toBe(33000);
    expect(Number(journal?.totalCredit)).toBe(33000);

    const bankLine = journal?.lines.find((line: any) => line.accountId);
    expect(bankLine).toBeTruthy();
  });

  it("includes Expenses in authoritative bootstrap and revisioned delta", async () => {
    const bootstrap = await app.inject({
      method: "POST",
      url: "/sync/bootstrap",
      headers,
      payload: { deviceId: "EXPENSE-BOOTSTRAP-TEST", schemaVersion: 4 },
    });
    expect(bootstrap.statusCode).toBe(200);
    const bootstrapExpenses = bootstrap.json().data.expenses || [];
    expect(bootstrapExpenses.some((e: any) => e.id === pendingExpenseId)).toBe(true);
    expect(bootstrapExpenses.some((e: any) => e.id === syncedExpenseId)).toBe(true);

    const delta = await app.inject({
      method: "GET",
      url: "/sync/delta?since=rev:0",
      headers,
    });
    expect(delta.statusCode).toBe(200);
    const changes = delta.json().data.changes || [];
    expect(changes.some((change: any) => change.entityType === "Expense" && change.entityId === syncedExpenseId)).toBe(true);
  });
});
