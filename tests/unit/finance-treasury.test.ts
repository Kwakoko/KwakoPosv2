import { describe, it, expect } from "vitest";
import { FinanceTreasuryEngine } from "@kwakopos2/domain";

describe("Phase 35 — Finance & Treasury Engine (KFTL v1.0.0)", () => {
  it("should register bank accounts, import statement, and run bank reconciliation with 3-pass matching", () => {
    const engine = new FinanceTreasuryEngine();

    const acc = engine.registerBankAccount({
      accountId: "ACC-UNIT-01", tenantId: "TEN-FIN-01", bank: "CRDB Bank",
      accountNumber: "9876543210", accountName: "Operating A/C",
      accountType: "OPERATING", currency: "TZS", status: "ACTIVE",
      purpose: "Daily ops", currentBalance: 15000000, availableBalance: 15000000,
      isDefault: true,
    });
    expect(acc.success).toBe(true);

    const stmt = engine.importBankStatement({
      statementId: "STMT-UNIT-01", accountId: "ACC-UNIT-01", tenantId: "TEN-FIN-01",
      bankName: "CRDB Bank", statementPeriodFrom: "2026-08-01", statementPeriodTo: "2026-08-31",
      openingBalance: 10000000, closingBalance: 15000000, totalCredits: 6000000, totalDebits: 1000000,
      currency: "TZS", source: "API", importedBy: "USR-FIN",
      lines: [
        {
          lineId: "LINE-EXACT", statementId: "STMT-UNIT-01", accountId: "ACC-UNIT-01",
          transactionDate: "2026-08-10", valueDate: "2026-08-10",
          description: "Payment REF-PAY-001", reference: "REF-PAY-001",
          creditAmount: 5000000, debitAmount: 0, runningBalance: 15000000,
          currency: "TZS", reconciliationStatus: "UNMATCHED", importedAt: "",
        },
        {
          lineId: "LINE-UNKNOWN", statementId: "STMT-UNIT-01", accountId: "ACC-UNIT-01",
          transactionDate: "2026-08-20", valueDate: "2026-08-20",
          description: "Unknown fee", creditAmount: 0, debitAmount: 1000000,
          runningBalance: 14000000, currency: "TZS", reconciliationStatus: "UNMATCHED", importedAt: "",
        },
      ],
    });
    expect(stmt.success).toBe(true);
    expect(stmt.linesImported).toBe(2);

    const recon = engine.runReconciliation({
      runId: "RECON-RUN-01", accountId: "ACC-UNIT-01", tenantId: "TEN-FIN-01",
      statementId: "STMT-UNIT-01", initiatedBy: "USR-FIN",
      ledgerEntries: [{ ref: "REF-PAY-001", amount: 5000000, date: "2026-08-10", description: "Customer receipt" }],
    });
    expect(recon.success).toBe(true);
    expect(recon.run?.matchedLines).toBe(1);
    expect(recon.run?.exceptionLines).toBe(1);
    expect(recon.run?.status).toBe("REVIEW_REQUIRED");
  });

  it("should calculate cash position and generate 5-scenario liquidity forecasts", () => {
    const engine = new FinanceTreasuryEngine();

    engine.registerBankAccount({
      accountId: "ACC-POS-01", tenantId: "TEN-POS-01", bank: "NMB",
      accountNumber: "1111", accountName: "Main", accountType: "OPERATING",
      currency: "TZS", status: "ACTIVE", purpose: "Ops",
      currentBalance: 8000000, availableBalance: 8000000, isDefault: true,
    });

    const pos = engine.calculateCashPosition({
      tenantId: "TEN-POS-01", currency: "TZS",
      pendingReceipts: 3000000, pendingDisbursements: 1500000,
      outstandingObligations: 1000000, minimumLiquidityBuffer: 500000,
    });

    expect(pos.availableLiquidity).toBe(9500000); // 8M + 3M - 1.5M
    expect(pos.projectedClosingCash).toBe(8500000); // 9.5M - 1M
    expect(pos.liquidityStatus).toBe("HEALTHY");

    const scenarios = ["BASE", "CONSERVATIVE", "STRESS", "SHOCK", "EXPANSION"] as const;
    scenarios.forEach(sc => {
      const fcst = engine.generateLiquidityForecast({
        tenantId: "TEN-POS-01", scenario: sc, horizonDays: 14, currency: "TZS",
        openingBalance: 8000000, dailyInflows: 500000, dailyOutflows: 300000,
      });
      expect(fcst.lines.length).toBe(14);
      expect(fcst.scenario).toBe(sc);
    });
  });

  it("should enforce full payment run lifecycle with beneficiary verification, policy guardrails, and idempotency", () => {
    const engine = new FinanceTreasuryEngine();

    // Register verified beneficiary
    engine.registerBeneficiary({
      beneficiaryId: "BEN-VERIFIED-01", tenantId: "TEN-PAY-01", name: "Supplier Co",
      type: "SUPPLIER", bank: "CRDB", accountNumber: "998877",
      accountName: "Supplier Co", currency: "TZS", verificationStatus: "VERIFIED",
      isActive: true,
    });

    // Create payment run
    const create = engine.createPaymentRun({
      tenantId: "TEN-PAY-01", currency: "TZS",
      items: [{
        beneficiaryId: "BEN-VERIFIED-01", payableRef: "INV-101",
        amount: 2000000, currency: "TZS", dueDate: "2026-09-01", priority: "HIGH",
      }],
      initiatedBy: "USR-INITIATOR", idempotencyKey: "IDEM-PRN-001",
    });
    expect(create.success).toBe(true);
    const runId = create.run!.runId;

    // Idempotent duplicate create fails
    const dupCreate = engine.createPaymentRun({
      tenantId: "TEN-PAY-01", currency: "TZS",
      items: [{ beneficiaryId: "BEN-VERIFIED-01", payableRef: "INV-101", amount: 2000000, currency: "TZS", dueDate: "2026-09-01", priority: "HIGH" }],
      initiatedBy: "USR-INITIATOR", idempotencyKey: "IDEM-PRN-001",
    });
    expect(dupCreate.success).toBe(false);

    // Cannot execute DRAFT run directly
    const execDraft = engine.executePaymentRun(runId, "USR-EXEC");
    expect(execDraft.success).toBe(false);
    expect(execDraft.error).toMatch(/BLOCKED BY POLICY/i);

    // Liquidity check
    create.run!.status = "VALIDATING";
    const liq = engine.performLiquidityCheck(runId, 10000000);
    expect(liq.passed).toBe(true);

    // Approval gate
    const appr = engine.approvePaymentRun(runId, "APR-PHASE34-REF", "USR-APPROVER");
    expect(appr.success).toBe(true);

    // Execution
    const exec = engine.executePaymentRun(runId, "USR-EXECUTOR");
    expect(exec.success).toBe(true);
    expect(exec.executionRef).toBeDefined();

    // Idempotent duplicate execute fails
    const dupExec = engine.executePaymentRun(runId, "USR-EXECUTOR");
    expect(dupExec.success).toBe(false);
    expect(dupExec.error).toMatch(/Idempotency/i);
  });

  it("should record beneficiary changes, place in cooldown, and audit all events", () => {
    const engine = new FinanceTreasuryEngine();

    engine.registerBeneficiary({
      beneficiaryId: "BEN-CHG-TEST", tenantId: "TEN-CHG-01", name: "Alpha Tech",
      type: "SUPPLIER", bank: "NMB", accountNumber: "112233",
      accountName: "Alpha Tech", currency: "TZS", verificationStatus: "VERIFIED",
      isActive: true,
    });

    const chg = engine.requestBeneficiaryChange({
      beneficiaryId: "BEN-CHG-TEST", changedBy: "USR-ADMIN",
      field: "accountNumber", newValue: "998877", approvalRef: "APR-CHG-001",
    });

    expect(chg.success).toBe(true);
    expect(chg.cooldownUntil).toBeDefined();

    const audit = engine.getAuditTrail("TEN-CHG-01");
    expect(audit.some(a => a.eventType === "BENEFICIARY_CHANGED")).toBe(true);

    const health = engine.getHealthSummary("TEN-CHG-01");
    expect(health.treasuryEngineOperational).toBe(true);
  });
});
