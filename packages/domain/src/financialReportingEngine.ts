import type {
  Account,
  JournalEntry,
  JournalLine,
  ProfitAndLossReport,
  BalanceSheetReport,
  TrialBalanceReport,
  TrialBalanceReportItem,
  TenantContext,
} from "@kwakopos2/contracts";
import { AccountingEngine } from "./accountingEngine.js";

export class FinancialReportingEngine {
  /**
   * Generates a comprehensive Trial Balance from Chart of Accounts and posted Journal Lines.
   */
  static generateTrialBalance(
    ctx: TenantContext,
    accounts: Account[],
    journals: JournalEntry[],
    lines: JournalLine[],
    asOfDate: string | Date = new Date()
  ): TrialBalanceReport {
    const asOfStr = typeof asOfDate === "string" ? asOfDate : asOfDate.toISOString();
    const activeJournals = new Set(
      journals.filter((j) => j.status === "POSTED" && new Date(j.entryDate) <= new Date(asOfDate)).map((j) => j.id)
    );

    const activeLines = lines.filter((l) => activeJournals.has(l.journalEntryId));
    let grandTotalDebits = 0;
    let grandTotalCredits = 0;

    const items: TrialBalanceReportItem[] = accounts.map((acc) => {
      const accLines = activeLines.filter((l) => l.accountId === acc.id);
      const totalDebit = accLines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
      const totalCredit = accLines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);

      grandTotalDebits += totalDebit;
      grandTotalCredits += totalCredit;

      const balance = AccountingEngine.computeAccountBalance(acc.accountClass, Number(acc.currentBalance) || 0, accLines);

      return {
        accountId: acc.id,
        accountCode: acc.accountCode,
        accountName: acc.name,
        accountClass: acc.accountClass,
        debit: Math.round(totalDebit * 100) / 100,
        credit: Math.round(totalCredit * 100) / 100,
        balance: Math.round(balance * 100) / 100,
      };
    });

    const roundedDebits = Math.round(grandTotalDebits * 100) / 100;
    const roundedCredits = Math.round(grandTotalCredits * 100) / 100;

    return {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      asOfDate: asOfStr,
      totalDebits: roundedDebits,
      totalCredits: roundedCredits,
      isBalanced: Math.abs(roundedDebits - roundedCredits) <= 0.01,
      items,
    };
  }

  /**
   * Generates a Profit & Loss (Income Statement) Report.
   */
  static generateProfitAndLoss(
    ctx: TenantContext,
    accounts: Account[],
    journals: JournalEntry[],
    lines: JournalLine[],
    periodName = "Current Period",
    startDate: string | Date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    endDate: string | Date = new Date()
  ): ProfitAndLossReport {
    const trialBalance = this.generateTrialBalance(ctx, accounts, journals, lines, endDate);

    // Sum balances by account classes and groups
    const getAccountSum = (groupFilter: string, classFilter?: string) => {
      return trialBalance.items
        .filter((item) => {
          const acc = accounts.find((a) => a.id === item.accountId);
          if (!acc) return false;
          if (classFilter && acc.accountClass !== classFilter) return false;
          return acc.accountGroup === groupFilter || acc.accountCode.startsWith(groupFilter);
        })
        .reduce((sum, item) => sum + item.balance, 0);
    };

    // Revenue
    const retailSales = getAccountSum("4100") || getAccountSum("SALES_REVENUE", "REVENUE");
    const wholesaleSales = getAccountSum("4200");
    const serviceRevenue = getAccountSum("4300");
    const discounts = getAccountSum("4900");
    const totalRevenue = Math.max(0, retailSales + wholesaleSales + serviceRevenue - discounts);

    // COGS
    const directCogs = getAccountSum("5100") || getAccountSum("COGS", "COGS");
    const shrinkageLoss = getAccountSum("5200");
    const totalCogs = directCogs + shrinkageLoss;

    // Gross Profit
    const grossProfit = totalRevenue - totalCogs;
    const grossMarginPct = totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 10000) / 100 : 0;

    // Operating Expenses
    const rent = getAccountSum("6100");
    const utilities = getAccountSum("6200");
    const salaries = getAccountSum("6300");
    const officeSupplies = getAccountSum("6400");
    const miscExpenses = getAccountSum("6900") || getAccountSum("OPERATING_EXPENSE", "EXPENSE");
    const totalOperatingExpenses = rent + utilities + salaries + officeSupplies + miscExpenses;

    // Operating Profit
    const operatingProfit = grossProfit - totalOperatingExpenses;
    const operatingMarginPct = totalRevenue > 0 ? Math.round((operatingProfit / totalRevenue) * 10000) / 100 : 0;

    // Other Income & Expenses
    const otherIncome = getAccountSum("7100") || getAccountSum("OTHER_INCOME", "OTHER_INCOME");
    const otherExpenses = getAccountSum("8100") + getAccountSum("8200");

    // Net Profit
    const netProfit = operatingProfit + otherIncome - otherExpenses;
    const netMarginPct = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 10000) / 100 : 0;

    return {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      periodName,
      startDate: typeof startDate === "string" ? startDate : startDate.toISOString(),
      endDate: typeof endDate === "string" ? endDate : endDate.toISOString(),
      revenue: {
        retailSales: Math.round(retailSales * 100) / 100,
        wholesaleSales: Math.round(wholesaleSales * 100) / 100,
        serviceRevenue: Math.round(serviceRevenue * 100) / 100,
        discounts: Math.round(discounts * 100) / 100,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
      },
      costOfGoodsSold: {
        directCogs: Math.round(directCogs * 100) / 100,
        shrinkageLoss: Math.round(shrinkageLoss * 100) / 100,
        totalCogs: Math.round(totalCogs * 100) / 100,
      },
      grossProfit: Math.round(grossProfit * 100) / 100,
      grossMarginPct,
      operatingExpenses: {
        rent: Math.round(rent * 100) / 100,
        utilities: Math.round(utilities * 100) / 100,
        salaries: Math.round(salaries * 100) / 100,
        officeSupplies: Math.round(officeSupplies * 100) / 100,
        miscExpenses: Math.round(miscExpenses * 100) / 100,
        totalOperatingExpenses: Math.round(totalOperatingExpenses * 100) / 100,
      },
      operatingProfit: Math.round(operatingProfit * 100) / 100,
      operatingMarginPct,
      otherIncome: Math.round(otherIncome * 100) / 100,
      otherExpenses: Math.round(otherExpenses * 100) / 100,
      netProfit: Math.round(netProfit * 100) / 100,
      netMarginPct,
    };
  }

  /**
   * Generates a Balance Sheet Report (Assets = Liabilities + Equity).
   */
  static generateBalanceSheet(
    ctx: TenantContext,
    accounts: Account[],
    journals: JournalEntry[],
    lines: JournalLine[],
    asOfDate: string | Date = new Date()
  ): BalanceSheetReport {
    const trialBalance = this.generateTrialBalance(ctx, accounts, journals, lines, asOfDate);
    const pnl = this.generateProfitAndLoss(ctx, accounts, journals, lines, "YTD", new Date(new Date().getFullYear(), 0, 1), asOfDate);

    const getBalance = (codePrefix: string) => {
      return trialBalance.items
        .filter((item) => item.accountCode.startsWith(codePrefix))
        .reduce((sum, item) => sum + item.balance, 0);
    };

    // Assets
    const cashOnHand = getBalance("1110") + getBalance("1120");
    const bankBalances = getBalance("1210");
    const accountsReceivable = getBalance("1310");
    const inventoryValuation = getBalance("1410");
    const totalCurrentAssets = cashOnHand + bankBalances + accountsReceivable + inventoryValuation;
    const totalAssets = totalCurrentAssets;

    // Liabilities
    const accountsPayable = getBalance("2110");
    const vatPayable = getBalance("2210");
    const customerAdvances = getBalance("2310");
    const totalCurrentLiabilities = accountsPayable + vatPayable + customerAdvances;
    const totalLiabilities = totalCurrentLiabilities;

    // Equity
    const ownerCapital = getBalance("3100") || (totalAssets - totalLiabilities - pnl.netProfit);
    const retainedEarnings = getBalance("3200");
    const currentPeriodNetProfit = pnl.netProfit;
    const totalEquity = ownerCapital + retainedEarnings + currentPeriodNetProfit;

    const diff = Math.abs(totalAssets - (totalLiabilities + totalEquity));
    const isBalanced = diff <= 0.01;

    return {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      asOfDate: typeof asOfDate === "string" ? asOfDate : asOfDate.toISOString(),
      assets: {
        cashOnHand: Math.round(cashOnHand * 100) / 100,
        bankBalances: Math.round(bankBalances * 100) / 100,
        accountsReceivable: Math.round(accountsReceivable * 100) / 100,
        inventoryValuation: Math.round(inventoryValuation * 100) / 100,
        totalCurrentAssets: Math.round(totalCurrentAssets * 100) / 100,
        totalAssets: Math.round(totalAssets * 100) / 100,
      },
      liabilities: {
        accountsPayable: Math.round(accountsPayable * 100) / 100,
        vatPayable: Math.round(vatPayable * 100) / 100,
        customerAdvances: Math.round(customerAdvances * 100) / 100,
        totalCurrentLiabilities: Math.round(totalCurrentLiabilities * 100) / 100,
        totalLiabilities: Math.round(totalLiabilities * 100) / 100,
      },
      equity: {
        ownerCapital: Math.round(ownerCapital * 100) / 100,
        retainedEarnings: Math.round(retainedEarnings * 100) / 100,
        currentPeriodNetProfit: Math.round(currentPeriodNetProfit * 100) / 100,
        totalEquity: Math.round(totalEquity * 100) / 100,
      },
      isBalanced,
      balanceCheckDifference: Math.round(diff * 100) / 100,
    };
  }
}
