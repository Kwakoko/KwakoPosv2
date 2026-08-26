import type {
  JournalEntry,
  JournalLine,
  Account,
  AccountingPeriod,
  TenantContext,
} from "@kwakopos2/contracts";

/**
 * INVARIANT F001: Every posted journal balances: Sum(Debit) = Sum(Credit).
 */
export function assertJournalBalanced(journal: Partial<JournalEntry>, lines: JournalLine[]): void {
  if (!lines || lines.length < 2) {
    throw new Error(
      `INVARIANT_F001_VIOLATION: Journal ${journal.id || journal.journalNumber || "NEW"} must have at least 2 lines.`
    );
  }

  const totalDebit = lines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0);

  const roundedDebit = Math.round(totalDebit * 100) / 100;
  const roundedCredit = Math.round(totalCredit * 100) / 100;

  if (Math.abs(roundedDebit - roundedCredit) > 0.01) {
    throw new Error(
      `INVARIANT_F001_VIOLATION: Journal ${journal.id || journal.journalNumber || "NEW"} is out of balance. Total Debit: ${roundedDebit}, Total Credit: ${roundedCredit}, Difference: ${Math.abs(roundedDebit - roundedCredit)}.`
    );
  }
}

/**
 * INVARIANT F002: Every posted journal belongs to exactly one tenant.
 */
export function assertJournalTenantIsolation(
  requestContext: TenantContext,
  resource: { tenantId: string; branchId?: string }
): void {
  if (requestContext.tenantId !== resource.tenantId) {
    throw new Error(
      `INVARIANT_F002_VIOLATION: Financial cross-tenant breach! Context tenant ${requestContext.tenantId} attempted operation on resource tenant ${resource.tenantId}.`
    );
  }
}

/**
 * INVARIANT F003: Every financial transaction has a valid source or is explicitly manual.
 */
export function assertJournalSourceTraceability(journal: Partial<JournalEntry>): void {
  const validSourceTypes = [
    "SALE",
    "PURCHASE",
    "PAYMENT",
    "EXPENSE",
    "RETURN",
    "TRANSFER",
    "CASH_SESSION",
    "MANUAL",
    "REVERSAL",
  ];
  if (!journal.sourceType || !validSourceTypes.includes(journal.sourceType)) {
    throw new Error(
      `INVARIANT_F003_VIOLATION: Journal ${journal.id || "NEW"} has invalid sourceType '${journal.sourceType}'.`
    );
  }

  if (journal.sourceType !== "MANUAL" && !journal.sourceId && !journal.isReversal) {
    throw new Error(
      `INVARIANT_F003_VIOLATION: Non-manual journal entry ${journal.id || "NEW"} of type ${journal.sourceType} must have a valid sourceId.`
    );
  }
}

/**
 * INVARIANT F004: No posted journal is directly mutable.
 */
export function assertPostedJournalImmutable(originalJournal: JournalEntry): void {
  if (originalJournal.status === "POSTED" || originalJournal.status === "REVERSED") {
    throw new Error(
      `INVARIANT_F004_VIOLATION: Posted journal ${originalJournal.journalNumber} (${originalJournal.id}) is immutable and cannot be directly updated or deleted.`
    );
  }
}

/**
 * INVARIANT F005: Every reversal references the original transaction.
 */
export function assertReversalReferencesOriginal(
  reversalJournal: Partial<JournalEntry>,
  originalJournalExists: boolean
): void {
  if (reversalJournal.isReversal) {
    if (!reversalJournal.reversalOfJournalId) {
      throw new Error(
        `INVARIANT_F005_VIOLATION: Reversal journal ${reversalJournal.id || "NEW"} must reference reversalOfJournalId.`
      );
    }
    if (!originalJournalExists) {
      throw new Error(
        `INVARIANT_F005_VIOLATION: Reversal journal references non-existent original journal ${reversalJournal.reversalOfJournalId}.`
      );
    }
  }
}

/**
 * INVARIANT F006: AR balance equals authoritative invoice/credit/payment activity.
 */
export function assertReceivableAuthoritativeBalance(
  customerId: string,
  reportedBalance: number,
  openingBalance: number,
  invoicesTotal: number,
  debitAdjustments: number,
  paymentsTotal: number,
  creditAdjustments: number
): void {
  const calculated = Math.round((openingBalance + invoicesTotal + debitAdjustments - paymentsTotal - creditAdjustments) * 100) / 100;
  const reported = Math.round(reportedBalance * 100) / 100;
  if (Math.abs(calculated - reported) > 0.01) {
    throw new Error(
      `INVARIANT_F006_VIOLATION: AR balance discrepancy for customer ${customerId}. Reported: ${reported}, Calculated from transactions: ${calculated}.`
    );
  }
}

/**
 * INVARIANT F007: AP balance equals authoritative supplier/purchase/payment activity.
 */
export function assertPayableAuthoritativeBalance(
  supplierId: string,
  reportedBalance: number,
  openingBalance: number,
  purchasesTotal: number,
  debitAdjustments: number,
  paymentsTotal: number,
  creditAdjustments: number
): void {
  const calculated = Math.round((openingBalance + purchasesTotal + debitAdjustments - paymentsTotal - creditAdjustments) * 100) / 100;
  const reported = Math.round(reportedBalance * 100) / 100;
  if (Math.abs(calculated - reported) > 0.01) {
    throw new Error(
      `INVARIANT_F007_VIOLATION: AP balance discrepancy for supplier ${supplierId}. Reported: ${reported}, Calculated from transactions: ${calculated}.`
    );
  }
}

/**
 * INVARIANT F008: Inventory financial value reconciles to inventory valuation.
 */
export function assertInventoryFinancialReconciliation(
  glInventoryValue: number,
  calculatedLedgerValuation: number
): void {
  const gl = Math.round(glInventoryValue * 100) / 100;
  const valuation = Math.round(calculatedLedgerValuation * 100) / 100;
  if (Math.abs(gl - valuation) > 0.01) {
    throw new Error(
      `INVARIANT_F008_VIOLATION: Inventory financial value divergence. GL Inventory: ${gl}, Calculated Ledger Valuation: ${valuation}.`
    );
  }
}

/**
 * INVARIANT F009: Cash balance reconciles to cash movements.
 */
export function assertCashReconciliation(
  actualDrawerCash: number,
  expectedCash: number
): { variance: number; isBalanced: boolean } {
  const variance = Math.round((actualDrawerCash - expectedCash) * 100) / 100;
  return {
    variance,
    isBalanced: Math.abs(variance) <= 0.01,
  };
}

/**
 * INVARIANT F010: Closed periods reject unauthorized postings.
 */
export function assertPeriodAllowsPosting(period?: AccountingPeriod | null): void {
  if (!period) return; // If unassigned to specific period, falls back to open year
  if (period.status === "CLOSED" || period.status === "LOCKED") {
    throw new Error(
      `INVARIANT_F010_VIOLATION: Cannot post journal entry into closed/locked accounting period ${period.name} (${period.id}).`
    );
  }
}

/**
 * INVARIANT F011: Financial transactions remain idempotent across multi-device synchronization.
 */
export function assertFinancialIdempotency(
  incomingKey: string,
  existingKeys: Set<string>
): void {
  if (existingKeys.has(incomingKey)) {
    throw new Error(
      `INVARIANT_F011_VIOLATION: Duplicate financial operation with idempotencyKey '${incomingKey}' already processed.`
    );
  }
}

/**
 * INVARIANT F012: No financial event crosses tenant or branch boundaries without authorization.
 */
export function assertBranchFinancialBoundary(
  requestContext: TenantContext,
  resourceBranchId: string,
  allowCrossBranch = false
): void {
  if (!allowCrossBranch && requestContext.branchId !== resourceBranchId) {
    throw new Error(
      `INVARIANT_F012_VIOLATION: Unauthorized cross-branch financial access. Context branch ${requestContext.branchId} attempted action on branch ${resourceBranchId}.`
    );
  }
}
