import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../../apps/api/src/server.js";
import type { FastifyInstance } from "fastify";

describe("KwakoPos Finance REST API Integration Tests (/api/v1/finance/*)", () => {
  let server: FastifyInstance;
  const tenantHeaders = {
    "x-tenant-id": "11111111-1111-1111-1111-111111111111",
    "x-branch-id": "22222222-2222-2222-2222-222222222222",
    "x-user-id": "33333333-3333-3333-3333-333333333333",
  };

  beforeAll(async () => {
    server = buildServer({ productionPersistence: false });
    await server.ready();
  });

  afterAll(async () => {
    if (server) await server.close();
  });

  it("retrieves Chart of Accounts and creates custom account", async () => {
    const listRes = await server.inject({
      method: "GET",
      url: "/api/v1/finance/accounts",
      headers: tenantHeaders,
    });
    expect(listRes.statusCode).toBe(200);
    const json = listRes.json();
    expect(json.success).toBe(true);
    expect(json.data.length).toBeGreaterThanOrEqual(18);

    const createRes = await server.inject({
      method: "POST",
      url: "/api/v1/finance/accounts",
      headers: tenantHeaders,
      payload: {
        accountCode: "6500",
        name: "Marketing & Advertising",
        accountClass: "EXPENSE",
        accountGroup: "OPERATING_EXPENSE",
      },
    });
    expect(createRes.statusCode).toBe(201);
    expect(createRes.json().data.accountCode).toBe("6500");
  });

  it("creates and reverses a double-entry journal entry", async () => {
    const accList = (
      await server.inject({
        method: "GET",
        url: "/api/v1/finance/accounts",
        headers: tenantHeaders,
      })
    ).json().data;

    const accCash = accList.find((a: any) => a.accountCode === "1110")!;
    const accEquity = accList.find((a: any) => a.accountCode === "3100")!;

    const postRes = await server.inject({
      method: "POST",
      url: "/api/v1/finance/journals",
      headers: tenantHeaders,
      payload: {
        sourceType: "MANUAL",
        description: "Owner Injection",
        lines: [
          { accountId: accCash.id, debit: 2000000, credit: 0 },
          { accountId: accEquity.id, debit: 0, credit: 2000000 },
        ],
      },
    });
    expect(postRes.statusCode).toBe(201);
    const journalId = postRes.json().data.journal.id;

    // Reverse Journal
    const revRes = await server.inject({
      method: "POST",
      url: `/api/v1/finance/journals/${journalId}/reverse`,
      headers: tenantHeaders,
      payload: {
        reason: "Wrong account credited",
      },
    });
    expect(revRes.statusCode).toBe(201);
    expect(revRes.json().data.reversalJournal.isReversal).toBe(true);
  });

  it("creates customer invoice and retrieves AR aging report", async () => {
    // 1. Create Customer
    const custRes = await server.inject({
      method: "POST",
      url: "/api/v1/customers",
      headers: tenantHeaders,
      payload: { name: "Dar Bulk Buyers", creditLimit: 2000000 },
    });
    const customerId = custRes.json().data.id;

    // 2. Create Customer Invoice
    const invRes = await server.inject({
      method: "POST",
      url: "/api/v1/finance/receivables/invoices",
      headers: tenantHeaders,
      payload: {
        customerId,
        dueDate: "2026-09-15T00:00:00.000Z",
        items: [{ description: "Bulk Rice 50kg", quantity: 10, unitPrice: 85000 }],
      },
    });
    expect(invRes.statusCode).toBe(201);
    expect(invRes.json().data.grandTotal).toBe(850000);

    // 3. Query AR Aging
    const agingRes = await server.inject({
      method: "GET",
      url: "/api/v1/finance/receivables/aging",
      headers: tenantHeaders,
    });
    expect(agingRes.statusCode).toBe(200);
    expect(agingRes.json().data.totalOutstanding).toBeGreaterThanOrEqual(850000);
  });

  it("generates Financial Reports (Trial Balance, P&L, Balance Sheet, Dashboard)", async () => {
    const tbRes = await server.inject({ method: "GET", url: "/api/v1/finance/reports/trial-balance", headers: tenantHeaders });
    expect(tbRes.statusCode).toBe(200);
    expect(tbRes.json().data.isBalanced).toBe(true);

    const pnlRes = await server.inject({ method: "GET", url: "/api/v1/finance/reports/profit-loss", headers: tenantHeaders });
    expect(pnlRes.statusCode).toBe(200);
    expect(pnlRes.json().data.revenue).toBeDefined();

    const bsRes = await server.inject({ method: "GET", url: "/api/v1/finance/reports/balance-sheet", headers: tenantHeaders });
    expect(bsRes.statusCode).toBe(200);
    expect(bsRes.json().data.assets).toBeDefined();

    const dashRes = await server.inject({ method: "GET", url: "/api/v1/finance/dashboard/executive", headers: tenantHeaders });
    expect(dashRes.statusCode).toBe(200);
    expect(dashRes.json().data.branchProfitability).toBeDefined();
  });

  it("manages Bank Accounts, Budgets, and Financial Anomalies", async () => {
    // 1. Create Bank Account
    const bankRes = await server.inject({
      method: "POST",
      url: "/api/v1/finance/banks",
      headers: tenantHeaders,
      payload: {
        accountName: "CRDB Main Operating",
        bankName: "CRDB Bank",
        accountNumber: "0150123456700",
        currency: "TZS",
        openingBalance: 10000000,
      },
    });
    expect(bankRes.statusCode).toBe(201);
    const bankId = bankRes.json().data.id;

    // 2. Record Bank Transaction
    const txRes = await server.inject({
      method: "POST",
      url: `/api/v1/finance/banks/${bankId}/transactions`,
      headers: tenantHeaders,
      payload: {
        transactionType: "DEPOSIT",
        amount: 2500000,
        reference: "DEP-2026-001",
        description: "Customer Direct Deposit",
      },
    });
    expect(txRes.statusCode).toBe(201);
    expect(txRes.json().data.amount).toBe(2500000);

    // 3. Create Budget & Query Variance
    const accList = (
      await server.inject({
        method: "GET",
        url: "/api/v1/finance/accounts",
        headers: tenantHeaders,
      })
    ).json().data;
    const targetAcc = accList[0];

    const budgetRes = await server.inject({
      method: "POST",
      url: "/api/v1/finance/budgets",
      headers: tenantHeaders,
      payload: {
        name: "FY 2026 Operating Budget",
        fiscalYear: "2026",
        period: "ANNUAL",
        lines: [
          { accountId: targetAcc.id, budgetedAmount: 15000000 },
        ],
      },
    });
    expect(budgetRes.statusCode).toBe(201);


    const budgetId = budgetRes.json().data.id;

    const varRes = await server.inject({
      method: "GET",
      url: `/api/v1/finance/budgets/${budgetId}/vs-actual`,
      headers: tenantHeaders,
    });
    expect(varRes.statusCode).toBe(200);

    // 4. Query Anomalies
    const anomRes = await server.inject({
      method: "GET",
      url: "/api/v1/finance/anomalies",
      headers: tenantHeaders,
    });
    expect(anomRes.statusCode).toBe(200);
  });
});

