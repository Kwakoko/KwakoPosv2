import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FinancialBridge, PaymentEngine } from "@kwakopos2/domain";

const root = path.resolve(__dirname, "../..");

describe("Payments Production Lock", () => {
  it("fails closed for provider-controlled payments without an external reference", () => {
    for (const paymentMethod of ["MOBILE_MONEY", "CARD", "BANK"] as const) {
      const result = PaymentEngine.processPayment({
        tenantId: "00000000-0000-0000-0000-000000000001",
        branchId: "00000000-0000-0000-0000-000000000002",
        amount: 100,
        paymentMethod,
        provider: paymentMethod === "MOBILE_MONEY" ? "MPESA" : undefined,
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe(`${paymentMethod}_PROVIDER_REFERENCE_REQUIRED`);
    }
  });

  it("accepts provider references verbatim instead of fabricating confirmation IDs", () => {
    const result = PaymentEngine.processPayment({
      tenantId: "00000000-0000-0000-0000-000000000001",
      branchId: "00000000-0000-0000-0000-000000000002",
      amount: 100,
      paymentMethod: "MOBILE_MONEY",
      provider: "MPESA",
      providerReference: "MPESA-REAL-001",
    });
    expect(result.success).toBe(true);
    expect(result.reference).toBe("MPESA-REAL-001");
    expect(result.providerStatus).toBe("PROVIDER_REFERENCE_ACCEPTED");
  });

  it("posts split tenders to their own cash/bank/receivable control accounts", () => {
    const sale: any = {
      id: "00000000-0000-0000-0000-000000000010",
      saleNumber: "SAL-TEST-001",
      grandTotal: 1000,
      taxTotal: 0,
      totalCost: 0,
    };
    const accounts: any = {
      cashAccountId: "cash",
      bankAccountId: "bank",
      receivableAccountId: "ar",
      salesRevenueAccountId: "sales",
      taxPayableAccountId: "tax",
      cogsAccountId: "cogs",
      inventoryAccountId: "inventory",
    };
    const result = FinancialBridge.mapSaleToJournal({ tenantId: "t", branchId: "b", userId: "u", roles: [], permissions: [] } as any, sale, accounts, [
      { amount: 300, paymentMethod: "CASH" },
      { amount: 400, paymentMethod: "CARD", providerReference: "CARD-1" },
      { amount: 300, paymentMethod: "CREDIT" },
    ] as any, 1);

    expect(result.lines.filter((line: any) => line.debit > 0).map((line: any) => line.accountId)).toEqual(["cash", "bank", "ar"]);
    expect(result.lines.filter((line: any) => line.debit > 0).reduce((sum: number, line: any) => sum + Number(line.debit), 0)).toBe(1000);
    expect(result.journal.totalDebit).toBe(1000);
    expect(result.journal.totalCredit).toBe(1000);
  });

  it("contains the authoritative production blockers fixes in source", () => {
    const atomic = readFileSync(path.join(root, "packages/database/src/atomicCommercialFinance.ts"), "utf8");
    const production = readFileSync(path.join(root, "packages/database/src/prismaProductionRepositories.ts"), "utf8");
    const financialBridge = readFileSync(path.join(root, "packages/domain/src/financialBridge.ts"), "utf8");
    const sync = readFileSync(path.join(root, "packages/sync/src/worldStandardPrismaSyncEngine.ts"), "utf8");
    const lock = readFileSync(path.join(root, "packages/sync/src/paymentsProductionLock.ts"), "utf8");
    const server = readFileSync(path.join(root, "apps/api/src/server.ts"), "utf8");

    expect(atomic).toContain("PAYMENT_OVERPAYMENT");
    expect(atomic).toContain("reversePaymentInTransaction");
    expect(atomic).toContain("refundPaymentInTransaction");
    expect(financialBridge).toContain("Array.isArray(paymentMethodOrPayments)");
    expect(production).toContain('action: "PAYMENT_REFUND_RECORDED"');
    expect(production).toContain("mapReturnToJournal");
    expect(sync).toContain("applyPaymentsProductionLockOperation");
    expect(lock).toContain('action === "REVERSE"');
    expect(lock).toContain('action === "REFUND"');
    expect(lock).toContain('action === "PROVIDER_CONFIRM"');
    expect(server).toContain("/api/v1/payments/reconcile");
    expect(server).toContain("/api/v1/payments/reports/channels");
    expect(server).toContain("/api/v1/payments/webhooks/:provider");
    expect(server).toContain("PAYMENT_WEBHOOK_SIGNATURE_INVALID");
  });
});
