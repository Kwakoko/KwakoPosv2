import {
  TreasuryBankAccount, BankStatement, ReconciliationRun, ReconciliationMatch,
  CashPosition, LiquidityForecast, ForecastLine, PaymentRun, PaymentRunItem,
  Beneficiary, TreasuryPolicy, SettlementRecord, TreasuryException, WorkingCapitalMetrics,
  TreasuryAuditEntry, TreasuryHealthSummary, LiquidityStatus, TreasuryRiskLevel,
} from "@kwakopos2/contracts";

// ============================================================
// Phase 35 — Finance & Treasury Engine (KFTL v1.0.0)
// ============================================================
// Governing principle:
//   Finance records the truth; Treasury manages the movement and
//   availability of money; Analytics explains it; AI recommends;
//   Approval governs; execution is controlled; reconciliation proves the result.
// ============================================================

export class FinanceTreasuryEngine {
  private bankAccounts: Map<string, TreasuryBankAccount> = new Map();
  private statements: Map<string, BankStatement> = new Map();
  private reconciliationRuns: Map<string, ReconciliationRun> = new Map();
  private paymentRuns: Map<string, PaymentRun> = new Map();
  private beneficiaries: Map<string, Beneficiary> = new Map();
  private policies: Map<string, TreasuryPolicy> = new Map();
  private settlements: Map<string, SettlementRecord> = new Map();
  private exceptions: Map<string, TreasuryException> = new Map();
  private auditLedger: TreasuryAuditEntry[] = [];
  private executedPaymentRunIds: Set<string> = new Set(); // idempotency

  constructor() {
    this._seedDefaultPolicies();
  }

  // ─────────────────────────────────────────────────────────
  // 1. Bank Account Registry
  // ─────────────────────────────────────────────────────────

  public registerBankAccount(params: Omit<TreasuryBankAccount, "createdAt" | "updatedAt">): {
    success: boolean; account?: TreasuryBankAccount; error?: string;
  } {
    if (!params.accountId || !params.tenantId || !params.accountNumber) {
      return { success: false, error: "accountId, tenantId and accountNumber are required" };
    }
    const now = new Date().toISOString();
    const account: TreasuryBankAccount = {
      ...params,
      authorizedUserIds: params.authorizedUserIds ?? [],
      integrationEnabled: params.integrationEnabled ?? false,
      currentBalance: params.currentBalance ?? 0,
      availableBalance: params.availableBalance ?? 0,
      isDefault: params.isDefault ?? false,
      createdAt: now,
      updatedAt: now,
    };
    this.bankAccounts.set(params.accountId, account);
    this._writeAudit(params.tenantId, "BANK_ACCOUNT_REGISTERED", "SYSTEM", params.accountId, undefined, undefined,
      `Bank account registered: ${params.bank} / ${params.accountType} / ${params.currency}`);
    return { success: true, account };
  }

  public getBankAccount(accountId: string): TreasuryBankAccount | undefined {
    return this.bankAccounts.get(accountId);
  }

  public listBankAccounts(tenantId: string): TreasuryBankAccount[] {
    return Array.from(this.bankAccounts.values()).filter(
      a => a.tenantId === tenantId && a.status === "ACTIVE"
    );
  }

  // ─────────────────────────────────────────────────────────
  // 2. Bank Statement Import
  // ─────────────────────────────────────────────────────────

  public importBankStatement(statement: Omit<BankStatement, "importedAt">): {
    success: boolean; statementId?: string; linesImported?: number; error?: string;
  } {
    if (!statement.statementId || !statement.accountId || !statement.tenantId) {
      return { success: false, error: "statementId, accountId and tenantId are required" };
    }
    // Idempotency — reject duplicate statement
    if (this.statements.has(statement.statementId)) {
      return { success: false, error: "Idempotency: statement already imported" };
    }

    const now = new Date().toISOString();
    const normalized: BankStatement = { ...statement, importedAt: now };

    // Normalize lines: stamp reconciliationStatus = UNMATCHED if not set
    normalized.lines = normalized.lines.map(l => ({
      ...l,
      reconciliationStatus: l.reconciliationStatus ?? "UNMATCHED",
      importedAt: now,
    }));

    this.statements.set(statement.statementId, normalized);
    this._writeAudit(statement.tenantId, "STATEMENT_IMPORTED", statement.importedBy,
      statement.statementId, undefined, statement.currency,
      `Statement imported: ${statement.source}, ${normalized.lines.length} lines, period ${statement.statementPeriodFrom}–${statement.statementPeriodTo}`);

    return { success: true, statementId: statement.statementId, linesImported: normalized.lines.length };
  }

  // ─────────────────────────────────────────────────────────
  // 3. Bank Reconciliation Engine
  // ─────────────────────────────────────────────────────────

  public runReconciliation(params: {
    runId: string;
    accountId: string;
    tenantId: string;
    statementId: string;
    initiatedBy: string;
    ledgerEntries: Array<{ ref: string; amount: number; date: string; description: string }>;
  }): { success: boolean; run?: ReconciliationRun; error?: string } {
    const statement = this.statements.get(params.statementId);
    if (!statement) return { success: false, error: "Statement not found" };

    const now = new Date().toISOString();
    const matches: ReconciliationMatch[] = [];
    let matchedCount = 0;
    let exceptionCount = 0;

    // Matching engine: reference > amount+date > fuzzy description
    for (const line of statement.lines) {
      const lineAmount = line.creditAmount > 0 ? line.creditAmount : -line.debitAmount;

      // Attempt 1: exact reference match
      const refMatch = params.ledgerEntries.find(
        l => l.ref === line.reference && Math.abs(l.amount - lineAmount) < 0.01
      );

      if (refMatch) {
        const match: ReconciliationMatch = {
          matchId: `MTH-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          statementLineId: line.lineId,
          ledgerRef: refMatch.ref,
          matchType: "EXACT",
          matchConfidence: 1.0,
          amountDifference: 0,
          dateDifference: 0,
          status: "MATCHED",
        };
        matches.push(match);
        line.reconciliationStatus = "MATCHED";
        line.matchedLedgerRef = refMatch.ref;
        line.matchConfidence = 1.0;
        matchedCount++;
        continue;
      }

      // Attempt 2: amount + date proximity match
      const amountMatch = params.ledgerEntries.find(
        l => Math.abs(l.amount - lineAmount) < 0.01 &&
          Math.abs(new Date(l.date).getTime() - new Date(line.transactionDate).getTime()) < 3 * 86400000
      );

      if (amountMatch) {
        const dateDiff = Math.round(
          Math.abs(new Date(amountMatch.date).getTime() - new Date(line.transactionDate).getTime()) / 86400000
        );
        const match: ReconciliationMatch = {
          matchId: `MTH-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          statementLineId: line.lineId,
          ledgerRef: amountMatch.ref,
          matchType: "AMOUNT_ONLY",
          matchConfidence: 0.85,
          amountDifference: 0,
          dateDifference: dateDiff,
          status: "SUGGESTED_MATCH",
        };
        matches.push(match);
        line.reconciliationStatus = "SUGGESTED_MATCH";
        line.matchConfidence = 0.85;
        matchedCount++;
        continue;
      }

      // No match → exception
      exceptionCount++;
      line.reconciliationStatus = "EXCEPTION";
      const exceptionId = `EXC-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      line.exceptionRef = exceptionId;
      this._createException(params.tenantId, "UNMATCHED_PAYMENT", "WARNING",
        `Unmatched statement line: ${line.description}`,
        `Statement line ${line.lineId} could not be matched. Amount: ${lineAmount} ${statement.currency}`,
        line.lineId);
    }

    const closingBalanceMatch =
      Math.abs(statement.closingBalance - (statement.openingBalance + statement.totalCredits - statement.totalDebits)) < 1;

    const run: ReconciliationRun = {
      runId: params.runId,
      accountId: params.accountId,
      tenantId: params.tenantId,
      statementId: params.statementId,
      periodFrom: statement.statementPeriodFrom,
      periodTo: statement.statementPeriodTo,
      totalStatementLines: statement.lines.length,
      matchedLines: matchedCount,
      unmatchedLines: exceptionCount,
      exceptionLines: exceptionCount,
      reconciledLines: matches.filter(m => m.status === "MATCHED").length,
      openingBalanceMatch: true,
      closingBalanceMatch,
      matches,
      status: exceptionCount > 0 ? "REVIEW_REQUIRED" : "COMPLETE",
      initiatedBy: params.initiatedBy,
      completedAt: now,
      auditRef: `AUDIT-RECON-${Date.now()}`,
      createdAt: now,
    };

    this.reconciliationRuns.set(run.runId, run);
    this._writeAudit(params.tenantId, "RECONCILIATION_COMPLETED", params.initiatedBy, run.runId, undefined, statement.currency,
      `Reconciliation: ${matchedCount} matched, ${exceptionCount} exceptions of ${statement.lines.length} lines`);

    return { success: true, run };
  }

  // ─────────────────────────────────────────────────────────
  // 4. Cash Position Calculation
  // ─────────────────────────────────────────────────────────

  public calculateCashPosition(params: {
    tenantId: string;
    branchId?: string;
    currency: TreasuryBankAccount["currency"];
    pendingReceipts?: number;
    pendingDisbursements?: number;
    outstandingObligations?: number;
    minimumLiquidityBuffer?: number;
  }): CashPosition {
    const accounts = Array.from(this.bankAccounts.values()).filter(
      a => a.tenantId === params.tenantId && a.currency === params.currency && a.status === "ACTIVE"
    );

    const cashOnHand = accounts
      .filter(a => a.accountType === "PETTY_CASH")
      .reduce((s, a) => s + (a.currentBalance ?? 0), 0);
    const bankBalances = accounts
      .filter(a => ["OPERATING", "PAYROLL", "COLLECTIONS", "TAX", "ESCROW", "INTERCOMPANY"].includes(a.accountType))
      .reduce((s, a) => s + (a.currentBalance ?? 0), 0);
    const mobileMoneyBalances = accounts
      .filter(a => a.accountType === "MOBILE_MONEY")
      .reduce((s, a) => s + (a.currentBalance ?? 0), 0);
    const paymentProviderBalances = accounts
      .filter(a => a.accountType === "PAYMENT_PROVIDER")
      .reduce((s, a) => s + (a.currentBalance ?? 0), 0);

    const pendingReceipts = params.pendingReceipts ?? 0;
    const pendingDisbursements = params.pendingDisbursements ?? 0;
    const outstandingObligations = params.outstandingObligations ?? 0;
    const minimumBuffer = params.minimumLiquidityBuffer ?? 500000;

    const totalCash = cashOnHand + bankBalances + mobileMoneyBalances + paymentProviderBalances;
    const availableLiquidity = totalCash + pendingReceipts - pendingDisbursements;
    const projectedClosingCash = availableLiquidity - outstandingObligations;
    const surplusOrShortfall = projectedClosingCash - minimumBuffer;

    let liquidityStatus: LiquidityStatus = "HEALTHY";
    if (surplusOrShortfall < 0) liquidityStatus = "SHORTFALL_RISK";
    if (surplusOrShortfall < -minimumBuffer * 0.5) liquidityStatus = "CRITICAL";
    if (surplusOrShortfall < minimumBuffer * 0.2 && surplusOrShortfall >= 0) liquidityStatus = "WATCH";

    const position: CashPosition = {
      positionId: `POS-${Date.now()}`,
      tenantId: params.tenantId,
      branchId: params.branchId,
      calculatedAt: new Date().toISOString(),
      currency: params.currency,
      cashOnHand,
      bankBalances,
      mobileMoneyBalances,
      paymentProviderBalances,
      pendingReceipts,
      pendingDisbursements,
      outstandingObligations,
      restrictedCash: accounts.filter(a => a.accountType === "RESERVE" || a.accountType === "ESCROW")
        .reduce((s, a) => s + (a.currentBalance ?? 0), 0),
      availableLiquidity,
      projectedClosingCash,
      liquidityStatus,
      minimumLiquidityBuffer: minimumBuffer,
      surplusOrShortfall,
    };

    if (liquidityStatus === "SHORTFALL_RISK" || liquidityStatus === "CRITICAL") {
      this._writeAudit(params.tenantId, "LIQUIDITY_ALERT", "SYSTEM", position.positionId, undefined, params.currency,
        `Liquidity ${liquidityStatus}: surplus/shortfall ${surplusOrShortfall.toFixed(2)} ${params.currency}`);
    }

    return position;
  }

  // ─────────────────────────────────────────────────────────
  // 5. Liquidity Forecasting Engine
  // ─────────────────────────────────────────────────────────

  public generateLiquidityForecast(params: {
    tenantId: string;
    scenario: LiquidityForecast["scenario"];
    horizonDays: number;
    currency: TreasuryBankAccount["currency"];
    openingBalance: number;
    dailyInflows: number;
    dailyOutflows: number;
    aiAssisted?: boolean;
  }): LiquidityForecast {
    // Scenario multipliers — deterministic, governed
    const scenarioMultipliers: Record<string, { inflow: number; outflow: number }> = {
      BASE:         { inflow: 1.0,  outflow: 1.0  },
      CONSERVATIVE: { inflow: 0.8,  outflow: 1.1  },
      STRESS:       { inflow: 0.6,  outflow: 1.25 },
      SHOCK:        { inflow: 0.3,  outflow: 1.5  },
      EXPANSION:    { inflow: 1.3,  outflow: 1.2  },
    };
    const mult = scenarioMultipliers[params.scenario] ?? { inflow: 1, outflow: 1 };

    const lines: ForecastLine[] = [];
    let runningBalance = params.openingBalance;
    let shortfallDate: string | undefined;

    const today = new Date();
    for (let d = 1; d <= params.horizonDays; d++) {
      const date = new Date(today);
      date.setDate(today.getDate() + d);
      const inflows  = params.dailyInflows  * mult.inflow;
      const outflows = params.dailyOutflows * mult.outflow;
      const net = inflows - outflows;
      runningBalance += net;

      if (!shortfallDate && runningBalance < 0) {
        shortfallDate = date.toISOString().slice(0, 10);
      }

      lines.push({
        forecastDate: date.toISOString().slice(0, 10),
        expectedInflows: inflows,
        expectedOutflows: outflows,
        netCashFlow: net,
        projectedBalance: runningBalance,
        confidenceScore: params.scenario === "BASE" ? 0.9 : params.scenario === "STRESS" ? 0.6 : 0.75,
      });
    }

    const finalBalance = lines[lines.length - 1]?.projectedBalance ?? params.openingBalance;
    let liquidityStatus: LiquidityStatus = "HEALTHY";
    if (shortfallDate) liquidityStatus = "SHORTFALL_RISK";
    if (finalBalance < -params.openingBalance * 0.5) liquidityStatus = "CRITICAL";
    if (!shortfallDate && finalBalance < params.openingBalance * 0.2) liquidityStatus = "WATCH";

    return {
      forecastId: `FCST-${Date.now()}`,
      tenantId: params.tenantId,
      scenario: params.scenario,
      generatedAt: new Date().toISOString(),
      horizonDays: params.horizonDays,
      currency: params.currency,
      openingBalance: params.openingBalance,
      lines,
      shortfallDate,
      surplusAmount: !shortfallDate ? Math.max(0, finalBalance) : undefined,
      liquidityStatus,
      aiAssisted: params.aiAssisted ?? false,
    };
  }

  // ─────────────────────────────────────────────────────────
  // 6. Working Capital Analytics
  // ─────────────────────────────────────────────────────────

  public calculateWorkingCapital(params: {
    tenantId: string;
    currency: TreasuryBankAccount["currency"];
    totalReceivables: number;
    totalPayables: number;
    inventoryValue: number;
    operatingCash: number;
    averageDailyRevenue: number;
    averageDailyCOGS: number;
    averageDailyPurchases: number;
  }): WorkingCapitalMetrics {
    const dso = params.averageDailyRevenue > 0
      ? params.totalReceivables / params.averageDailyRevenue : 0;
    const dpo = params.averageDailyPurchases > 0
      ? params.totalPayables / params.averageDailyPurchases : 0;
    const inventoryDays = params.averageDailyCOGS > 0
      ? params.inventoryValue / params.averageDailyCOGS : 0;
    const cashConversionCycle = dso + inventoryDays - dpo;

    return {
      tenantId: params.tenantId,
      calculatedAt: new Date().toISOString(),
      currency: params.currency,
      totalReceivables: params.totalReceivables,
      totalPayables: params.totalPayables,
      inventoryValue: params.inventoryValue,
      operatingCash: params.operatingCash,
      dso: Math.round(dso * 10) / 10,
      dpo: Math.round(dpo * 10) / 10,
      inventoryDays: Math.round(inventoryDays * 10) / 10,
      cashConversionCycle: Math.round(cashConversionCycle * 10) / 10,
      workingCapital: params.totalReceivables + params.inventoryValue - params.totalPayables,
    };
  }

  // ─────────────────────────────────────────────────────────
  // 7. Payment Run Management
  // ─────────────────────────────────────────────────────────

  public createPaymentRun(params: {
    tenantId: string;
    branchId?: string;
    currency: PaymentRun["currency"];
    items: Omit<PaymentRunItem, "runId" | "status" | "itemId">[];
    initiatedBy: string;
    idempotencyKey: string;
  }): { success: boolean; run?: PaymentRun; blockedByPolicy?: string; error?: string } {
    // Idempotency — reject duplicate payment run
    const existingRun = Array.from(this.paymentRuns.values())
      .find(r => r.idempotencyKey === params.idempotencyKey && r.tenantId === params.tenantId);
    if (existingRun) {
      return { success: false, error: `Idempotency violation: payment run already exists for key ${params.idempotencyKey}` };
    }

    const runId = `PRN-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const now = new Date().toISOString();
    const totalAmount = params.items.reduce((s, i) => s + i.amount, 0);

    // Policy guardrail: check daily transfer limit
    const policy = this._getEffectivePolicy("PAYMENT", params.currency);
    if (policy?.dailyTransferLimit && totalAmount > policy.dailyTransferLimit) {
      return {
        success: false,
        blockedByPolicy: `BLOCKED BY POLICY: Total payment run amount ${totalAmount} ${params.currency} exceeds daily transfer limit ${policy.dailyTransferLimit} ${params.currency}`,
      };
    }

    // Verify all beneficiaries
    for (const item of params.items) {
      const beneficiary = this.beneficiaries.get(item.beneficiaryId);
      if (!beneficiary || beneficiary.verificationStatus !== "VERIFIED") {
        return {
          success: false,
          blockedByPolicy: `BLOCKED BY POLICY: Beneficiary ${item.beneficiaryId} is not verified. Cannot include in payment run.`,
        };
      }
    }

    const items: PaymentRunItem[] = params.items.map((i, idx) => ({
      ...i,
      itemId: `PRI-${runId}-${idx + 1}`,
      runId,
      status: "PENDING",
    }));

    const run: PaymentRun = {
      runId,
      tenantId: params.tenantId,
      branchId: params.branchId,
      status: "DRAFT",
      currency: params.currency,
      totalAmount,
      itemCount: items.length,
      items,
      liquidityCheckPassed: false,
      initiatedBy: params.initiatedBy,
      idempotencyKey: params.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    };

    this.paymentRuns.set(runId, run);
    this._writeAudit(params.tenantId, "PAYMENT_RUN_CREATED", params.initiatedBy, runId, totalAmount, params.currency,
      `Payment run created: ${items.length} payments, total ${totalAmount} ${params.currency}`);

    return { success: true, run };
  }

  public performLiquidityCheck(runId: string, availableLiquidity: number): {
    success: boolean; passed?: boolean; shortfall?: number; error?: string;
  } {
    const run = this.paymentRuns.get(runId);
    if (!run) return { success: false, error: "Payment run not found" };

    const policy = this._getEffectivePolicy("LIQUIDITY", run.currency);
    const minimumBuffer = policy?.minimumLiquidityBuffer ?? 0;
    const requiredLiquidity = run.totalAmount + minimumBuffer;
    const passed = availableLiquidity >= requiredLiquidity;
    const shortfall = passed ? 0 : requiredLiquidity - availableLiquidity;

    run.status = "LIQUIDITY_CHECKED";
    run.liquidityCheckPassed = passed;
    run.updatedAt = new Date().toISOString();

    if (!passed) {
      this._createException(run.tenantId, "MISSING_SETTLEMENT", "ELEVATED",
        `Liquidity shortfall for payment run ${runId}`,
        `Available: ${availableLiquidity}, Required: ${requiredLiquidity}, Shortfall: ${shortfall}`,
        runId);
    }

    return { success: true, passed, shortfall };
  }

  public approvePaymentRun(runId: string, approvalRef: string, approvedBy: string): {
    success: boolean; error?: string;
  } {
    const run = this.paymentRuns.get(runId);
    if (!run) return { success: false, error: "Payment run not found" };
    if (!run.liquidityCheckPassed) {
      return { success: false, error: "BLOCKED BY POLICY: Liquidity check has not passed. Cannot approve payment run." };
    }

    run.status = "APPROVED";
    run.approvalRef = approvalRef;
    run.approvedBy = approvedBy;
    run.updatedAt = new Date().toISOString();
    this._writeAudit(run.tenantId, "PAYMENT_RUN_APPROVED", approvedBy, runId, run.totalAmount, run.currency,
      `Payment run approved. Approval ref: ${approvalRef}`);

    return { success: true };
  }

  public executePaymentRun(runId: string, executorId: string): {
    success: boolean; executionRef?: string; error?: string;
  } {
    const run = this.paymentRuns.get(runId);
    if (!run) return { success: false, error: "Payment run not found" };

    // Idempotency guard — first
    if (this.executedPaymentRunIds.has(runId)) {
      return { success: false, error: "Idempotency violation: payment run has already been executed" };
    }

    if (run.status !== "APPROVED") {
      return { success: false, error: `BLOCKED BY POLICY: Only APPROVED payment runs can be executed. Current status: ${run.status}` };
    }

    this.executedPaymentRunIds.add(runId);
    const executionRef = `EXEC-PRN-${Date.now()}`;
    const now = new Date().toISOString();

    run.status = "EXECUTING";
    run.executionRef = executionRef;
    run.executedAt = now;

    // Execute each item — domain services own actual payment
    run.items.forEach(item => {
      item.status = "CONFIRMED";
      item.paymentRef = `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      item.providerConfirmation = `PROV-${Date.now()}`;
    });

    run.status = "COMPLETE";
    run.auditRef = `AUDIT-PRN-${Date.now()}`;
    run.updatedAt = now;

    this._writeAudit(run.tenantId, "PAYMENT_RUN_EXECUTED", executorId, runId, run.totalAmount, run.currency,
      `Payment run executed: ${run.itemCount} payments confirmed. Ref: ${executionRef}`);

    return { success: true, executionRef };
  }

  // ─────────────────────────────────────────────────────────
  // 8. Beneficiary Registry & Change Controls
  // ─────────────────────────────────────────────────────────

  public registerBeneficiary(params: Omit<Beneficiary, "createdAt" | "updatedAt" | "changeHistory">): {
    success: boolean; beneficiary?: Beneficiary; error?: string;
  } {
    if (!params.beneficiaryId || !params.tenantId || !params.accountNumber) {
      return { success: false, error: "beneficiaryId, tenantId and accountNumber are required" };
    }
    const now = new Date().toISOString();
    const beneficiary: Beneficiary = { ...params, changeHistory: [], createdAt: now, updatedAt: now };
    this.beneficiaries.set(params.beneficiaryId, beneficiary);
    this._writeAudit(params.tenantId, "BENEFICIARY_REGISTERED", "SYSTEM", params.beneficiaryId, undefined, params.currency,
      `Beneficiary registered: ${params.name} / ${params.bank} / ${params.type}`);
    return { success: true, beneficiary };
  }

  public requestBeneficiaryChange(params: {
    beneficiaryId: string;
    changedBy: string;
    field: string;
    newValue: string;
    approvalRef: string;
  }): { success: boolean; cooldownUntil?: string; error?: string } {
    const beneficiary = this.beneficiaries.get(params.beneficiaryId);
    if (!beneficiary) return { success: false, error: "Beneficiary not found" };

    const policy = this._getEffectivePolicy("BENEFICIARY");
    const cooldownHours = policy?.beneficiaryCooldownHours ?? 24;

    const oldValue = (beneficiary as Record<string, unknown>)[params.field] as string ?? "";
    const now = new Date().toISOString();
    const cooldownUntil = new Date(Date.now() + cooldownHours * 3600 * 1000).toISOString();

    beneficiary.changeHistory.push({
      changedAt: now,
      changedBy: params.changedBy,
      field: params.field,
      oldValue,
      newValue: params.newValue,
      approvalRef: params.approvalRef,
    });

    (beneficiary as Record<string, unknown>)[params.field] = params.newValue;
    beneficiary.verificationStatus = "COOLDOWN";
    beneficiary.cooldownUntil = cooldownUntil;
    beneficiary.lastChangeAt = now;
    beneficiary.lastChangedBy = params.changedBy;
    beneficiary.updatedAt = now;

    this._writeAudit(beneficiary.tenantId, "BENEFICIARY_CHANGED", params.changedBy, params.beneficiaryId, undefined, beneficiary.currency,
      `Beneficiary ${params.field} changed. Cooldown until: ${cooldownUntil}. Approval: ${params.approvalRef}`);

    return { success: true, cooldownUntil };
  }

  // ─────────────────────────────────────────────────────────
  // 9. Treasury Policy Engine
  // ─────────────────────────────────────────────────────────

  public registerPolicy(policy: TreasuryPolicy): { success: boolean; error?: string } {
    if (!policy.policyId || !policy.domain) {
      return { success: false, error: "policyId and domain are required" };
    }
    this.policies.set(policy.policyId, policy);
    return { success: true };
  }

  public evaluateGuardrail(params: {
    domain: TreasuryPolicy["domain"];
    amount?: number;
    currency?: TreasuryBankAccount["currency"];
    availableLiquidity?: number;
  }): { allowed: boolean; reason?: string; policy?: TreasuryPolicy } {
    const policy = this._getEffectivePolicy(params.domain, params.currency);

    if (!policy) return { allowed: true };

    if (policy.maxPaymentAmount && params.amount && params.amount > policy.maxPaymentAmount) {
      return {
        allowed: false,
        reason: `BLOCKED BY POLICY: Amount ${params.amount} exceeds maximum payment amount ${policy.maxPaymentAmount} ${params.currency ?? ""}`,
        policy,
      };
    }

    if (policy.minimumLiquidityBuffer && params.availableLiquidity !== undefined) {
      if (params.amount && params.availableLiquidity - params.amount < policy.minimumLiquidityBuffer) {
        return {
          allowed: false,
          reason: `BLOCKED BY POLICY: Executing this payment would breach minimum liquidity buffer of ${policy.minimumLiquidityBuffer} ${params.currency ?? ""}`,
          policy,
        };
      }
    }

    return { allowed: true, policy };
  }

  // ─────────────────────────────────────────────────────────
  // 10. Settlement Management
  // ─────────────────────────────────────────────────────────

  public registerSettlement(settlement: Omit<SettlementRecord, "createdAt" | "updatedAt">): {
    success: boolean; settlement?: SettlementRecord;
  } {
    const now = new Date().toISOString();
    const record: SettlementRecord = { ...settlement, createdAt: now, updatedAt: now };
    this.settlements.set(settlement.settlementId, record);
    this._writeAudit(settlement.tenantId, "SETTLEMENT_RECEIVED", "SYSTEM", settlement.settlementId,
      settlement.expectedAmount, settlement.currency,
      `Settlement registered: ${settlement.provider}, expected ${settlement.expectedDate}`);
    return { success: true, settlement: record };
  }

  public markSettlementReceived(settlementId: string, receivedAmount: number): {
    success: boolean; delayDays?: number; error?: string;
  } {
    const settlement = this.settlements.get(settlementId);
    if (!settlement) return { success: false, error: "Settlement not found" };

    const now = new Date();
    const receivedDate = now.toISOString();
    const delayDays = Math.max(0, Math.round(
      (now.getTime() - new Date(settlement.expectedDate).getTime()) / 86400000
    ));

    settlement.receivedAmount = receivedAmount;
    settlement.receivedDate = receivedDate;
    settlement.status = "RECEIVED";
    settlement.delayDays = delayDays;
    settlement.netSettlement = receivedAmount - settlement.feeDeducted;
    settlement.updatedAt = receivedDate;

    if (delayDays > 0) {
      this._writeAudit(settlement.tenantId, "SETTLEMENT_DELAYED", "SYSTEM",
        settlementId, receivedAmount, settlement.currency,
        `Settlement delayed by ${delayDays} days. Provider: ${settlement.provider}`);
    }

    return { success: true, delayDays };
  }

  // ─────────────────────────────────────────────────────────
  // 11. Treasury Anomaly / Fraud Detection
  // ─────────────────────────────────────────────────────────

  public detectAnomalies(params: {
    tenantId: string;
    paymentAmount: number;
    currency: TreasuryBankAccount["currency"];
    beneficiaryId: string;
    paymentHour: number;
    historicalAverageAmount: number;
  }): { anomalyDetected: boolean; signals: string[]; riskLevel: TreasuryRiskLevel } {
    const signals: string[] = [];

    const beneficiary = this.beneficiaries.get(params.beneficiaryId);
    if (beneficiary?.verificationStatus !== "VERIFIED") {
      signals.push(`Unverified beneficiary: ${params.beneficiaryId}`);
    }
    if (beneficiary?.cooldownUntil && beneficiary.cooldownUntil > new Date().toISOString()) {
      signals.push(`Beneficiary in cooldown until: ${beneficiary.cooldownUntil}`);
    }
    if (params.paymentAmount > params.historicalAverageAmount * 3) {
      signals.push(`Unusual payment amount: ${params.paymentAmount} is ${(params.paymentAmount / params.historicalAverageAmount).toFixed(1)}x historical average`);
    }
    if (params.paymentHour < 6 || params.paymentHour > 22) {
      signals.push(`Unusual payment timing: hour ${params.paymentHour} is outside normal business hours`);
    }

    let riskLevel: TreasuryRiskLevel = "NORMAL";
    if (signals.length >= 1) riskLevel = "WARNING";
    if (signals.length >= 2) riskLevel = "ELEVATED";
    if (signals.length >= 3) riskLevel = "CRITICAL";

    if (signals.length > 0) {
      this._writeAudit(params.tenantId, "FRAUD_ALERT", "SYSTEM", params.beneficiaryId,
        params.paymentAmount, params.currency,
        `Anomaly detected (${riskLevel}): ${signals.join("; ")}`);
    }

    return { anomalyDetected: signals.length > 0, signals, riskLevel };
  }

  // ─────────────────────────────────────────────────────────
  // 12. Treasury Exception Management
  // ─────────────────────────────────────────────────────────

  public resolveException(exceptionId: string, resolvedBy: string, notes: string): {
    success: boolean; error?: string;
  } {
    const ex = this.exceptions.get(exceptionId);
    if (!ex) return { success: false, error: "Exception not found" };
    if (ex.status === "CLOSED") return { success: false, error: "Exception already closed" };

    const now = new Date().toISOString();
    ex.status = "RESOLVED";
    ex.resolvedBy = resolvedBy;
    ex.resolvedAt = now;
    ex.investigationNotes = notes;
    ex.updatedAt = now;
    this._writeAudit(ex.tenantId, "EXCEPTION_RESOLVED", resolvedBy, exceptionId, undefined, undefined,
      `Exception resolved: ${notes}`);
    return { success: true };
  }

  public listExceptions(tenantId: string): TreasuryException[] {
    return Array.from(this.exceptions.values()).filter(e => e.tenantId === tenantId);
  }

  // ─────────────────────────────────────────────────────────
  // 13. Audit Trail
  // ─────────────────────────────────────────────────────────

  public getAuditTrail(tenantId: string): TreasuryAuditEntry[] {
    return this.auditLedger.filter(e => e.tenantId === tenantId);
  }

  // ─────────────────────────────────────────────────────────
  // 14. Treasury Health & Observability
  // ─────────────────────────────────────────────────────────

  public getHealthSummary(tenantId: string): TreasuryHealthSummary {
    const tenantAccounts = Array.from(this.bankAccounts.values()).filter(a => a.tenantId === tenantId);
    const tenantBeneficiaries = Array.from(this.beneficiaries.values()).filter(b => b.tenantId === tenantId);
    const tenantExceptions = Array.from(this.exceptions.values())
      .filter(e => e.tenantId === tenantId && e.status !== "CLOSED");
    const tenantSettlements = Array.from(this.settlements.values())
      .filter(s => s.tenantId === tenantId && s.status === "EXPECTED");
    const tenantPaymentRuns = Array.from(this.paymentRuns.values())
      .filter(r => r.tenantId === tenantId && !["COMPLETE", "CANCELLED"].includes(r.status));

    const criticalExceptions = tenantExceptions.filter(e => e.severity === "CRITICAL").length;

    let riskLevel: TreasuryRiskLevel = "NORMAL";
    if (tenantExceptions.length > 3) riskLevel = "WARNING";
    if (tenantExceptions.length > 8 || criticalExceptions > 0) riskLevel = "ELEVATED";
    if (criticalExceptions > 3) riskLevel = "CRITICAL";

    let liquidityStatus: LiquidityStatus = "HEALTHY";
    if (riskLevel === "ELEVATED") liquidityStatus = "WATCH";
    if (riskLevel === "CRITICAL") liquidityStatus = "SHORTFALL_RISK";

    return {
      tenantId,
      calculatedAt: new Date().toISOString(),
      totalBankAccounts: tenantAccounts.length,
      totalBeneficiaries: tenantBeneficiaries.length,
      totalPolicies: this.policies.size,
      pendingPaymentRuns: tenantPaymentRuns.length,
      activeExceptions: tenantExceptions.length,
      unreconciledStatements: 0,
      pendingSettlements: tenantSettlements.length,
      liquidityStatus,
      riskLevel,
      treasuryEngineOperational: true,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────

  private _getEffectivePolicy(domain: TreasuryPolicy["domain"], currency?: string): TreasuryPolicy | undefined {
    const now = new Date().toISOString();
    return Array.from(this.policies.values()).find(
      p => p.domain === domain &&
        p.isActive &&
        p.effectiveFrom <= now &&
        (!p.effectiveUntil || p.effectiveUntil >= now) &&
        (!currency || !p.currency || p.currency === currency)
    );
  }

  private _createException(
    tenantId: string, type: TreasuryException["type"], severity: TreasuryException["severity"],
    title: string, description: string, relatedRef?: string
  ): void {
    const exId = `EXC-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const now = new Date().toISOString();
    this.exceptions.set(exId, {
      exceptionId: exId, tenantId, type, status: "CREATED", severity,
      title, description, relatedRef, createdAt: now, updatedAt: now,
    });
    this._writeAudit(tenantId, "EXCEPTION_CREATED", "SYSTEM", exId, undefined, undefined,
      `Exception created [${severity}]: ${title}`);
  }

  private _writeAudit(
    tenantId: string, eventType: TreasuryAuditEntry["eventType"], actorId: string,
    relatedRef?: string, amount?: number, currency?: TreasuryAuditEntry["currency"], details?: string
  ): void {
    this.auditLedger.push({
      auditId: `TAUD-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      tenantId, eventType, actorId, relatedRef, amount, currency,
      details: details ?? eventType,
      timestamp: new Date().toISOString(),
    });
  }

  private _seedDefaultPolicies(): void {
    this.registerPolicy({
      policyId: "TPOL-PAYMENT-001",
      policyVersion: "v1.0",
      policyName: "Standard Payment Limits",
      domain: "PAYMENT",
      maxPaymentAmount: 50000000,
      dailyTransferLimit: 200000000,
      approvalThreshold: 5000000,
      isActive: true,
      effectiveFrom: "2024-01-01T00:00:00.000Z",
    });
    this.registerPolicy({
      policyId: "TPOL-LIQUIDITY-001",
      policyVersion: "v1.0",
      policyName: "Minimum Liquidity Buffer",
      domain: "LIQUIDITY",
      minimumLiquidityBuffer: 1000000,
      isActive: true,
      effectiveFrom: "2024-01-01T00:00:00.000Z",
    });
    this.registerPolicy({
      policyId: "TPOL-CASH-001",
      policyVersion: "v1.0",
      policyName: "Branch Cash Limit",
      domain: "CASH",
      branchCashLimit: 5000000,
      isActive: true,
      effectiveFrom: "2024-01-01T00:00:00.000Z",
    });
    this.registerPolicy({
      policyId: "TPOL-BENEFICIARY-001",
      policyVersion: "v1.0",
      policyName: "Beneficiary Change Controls",
      domain: "BENEFICIARY",
      beneficiaryCooldownHours: 24,
      isActive: true,
      effectiveFrom: "2024-01-01T00:00:00.000Z",
    });
    this.registerPolicy({
      policyId: "TPOL-FX-001",
      policyVersion: "v1.0",
      policyName: "FX Concentration Warning",
      domain: "FX",
      bankConcentrationWarningPct: 70,
      isActive: true,
      effectiveFrom: "2024-01-01T00:00:00.000Z",
    });
  }
}

export const globalFinanceTreasuryEngine = new FinanceTreasuryEngine();
