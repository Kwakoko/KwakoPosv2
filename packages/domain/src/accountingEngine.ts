import type {
  Account,
  AccountClass,
  JournalEntry,
  JournalLine,
  TenantContext,
  CreateAccountRequest,
} from "@kwakopos2/contracts";
import { assertJournalBalanced, assertPostedJournalImmutable, assertPeriodAllowsPosting } from "./financeInvariants.js";
import { randomUUID } from "crypto";

export interface DefaultAccountTemplate {
  accountCode: string;
  name: string;
  accountClass: AccountClass;
  accountGroup: string;
  description: string;
  isSystem: boolean;
}

export const DEFAULT_CHART_OF_ACCOUNTS: DefaultAccountTemplate[] = [
  // 1000 — Assets
  { accountCode: "1110", name: "Main Cash Drawer", accountClass: "ASSET", accountGroup: "CASH", description: "Primary till cash on hand", isSystem: true },
  { accountCode: "1120", name: "Petty Cash", accountClass: "ASSET", accountGroup: "CASH", description: "Minor operational cash float", isSystem: false },
  { accountCode: "1210", name: "Primary Bank Account (NMB/CRDB)", accountClass: "ASSET", accountGroup: "BANK", description: "Operating bank account", isSystem: true },
  { accountCode: "1310", name: "Trade Debtors (Accounts Receivable)", accountClass: "ASSET", accountGroup: "ACCOUNTS_RECEIVABLE", description: "Customer credit receivable", isSystem: true },
  { accountCode: "1410", name: "Merchandise Inventory", accountClass: "ASSET", accountGroup: "INVENTORY", description: "Stock at cost valuation", isSystem: true },
  
  // 2000 — Liabilities
  { accountCode: "2110", name: "Trade Creditors (Accounts Payable)", accountClass: "LIABILITY", accountGroup: "ACCOUNTS_PAYABLE", description: "Supplier liabilities", isSystem: true },
  { accountCode: "2210", name: "VAT Output Payable (18%)", accountClass: "LIABILITY", accountGroup: "TAX_PAYABLE", description: "Tax liability on sales", isSystem: true },
  { accountCode: "2310", name: "Customer Advances & Deposits", accountClass: "LIABILITY", accountGroup: "CURRENT_LIABILITY", description: "Unearned revenue / deposits", isSystem: false },

  // 3000 — Equity
  { accountCode: "3100", name: "Owner Capital / Equity", accountClass: "EQUITY", accountGroup: "EQUITY", description: "Contributed business capital", isSystem: true },
  { accountCode: "3200", name: "Retained Earnings", accountClass: "EQUITY", accountGroup: "EQUITY", description: "Accumulated earnings", isSystem: true },

  // 4000 — Revenue
  { accountCode: "4100", name: "Retail POS Sales Revenue", accountClass: "REVENUE", accountGroup: "SALES_REVENUE", description: "Over-the-counter retail revenue", isSystem: true },
  { accountCode: "4200", name: "Wholesale & B2B Sales Revenue", accountClass: "REVENUE", accountGroup: "SALES_REVENUE", description: "Direct bulk wholesale sales", isSystem: false },
  { accountCode: "4300", name: "Service & Delivery Revenue", accountClass: "REVENUE", accountGroup: "SERVICE_REVENUE", description: "Service charges and deliveries", isSystem: false },
  { accountCode: "4900", name: "Sales Discounts Allowed (Contra)", accountClass: "REVENUE", accountGroup: "CONTRA_REVENUE", description: "Discount deducted from sales", isSystem: true },

  // 5000 — Cost of Goods Sold
  { accountCode: "5100", name: "Direct Cost of Goods Sold", accountClass: "COGS", accountGroup: "COGS", description: "Cost of merchandise sold", isSystem: true },
  { accountCode: "5200", name: "Inventory Shrinkage & Loss", accountClass: "COGS", accountGroup: "COGS", description: "Damaged / expired stock write-offs", isSystem: false },

  // 6000 — Operating Expenses
  { accountCode: "6100", name: "Rent & Premises Expense", accountClass: "EXPENSE", accountGroup: "OPERATING_EXPENSE", description: "Shop / warehouse rent", isSystem: false },
  { accountCode: "6200", name: "Utilities, Power & Water", accountClass: "EXPENSE", accountGroup: "OPERATING_EXPENSE", description: "Electricity, water, internet", isSystem: false },
  { accountCode: "6300", name: "Staff Salaries & Wages", accountClass: "EXPENSE", accountGroup: "PAYROLL", description: "Employee compensation", isSystem: false },
  { accountCode: "6400", name: "Office & Store Supplies", accountClass: "EXPENSE", accountGroup: "OPERATING_EXPENSE", description: "Cleaning, stationery, bags", isSystem: false },
  { accountCode: "6900", name: "Miscellaneous Operating Expenses", accountClass: "EXPENSE", accountGroup: "OPERATING_EXPENSE", description: "Other general expenses", isSystem: false },

  // 7000 / 8000 — Other Income & Expense
  { accountCode: "7100", name: "Interest & Finance Income", accountClass: "OTHER_INCOME", accountGroup: "OTHER_INCOME", description: "Bank interest received", isSystem: false },
  { accountCode: "8100", name: "Cash Over / Short Discrepancy", accountClass: "OTHER_EXPENSE", accountGroup: "VARIANCE", description: "Till cash reconciliation variance", isSystem: true },
  { accountCode: "8200", name: "Bank Service & Payment Provider Fees", accountClass: "OTHER_EXPENSE", accountGroup: "FINANCE_CHARGE", description: "M-Pesa, NMB, CRDB fees", isSystem: false },
];

export class AccountingEngine {
  /**
   * Generates default Chart of Accounts for a tenant.
   */
  static seedDefaultAccounts(ctx: TenantContext): Account[] {
    const now = new Date().toISOString();
    return DEFAULT_CHART_OF_ACCOUNTS.map((template) => ({
      id: randomUUID(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      accountCode: template.accountCode,
      name: template.name,
      accountClass: template.accountClass,
      accountGroup: template.accountGroup,
      currency: "TZS",
      isSystem: template.isSystem,
      isActive: true,
      currentBalance: 0,
      description: template.description,
      createdAt: now,
      updatedAt: now,
    }));
  }

  /**
   * Validates and prepares a posted Double-Entry Journal Entry.
   */
  static createJournalEntry(
    ctx: TenantContext,
    input: {
      id?: string;
      journalNumber: string;
      accountingPeriodId?: string | null;
      entryDate?: string;
      sourceType: JournalEntry["sourceType"];
      sourceId?: string | null;
      description: string;
      currency?: string;
      exchangeRate?: number;
      idempotencyKey?: string | null;
      lines: {
        accountId: string;
        costCenterId?: string | null;
        description?: string | null;
        debit: number;
        credit: number;
      }[];
    }
  ): { journal: JournalEntry; lines: JournalLine[] } {
    const id = input.id || randomUUID();
    const now = new Date().toISOString();
    const entryDate = input.entryDate || now;
    const currency = input.currency || "TZS";
    const exchangeRate = input.exchangeRate || 1.0;

    const lines: JournalLine[] = input.lines.map((l) => ({
      id: randomUUID(),
      journalEntryId: id,
      accountId: l.accountId,
      costCenterId: l.costCenterId || null,
      description: l.description || input.description,
      debit: Math.round((Number(l.debit) || 0) * 100) / 100,
      credit: Math.round((Number(l.credit) || 0) * 100) / 100,
      currency,
      exchangeRate,
    }));

    // Enforce Double-Entry Balancing (Invariant F001)
    assertJournalBalanced({ id, journalNumber: input.journalNumber }, lines);

    const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);

    const journal: JournalEntry = {
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      accountingPeriodId: input.accountingPeriodId || null,
      journalNumber: input.journalNumber,
      entryDate,
      postingDate: now,
      sourceType: input.sourceType,
      sourceId: input.sourceId || null,
      description: input.description,
      currency,
      exchangeRate,
      totalDebit: Math.round(totalDebit * 100) / 100,
      totalCredit: Math.round(totalCredit * 100) / 100,
      status: "POSTED",
      isReversal: false,
      reversalOfJournalId: null,
      reversalReason: null,
      createdById: ctx.userId,
      postedById: ctx.userId,
      postedAt: now,
      idempotencyKey: input.idempotencyKey || null,
      lines,
      createdAt: now,
      updatedAt: now,
    };

    return { journal, lines };
  }

  /**
   * Generates an immutable Reversal Journal for an existing posted entry.
   */
  static createReversalJournal(
    ctx: TenantContext,
    originalJournal: JournalEntry,
    originalLines: JournalLine[],
    reason: string,
    reversalJournalNumber: string
  ): { reversalJournal: JournalEntry; reversalLines: JournalLine[] } {
    if (originalJournal.status !== "POSTED") {
      throw new Error(
        `Cannot reverse journal ${originalJournal.journalNumber} (${originalJournal.id}) with status '${originalJournal.status}'. Only POSTED journals can be reversed.`
      );
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    // Invert debits and credits
    const reversalLines: JournalLine[] = originalLines.map((line) => ({
      id: randomUUID(),
      journalEntryId: id,
      accountId: line.accountId,
      costCenterId: line.costCenterId || null,
      description: `Reversal: ${line.description || originalJournal.description}`,
      debit: line.credit,
      credit: line.debit,
      currency: line.currency,
      exchangeRate: line.exchangeRate,
    }));

    assertJournalBalanced({ id, journalNumber: reversalJournalNumber }, reversalLines);

    const reversalJournal: JournalEntry = {
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      accountingPeriodId: originalJournal.accountingPeriodId || null,
      journalNumber: reversalJournalNumber,
      entryDate: now,
      postingDate: now,
      sourceType: "REVERSAL",
      sourceId: originalJournal.id,
      description: `REVERSAL of ${originalJournal.journalNumber}: ${reason}`,
      currency: originalJournal.currency,
      exchangeRate: originalJournal.exchangeRate,
      totalDebit: originalJournal.totalCredit,
      totalCredit: originalJournal.totalDebit,
      status: "POSTED",
      isReversal: true,
      reversalOfJournalId: originalJournal.id,
      reversalReason: reason,
      createdById: ctx.userId,
      postedById: ctx.userId,
      postedAt: now,
      idempotencyKey: `rev-${originalJournal.id}-${Date.now()}`,
      lines: reversalLines,
      createdAt: now,
      updatedAt: now,
    };

    return { reversalJournal, reversalLines };
  }

  /**
   * Calculates net balance effect on an account given its class.
   * ASSET, COGS, EXPENSE, OTHER_EXPENSE: Normal Balance = DEBIT (Debit increases, Credit decreases)
   * LIABILITY, EQUITY, REVENUE, OTHER_INCOME: Normal Balance = CREDIT (Credit increases, Debit decreases)
   */
  static computeAccountBalance(
    accountClass: AccountClass,
    openingBalance = 0,
    journalLines: JournalLine[]
  ): number {
    const totalDebit = journalLines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0);
    const totalCredit = journalLines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0);

    const isDebitNormal =
      accountClass === "ASSET" ||
      accountClass === "COGS" ||
      accountClass === "EXPENSE" ||
      accountClass === "OTHER_EXPENSE";

    if (isDebitNormal) {
      return Math.round((openingBalance + totalDebit - totalCredit) * 100) / 100;
    } else {
      return Math.round((openingBalance + totalCredit - totalDebit) * 100) / 100;
    }
  }

  /**
   * Multi-Currency Conversion Utility
   * Converts foreign currency amount to base functional currency (TZS) using exchange rate.
   */
  static convertCurrency(
    amount: number,
    exchangeRate: number,
    fromCurrency = "USD",
    toCurrency = "TZS"
  ): { baseAmount: number; rateUsed: number } {
    if (fromCurrency === toCurrency || exchangeRate <= 0) {
      return { baseAmount: Math.round(amount * 100) / 100, rateUsed: 1.0 };
    }
    const baseAmount = Math.round(amount * exchangeRate * 100) / 100;
    return { baseAmount, rateUsed: exchangeRate };
  }
}

