import { globalFinanceTreasuryEngine } from "@kwakopos2/domain";
import type { TreasuryBankAccount, TreasuryPolicy, BankStatement, Beneficiary, SettlementRecord, PaymentRun } from "@kwakopos2/contracts";

// ============================================================
// Phase 35 — Finance & Treasury API Service
// ============================================================

export class FinanceTreasuryService {
  public registerBankAccount(params: Omit<TreasuryBankAccount, "createdAt" | "updatedAt">) {
    return globalFinanceTreasuryEngine.registerBankAccount(params);
  }
  public getBankAccount(accountId: string) {
    return globalFinanceTreasuryEngine.getBankAccount(accountId);
  }
  public listBankAccounts(tenantId: string) {
    return globalFinanceTreasuryEngine.listBankAccounts(tenantId);
  }

  public importBankStatement(statement: Omit<BankStatement, "importedAt">) {
    return globalFinanceTreasuryEngine.importBankStatement(statement);
  }

  public runReconciliation(params: {
    runId: string; accountId: string; tenantId: string; statementId: string; initiatedBy: string;
    ledgerEntries: Array<{ ref: string; amount: number; date: string; description: string }>;
  }) {
    return globalFinanceTreasuryEngine.runReconciliation(params);
  }

  public calculateCashPosition(params: {
    tenantId: string; branchId?: string; currency: TreasuryBankAccount["currency"];
    pendingReceipts?: number; pendingDisbursements?: number;
    outstandingObligations?: number; minimumLiquidityBuffer?: number;
  }) {
    return globalFinanceTreasuryEngine.calculateCashPosition(params);
  }

  public generateLiquidityForecast(params: {
    tenantId: string; scenario: "BASE" | "CONSERVATIVE" | "STRESS" | "SHOCK" | "EXPANSION";
    horizonDays: number; currency: TreasuryBankAccount["currency"];
    openingBalance: number; dailyInflows: number; dailyOutflows: number; aiAssisted?: boolean;
  }) {
    return globalFinanceTreasuryEngine.generateLiquidityForecast(params);
  }

  public calculateWorkingCapital(params: {
    tenantId: string; currency: TreasuryBankAccount["currency"];
    totalReceivables: number; totalPayables: number; inventoryValue: number;
    operatingCash: number; averageDailyRevenue: number;
    averageDailyCOGS: number; averageDailyPurchases: number;
  }) {
    return globalFinanceTreasuryEngine.calculateWorkingCapital(params);
  }

  public createPaymentRun(params: {
    tenantId: string; branchId?: string; currency: PaymentRun["currency"];
    items: any[]; initiatedBy: string; idempotencyKey: string;
  }) {
    return globalFinanceTreasuryEngine.createPaymentRun(params);
  }

  public performLiquidityCheck(runId: string, availableLiquidity: number, tenantId?: string) {
    return globalFinanceTreasuryEngine.performLiquidityCheck(runId, availableLiquidity, tenantId);
  }

  public approvePaymentRun(runId: string, approvalRef: string, approvedBy: string) {
    return globalFinanceTreasuryEngine.approvePaymentRun(runId, approvalRef, approvedBy);
  }

  public executePaymentRun(runId: string, executorId: string, tenantId?: string) {
    return globalFinanceTreasuryEngine.executePaymentRun(runId, executorId, tenantId);
  }

  public registerBeneficiary(params: Omit<Beneficiary, "createdAt" | "updatedAt" | "changeHistory">) {
    return globalFinanceTreasuryEngine.registerBeneficiary(params);
  }

  public requestBeneficiaryChange(params: {
    beneficiaryId: string; changedBy: string; field: string; newValue: string; approvalRef: string;
  }) {
    return globalFinanceTreasuryEngine.requestBeneficiaryChange(params);
  }

  public registerPolicy(policy: TreasuryPolicy) {
    return globalFinanceTreasuryEngine.registerPolicy(policy);
  }

  public evaluateGuardrail(params: {
    domain: TreasuryPolicy["domain"]; amount?: number; currency?: any; availableLiquidity?: number;
  }) {
    return globalFinanceTreasuryEngine.evaluateGuardrail(params);
  }

  public registerSettlement(settlement: Omit<SettlementRecord, "createdAt" | "updatedAt">) {
    return globalFinanceTreasuryEngine.registerSettlement(settlement);
  }

  public markSettlementReceived(settlementId: string, receivedAmount: number) {
    return globalFinanceTreasuryEngine.markSettlementReceived(settlementId, receivedAmount);
  }

  public detectAnomalies(params: {
    tenantId: string; paymentAmount: number; currency: TreasuryBankAccount["currency"];
    beneficiaryId: string; paymentHour: number; historicalAverageAmount: number;
  }) {
    return globalFinanceTreasuryEngine.detectAnomalies(params);
  }

  public resolveException(exceptionId: string, resolvedBy: string, notes: string) {
    return globalFinanceTreasuryEngine.resolveException(exceptionId, resolvedBy, notes);
  }

  public listExceptions(tenantId: string) {
    return globalFinanceTreasuryEngine.listExceptions(tenantId);
  }

  public getAuditTrail(tenantId: string) {
    return globalFinanceTreasuryEngine.getAuditTrail(tenantId);
  }

  public getDashboardMetrics(tenantId: string) {
    return globalFinanceTreasuryEngine.getHealthSummary(tenantId);
  }
}

export const globalFinanceTreasuryService = new FinanceTreasuryService();
