import type {
  Sale,
  PurchaseReceipt,
  Payment,
  Expense,
  Return,
  CashSession,
  JournalEntry,
  JournalLine,
  Account,
  TenantContext,
} from "@kwakopos2/contracts";
import { AccountingEngine } from "./accountingEngine.js";
import { TransactionNumbering } from "./transactionNumbering.js";

export interface AccountLookup {
  cashAccountId: string;        // 1110
  bankAccountId: string;        // 1210
  receivableAccountId: string;  // 1310
  inventoryAccountId: string;   // 1410
  payableAccountId: string;     // 2110
  taxPayableAccountId: string;  // 2210
  salesRevenueAccountId: string;// 4100
  salesDiscountAccountId: string;// 4900
  cogsAccountId: string;        // 5100
  expenseDefaultAccountId: string; // 6900
  cashVarianceAccountId: string;// 8100
}

export class FinancialBridge {
  /**
   * Translates a finalized POS / Wholesale Sale into a Double-Entry General Ledger Journal.
   *
   * 1. Revenue & Payment / AR:
   *    Dr Cash (1110) or Bank (1210) or AR (1310) = Grand Total
   *    Cr Sales Revenue (4100) = Subtotal (net of tax)
   *    Cr VAT Payable (2210) = Tax Total (18%)
   *
   * 2. Cost & Inventory Movement (Perpetual Inventory System):
   *    Dr Direct COGS (5100) = Total Cost
   *    Cr Merchandise Inventory (1410) = Total Cost
   */
  static mapSaleToJournal(
    ctx: TenantContext,
    sale: Sale,
    accounts: AccountLookup,
    paymentMethod: "CASH" | "BANK" | "MOBILE_MONEY" | "CREDIT" = "CASH",
    journalSequence = 1
  ): { journal: JournalEntry; lines: JournalLine[] } {
    const journalNumber = TransactionNumbering.formatNumber("JRN", "MAIN", journalSequence);
    const lines: { accountId: string; description?: string; debit: number; credit: number }[] = [];

    const grandTotal = Number(sale.grandTotal);
    const taxTotal = Number(sale.taxTotal) || 0;
    const revenuePortion = grandTotal - taxTotal;
    const totalCost = Number(sale.totalCost) || 0;

    // 1. Debit Tender (Cash, Bank, or Accounts Receivable for Credit Sale)
    const tenderAccountId =
      paymentMethod === "CREDIT"
        ? accounts.receivableAccountId
        : paymentMethod === "BANK" || paymentMethod === "MOBILE_MONEY"
        ? accounts.bankAccountId
        : accounts.cashAccountId;

    lines.push({
      accountId: tenderAccountId,
      description: `Sale ${sale.saleNumber} - Payment/Receivable (${paymentMethod})`,
      debit: grandTotal,
      credit: 0,
    });

    // 2. Credit Revenue (net of tax)
    lines.push({
      accountId: accounts.salesRevenueAccountId,
      description: `Sale ${sale.saleNumber} - Merchandise Revenue`,
      debit: 0,
      credit: revenuePortion,
    });

    // 3. Credit Tax Liability if applicable
    if (taxTotal > 0) {
      lines.push({
        accountId: accounts.taxPayableAccountId,
        description: `Sale ${sale.saleNumber} - VAT Output Tax (18%)`,
        debit: 0,
        credit: taxTotal,
      });
    }

    // 4. COGS & Inventory Deduction (if merchandise has cost)
    if (totalCost > 0) {
      lines.push({
        accountId: accounts.cogsAccountId,
        description: `Sale ${sale.saleNumber} - Cost of Goods Sold`,
        debit: totalCost,
        credit: 0,
      });
      lines.push({
        accountId: accounts.inventoryAccountId,
        description: `Sale ${sale.saleNumber} - Inventory Deduction`,
        debit: 0,
        credit: totalCost,
      });
    }

    return AccountingEngine.createJournalEntry(ctx, {
      journalNumber,
      sourceType: "SALE",
      sourceId: sale.id,
      description: `POS Sale ${sale.saleNumber}`,
      idempotencyKey: `jrn-sale-${sale.id}`,
      lines,
    });
  }

  /**
   * Translates a Goods Receipt into an Inventory Asset and Supplier Payable liability.
   * Dr Merchandise Inventory (1410)
   * Cr Accounts Payable (2110)
   */
  static mapGoodsReceiptToJournal(
    ctx: TenantContext,
    receipt: PurchaseReceipt,
    accounts: AccountLookup,
    journalSequence = 1
  ): { journal: JournalEntry; lines: JournalLine[] } {
    const journalNumber = TransactionNumbering.formatNumber("JRN", "MAIN", journalSequence);
    const totalCost = (receipt.items || []).reduce((acc, item) => acc + Number(item.totalCost), 0);

    const lines = [
      {
        accountId: accounts.inventoryAccountId,
        description: `Goods Receipt ${receipt.receiptNumber} - Inventory Addition`,
        debit: totalCost,
        credit: 0,
      },
      {
        accountId: accounts.payableAccountId,
        description: `Goods Receipt ${receipt.receiptNumber} - Supplier Liability`,
        debit: 0,
        credit: totalCost,
      },
    ];

    return AccountingEngine.createJournalEntry(ctx, {
      journalNumber,
      sourceType: "PURCHASE",
      sourceId: receipt.id,
      description: `Purchase Receipt ${receipt.receiptNumber}`,
      idempotencyKey: `jrn-receipt-${receipt.id}`,
      lines,
    });
  }

  /**
   * Translates Customer Payment into GL cash/bank addition and AR reduction.
   * Dr Cash / Bank (1110 / 1210)
   * Cr Accounts Receivable (1310)
   */
  static mapCustomerPaymentToJournal(
    ctx: TenantContext,
    payment: Payment,
    accounts: AccountLookup,
    journalSequence = 1
  ): { journal: JournalEntry; lines: JournalLine[] } {
    const journalNumber = TransactionNumbering.formatNumber("JRN", "MAIN", journalSequence);
    const amount = Number(payment.amount);
    const isBank = payment.paymentMethod === "BANK" || payment.paymentMethod === "MOBILE_MONEY";
    const debitAccount = isBank ? accounts.bankAccountId : accounts.cashAccountId;

    const lines = [
      {
        accountId: debitAccount,
        description: `Customer Payment ${payment.paymentNumber} (${payment.paymentMethod})`,
        debit: amount,
        credit: 0,
      },
      {
        accountId: accounts.receivableAccountId,
        description: `Customer Payment ${payment.paymentNumber} - AR Clearance`,
        debit: 0,
        credit: amount,
      },
    ];

    return AccountingEngine.createJournalEntry(ctx, {
      journalNumber,
      sourceType: "PAYMENT",
      sourceId: payment.id,
      description: `Customer Payment ${payment.paymentNumber}`,
      idempotencyKey: `jrn-pay-cust-${payment.id}`,
      lines,
    });
  }

  /**
   * Translates Supplier Payment into AP reduction and Cash/Bank deduction.
   * Dr Accounts Payable (2110)
   * Cr Cash / Bank (1110 / 1210)
   */
  static mapSupplierPaymentToJournal(
    ctx: TenantContext,
    payment: Payment,
    accounts: AccountLookup,
    journalSequence = 1
  ): { journal: JournalEntry; lines: JournalLine[] } {
    const journalNumber = TransactionNumbering.formatNumber("JRN", "MAIN", journalSequence);
    const amount = Number(payment.amount);
    const isBank = payment.paymentMethod === "BANK" || payment.paymentMethod === "MOBILE_MONEY";
    const creditAccount = isBank ? accounts.bankAccountId : accounts.cashAccountId;

    const lines = [
      {
        accountId: accounts.payableAccountId,
        description: `Supplier Payment ${payment.paymentNumber} - AP Settlement`,
        debit: amount,
        credit: 0,
      },
      {
        accountId: creditAccount,
        description: `Supplier Payment ${payment.paymentNumber} - Funds Outflow`,
        debit: 0,
        credit: amount,
      },
    ];

    return AccountingEngine.createJournalEntry(ctx, {
      journalNumber,
      sourceType: "PAYMENT",
      sourceId: payment.id,
      description: `Supplier Payment ${payment.paymentNumber}`,
      idempotencyKey: `jrn-pay-sup-${payment.id}`,
      lines,
    });
  }

  /**
   * Translates Operating Expense into Expense Debit and Cash/Bank Credit.
   * Dr Operating Expense (6xxx)
   * Cr Cash / Bank (1110 / 1210)
   */
  static mapExpenseToJournal(
    ctx: TenantContext,
    expense: Expense,
    expenseAccountId: string,
    accounts: AccountLookup,
    paidViaBank = false,
    journalSequence = 1
  ): { journal: JournalEntry; lines: JournalLine[] } {
    const journalNumber = TransactionNumbering.formatNumber("JRN", "MAIN", journalSequence);
    const amount = Number(expense.amount);
    const creditAccount = paidViaBank ? accounts.bankAccountId : accounts.cashAccountId;

    const lines = [
      {
        accountId: expenseAccountId || accounts.expenseDefaultAccountId,
        description: `Expense: ${expense.category} - ${expense.reason}`,
        debit: amount,
        credit: 0,
      },
      {
        accountId: creditAccount,
        description: `Expense Outflow: ${expense.category}`,
        debit: 0,
        credit: amount,
      },
    ];

    return AccountingEngine.createJournalEntry(ctx, {
      journalNumber,
      sourceType: "EXPENSE",
      sourceId: expense.id,
      description: `Expense: ${expense.category}`,
      idempotencyKey: `jrn-exp-${expense.id}`,
      lines,
    });
  }

  /**
   * Translates a Sales Return & Stock Restoration into Journal.
   */
  static mapReturnToJournal(
    ctx: TenantContext,
    returnRecord: Return,
    accounts: AccountLookup,
    costOfReturnedGoods = 0,
    journalSequence = 1
  ): { journal: JournalEntry; lines: JournalLine[] } {
    const journalNumber = TransactionNumbering.formatNumber("JRN", "MAIN", journalSequence);
    const refundAmount = Number(returnRecord.totalRefundAmount);
    const lines = [];

    // Debit Revenue (Sales Return) and Credit Cash/AR
    lines.push({
      accountId: accounts.salesRevenueAccountId,
      description: `Sales Return ${returnRecord.returnNumber} - Refund Reversal`,
      debit: refundAmount,
      credit: 0,
    });

    const refundCreditAccount =
      returnRecord.refundType === "STORE_CREDIT"
        ? accounts.receivableAccountId
        : returnRecord.refundType === "BANK" || returnRecord.refundType === "MOBILE_MONEY"
        ? accounts.bankAccountId
        : accounts.cashAccountId;

    lines.push({
      accountId: refundCreditAccount,
      description: `Sales Return ${returnRecord.returnNumber} - Refund Outflow (${returnRecord.refundType})`,
      debit: 0,
      credit: refundAmount,
    });

    // If stock returned in GOOD condition, restore Inventory and reverse COGS
    if (costOfReturnedGoods > 0) {
      lines.push({
        accountId: accounts.inventoryAccountId,
        description: `Sales Return ${returnRecord.returnNumber} - Inventory Restored`,
        debit: costOfReturnedGoods,
        credit: 0,
      });
      lines.push({
        accountId: accounts.cogsAccountId,
        description: `Sales Return ${returnRecord.returnNumber} - COGS Reversal`,
        debit: 0,
        credit: costOfReturnedGoods,
      });
    }

    return AccountingEngine.createJournalEntry(ctx, {
      journalNumber,
      sourceType: "RETURN",
      sourceId: returnRecord.id,
      description: `Sales Return ${returnRecord.returnNumber}`,
      idempotencyKey: `jrn-ret-${returnRecord.id}`,
      lines,
    });
  }

  /**
   * Translates Cash Session Drawer Variance into GL Journal.
   * If Shortage (variance < 0): Dr Cash Short (8100), Cr Cash (1110)
   * If Overage (variance > 0): Dr Cash (1110), Cr Cash Over / Misc Income (7100)
   */
  static mapCashSessionVarianceToJournal(
    ctx: TenantContext,
    session: CashSession,
    accounts: AccountLookup,
    journalSequence = 1
  ): { journal: JournalEntry; lines: JournalLine[] } | null {
    const variance = Number(session.variance) || 0;
    if (Math.abs(variance) <= 0.01) return null; // Balanced, no discrepancy journal needed

    const journalNumber = TransactionNumbering.formatNumber("JRN", "MAIN", journalSequence);
    const absVariance = Math.abs(variance);
    const lines = [];

    if (variance < 0) {
      // Cash Shortage
      lines.push({
        accountId: accounts.cashVarianceAccountId,
        description: `Cash Session ${session.sessionNumber} - Drawer Shortage`,
        debit: absVariance,
        credit: 0,
      });
      lines.push({
        accountId: accounts.cashAccountId,
        description: `Cash Session ${session.sessionNumber} - Cash Adjustment`,
        debit: 0,
        credit: absVariance,
      });
    } else {
      // Cash Overage
      lines.push({
        accountId: accounts.cashAccountId,
        description: `Cash Session ${session.sessionNumber} - Cash Overage Addition`,
        debit: absVariance,
        credit: 0,
      });
      lines.push({
        accountId: accounts.cashVarianceAccountId,
        description: `Cash Session ${session.sessionNumber} - Drawer Overage Income`,
        debit: 0,
        credit: absVariance,
      });
    }

    return AccountingEngine.createJournalEntry(ctx, {
      journalNumber,
      sourceType: "CASH_SESSION",
      sourceId: session.id,
      description: `Cash Drawer Discrepancy for Session ${session.sessionNumber}`,
      idempotencyKey: `jrn-var-${session.id}`,
      lines,
    });
  }
}
