import type {
  PayrollInput,
  JournalEntry,
  JournalLine,
  TenantContext,
} from "@kwakopos2/contracts";
import { AccountingEngine } from "./accountingEngine.js";
import { TransactionNumbering } from "./transactionNumbering.js";

export interface PayrollAccountLookup {
  salariesExpenseAccountId: string;        // 6300 (Staff Salaries & Wages Expense)
  payrollTaxesPayableAccountId: string;    // 2410 (PAYE & Statutory Withholding)
  netSalariesPayableAccountId: string;     // 2420 (Accrued Net Salaries & Wages Payable)
  bankAccountId?: string;                  // 1210 (Operating Bank Account)
  cashAccountId?: string;                  // 1110 (Main Cash Drawer)
}

export class PayrollPostingBridge {
  /**
   * Translates an approved single PayrollInput into a balanced Double-Entry GL Journal.
   *
   * 1. Labor Cost Accrual:
   *    Dr Staff Salaries & Wages Expense (6300) = Total Earnings (Regular + Overtime + Commissions + Bonuses + Allowances)
   *    Cr PAYE & Statutory Payroll Withholding (2410) = Deductions Total
   *    Cr Accrued Net Salaries & Wages Payable (2420) = Net Pay (Gross Pay)
   *
   * Double-Entry Balance Proof:
   * Total Debits = Total Earnings = grossPay + deductionsTotal
   * Total Credits = deductionsTotal + grossPay
   * Balanced: Debits == Credits down to 0.00 minor unit.
   */
  static mapPayrollInputToJournal(
    ctx: TenantContext,
    payrollInput: PayrollInput,
    accounts: PayrollAccountLookup,
    journalSequence = 1
  ): { journal: JournalEntry; lines: JournalLine[] } {
    const journalNumber = TransactionNumbering.formatNumber("JRN", "PAYROLL", journalSequence);

    const regular = Number(payrollInput.regularPay) || 0;
    const overtime = Number(payrollInput.overtimePay) || 0;
    const commissions = Number(payrollInput.commissionsTotal) || 0;
    const bonuses = Number(payrollInput.bonusesTotal) || 0;
    const allowances = Number(payrollInput.allowancesTotal) || 0;
    const totalEarnings = Math.round((regular + overtime + commissions + bonuses + allowances) * 100) / 100;

    const deductions = Number(payrollInput.deductionsTotal) || 0;
    const netPay = Math.round((totalEarnings - deductions) * 100) / 100;

    const lines: { accountId: string; description?: string; debit: number; credit: number }[] = [];

    // 1. Debit Labor Cost
    lines.push({
      accountId: accounts.salariesExpenseAccountId,
      description: `Payroll Accrual for Employee ${payrollInput.employeeId} (${payrollInput.periodStart} - ${payrollInput.periodEnd})`,
      debit: totalEarnings,
      credit: 0,
    });

    // 2. Credit Statutory Deductions / Withholding Tax (if any)
    if (deductions > 0) {
      lines.push({
        accountId: accounts.payrollTaxesPayableAccountId,
        description: `PAYE & Statutory Withholding - Employee ${payrollInput.employeeId}`,
        debit: 0,
        credit: deductions,
      });
    }

    // 3. Credit Net Salaries Payable
    lines.push({
      accountId: accounts.netSalariesPayableAccountId,
      description: `Net Salary Payable - Employee ${payrollInput.employeeId}`,
      debit: 0,
      credit: netPay,
    });

    return AccountingEngine.createJournalEntry(ctx, {
      journalNumber,
      sourceType: "PAYROLL",
      sourceId: payrollInput.id,
      description: `Payroll Accrual for Employee ${payrollInput.employeeId}`,
      idempotencyKey: `jrn-payroll-${payrollInput.id}`,
      lines,
    });
  }

  /**
   * Translates a batch of approved PayrollInputs for an entire payroll cycle into a consolidated GL Journal.
   */
  static mapPayrollRunBatchToJournal(
    ctx: TenantContext,
    payrollRunNumber: string,
    inputs: PayrollInput[],
    accounts: PayrollAccountLookup,
    journalSequence = 1
  ): { journal: JournalEntry; lines: JournalLine[] } {
    const journalNumber = TransactionNumbering.formatNumber("JRN", "PAYROLL", journalSequence);

    let totalEarnings = 0;
    let totalDeductions = 0;
    let totalNetPay = 0;

    for (const p of inputs) {
      const reg = Number(p.regularPay) || 0;
      const ot = Number(p.overtimePay) || 0;
      const comm = Number(p.commissionsTotal) || 0;
      const bon = Number(p.bonusesTotal) || 0;
      const allow = Number(p.allowancesTotal) || 0;
      const earn = reg + ot + comm + bon + allow;
      const ded = Number(p.deductionsTotal) || 0;
      const net = earn - ded;

      totalEarnings += earn;
      totalDeductions += ded;
      totalNetPay += net;
    }

    totalEarnings = Math.round(totalEarnings * 100) / 100;
    totalDeductions = Math.round(totalDeductions * 100) / 100;
    totalNetPay = Math.round(totalNetPay * 100) / 100;

    const lines: { accountId: string; description?: string; debit: number; credit: number }[] = [];

    // Consolidated Debit Salaries & Wages Expense
    lines.push({
      accountId: accounts.salariesExpenseAccountId,
      description: `Payroll Run ${payrollRunNumber} - Total Salaries & Labor Expense (${inputs.length} employees)`,
      debit: totalEarnings,
      credit: 0,
    });

    // Consolidated Credit Statutory Withholding Payable
    if (totalDeductions > 0) {
      lines.push({
        accountId: accounts.payrollTaxesPayableAccountId,
        description: `Payroll Run ${payrollRunNumber} - Total PAYE & Statutory Deductions`,
        debit: 0,
        credit: totalDeductions,
      });
    }

    // Consolidated Credit Net Salaries Payable
    lines.push({
      accountId: accounts.netSalariesPayableAccountId,
      description: `Payroll Run ${payrollRunNumber} - Total Net Salaries Payable`,
      debit: 0,
      credit: totalNetPay,
    });

    return AccountingEngine.createJournalEntry(ctx, {
      journalNumber,
      sourceType: "PAYROLL",
      description: `Consolidated Payroll Run ${payrollRunNumber} (${inputs.length} employees)`,
      idempotencyKey: `jrn-payrollrun-${payrollRunNumber}`,
      lines,
    });
  }

  /**
   * Translates a Net Salary Disbursement to employees into a GL Journal.
   * Dr Net Salaries Payable (2420) = Amount Disbursed
   * Cr Bank (1210) or Cash (1110) = Amount Disbursed
   */
  static mapPayrollDisbursementToJournal(
    ctx: TenantContext,
    disbursementRef: string,
    amount: number,
    accounts: PayrollAccountLookup,
    method: "BANK" | "CASH" = "BANK",
    journalSequence = 1
  ): { journal: JournalEntry; lines: JournalLine[] } {
    const journalNumber = TransactionNumbering.formatNumber("JRN", "PAYROLL", journalSequence);
    const disbursementAccount = method === "BANK" 
      ? (accounts.bankAccountId || accounts.cashAccountId || "")
      : (accounts.cashAccountId || accounts.bankAccountId || "");

    const roundedAmount = Math.round(amount * 100) / 100;
    const lines = [
      {
        accountId: accounts.netSalariesPayableAccountId,
        description: `Disbursement ${disbursementRef} - Clear Net Salaries Payable`,
        debit: roundedAmount,
        credit: 0,
      },
      {
        accountId: disbursementAccount,
        description: `Disbursement ${disbursementRef} - Salary Payout via ${method}`,
        debit: 0,
        credit: roundedAmount,
      },
    ];

    return AccountingEngine.createJournalEntry(ctx, {
      journalNumber,
      sourceType: "PAYROLL",
      description: `Salary Disbursement ${disbursementRef} via ${method}`,
      idempotencyKey: `jrn-disburse-${disbursementRef}`,
      lines,
    });
  }
}
