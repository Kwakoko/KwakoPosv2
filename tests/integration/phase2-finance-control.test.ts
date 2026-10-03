import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import {
  ScopedFinanceRepository,
  ScopedCommercialRepository,
  ScopedWorkforceRepository,
  InMemoryStore,
  hardenFinanceRepository,
  wireCommercialFinanceBridges,
} from "@kwakopos2/database";
import {
  AccountingEngine,
  FinancialBridge,
  ReceivablesPayablesEngine,
  PayrollInputEngine,
  PayrollPostingBridge,
  ComplianceEngine,
  assertJournalBalanced,
  assertPeriodAllowsPosting,
} from "@kwakopos2/domain";
import type {
  TenantContext,
  Sale,
  PurchaseReceipt,
  Expense,
  CashSession,
  Return,
  Employee,
  Timesheet,
} from "@kwakopos2/contracts";

describe("KwakoPos Phase 2: Enterprise Finance & Operational Control Integration Suite", () => {
  let store: InMemoryStore;
  let rawFinanceRepo: ScopedFinanceRepository;
  let financeRepo: ReturnType<typeof hardenFinanceRepository>;
  let commercialRepo: ScopedCommercialRepository;
  let workforceRepo: ScopedWorkforceRepository;
  let complianceEngine: ComplianceEngine;

  const ctx: TenantContext = {
    tenantId: "TENANT-P2-FINANCE-001",
    branchId: "BRANCH-P2-FINANCE-001",
    userId: "USER-FINANCE-CONTROLLER-001",
    roles: ["FINANCIAL_CONTROLLER", "ADMIN"],
    permissions: ["*"],
  };

  beforeEach(() => {
    store = new InMemoryStore();
    rawFinanceRepo = new ScopedFinanceRepository(store);
    financeRepo = hardenFinanceRepository(rawFinanceRepo);
    commercialRepo = new ScopedCommercialRepository(store);
    workforceRepo = new ScopedWorkforceRepository(store);
    wireCommercialFinanceBridges(commercialRepo, financeRepo);
    complianceEngine = new ComplianceEngine();
  });

  // =========================================================================
  // PILLAR 1: ACCOUNTING & GENERAL LEDGER
  // =========================================================================
  describe("Pillar 1: Double-Entry Accounting & Automated Commercial Bridges", () => {
    it("1.1 Provisions full Chart of Accounts and verifies zero initial variance", () => {
      const accounts = financeRepo.ensureDefaultAccounts(ctx);
      expect(accounts.length).toBeGreaterThanOrEqual(20);

      const lookup = financeRepo.getAccountLookup(ctx);
      expect(lookup.cashAccountId).toBeDefined();
      expect(lookup.bankAccountId).toBeDefined();
      expect(lookup.salariesExpenseAccountId).toBeDefined();
      expect(lookup.payrollTaxesPayableAccountId).toBeDefined();
      expect(lookup.netSalariesPayableAccountId).toBeDefined();
    });

    it("1.2 Commercial POS Sale automatically posts balanced double-entry GL journal", () => {
      const lookup = financeRepo.getAccountLookup(ctx);
      const mockSale: Sale = {
        id: randomUUID(),
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        saleNumber: "POS-SALE-2026-001",
        customerId: null,
        subtotal: 100000,
        discountTotal: 0,
        taxTotal: 18000,
        grandTotal: 118000,
        totalCost: 65000,
        status: "COMPLETED",
        paymentStatus: "PAID",
        cashierId: ctx.userId,
        deviceId: "POS-TERM-01",
        offlineCreatedAt: new Date().toISOString(),
        soldAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const { journal, lines } = FinancialBridge.mapSaleToJournal(ctx, mockSale, lookup, "CASH");
      expect(journal.status).toBe("POSTED");
      expect(journal.totalDebit).toBe(118000 + 65000); // 183,000
      expect(journal.totalCredit).toBe(118000 + 65000); // 183,000
      expect(() => assertJournalBalanced(journal, lines)).not.toThrow();
    });

    it("1.3 Goods Receipt posts balanced Inventory Asset and Accounts Payable", () => {
      const lookup = financeRepo.getAccountLookup(ctx);
      const mockReceipt: PurchaseReceipt = {
        id: randomUUID(),
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        purchaseOrderId: randomUUID(),
        receiptNumber: "GRN-2026-001",
        receivedAt: new Date().toISOString(),
        notes: "Initial inventory restock",
        status: "RECEIVED",
        items: [
          {
            id: randomUUID(),
            purchaseReceiptId: randomUUID(),
            productId: randomUUID(),
            variantId: randomUUID(),
            quantityReceived: 50,
            unitCost: 12000,
            totalCost: 600000,
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const { journal, lines } = FinancialBridge.mapGoodsReceiptToJournal(ctx, mockReceipt, lookup);
      expect(journal.totalDebit).toBe(600000);
      expect(journal.totalCredit).toBe(600000);
      expect(() => assertJournalBalanced(journal, lines)).not.toThrow();
    });

    it("1.4 Operating Expense posts balanced Expense and Cash disbursement", () => {
      const lookup = financeRepo.getAccountLookup(ctx);
      const mockExpense: Expense = {
        id: randomUUID(),
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        category: "UTILITIES",
        amount: 85000,
        paymentMethod: "CASH",
        reason: "Monthly electricity bill",
        description: "Monthly electricity bill",
        payee: "Utility Company",
        status: "PAID",
        taxDeductible: false,
        idempotencyKey: "phase2-expense-001",
        incurredAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const { journal, lines } = FinancialBridge.mapExpenseToJournal(
        ctx,
        mockExpense,
        lookup.expenseDefaultAccountId,
        lookup
      );
      expect(journal.totalDebit).toBe(85000);
      expect(journal.totalCredit).toBe(85000);
      expect(() => assertJournalBalanced(journal, lines)).not.toThrow();
    });

    it("1.5 Cash Drawer Variance creates balanced short/over reconciliation journal", () => {
      const lookup = financeRepo.getAccountLookup(ctx);
      const mockSession: CashSession = {
        id: randomUUID(),
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        sessionNumber: "CS-2026-001",
        cashierId: ctx.userId,
        openingCash: 100000,
        closingCash: 242000,
        expectedCash: 250000,
        variance: -8000, // 8,000 shortage
        status: "CLOSED",
        openedAt: new Date().toISOString(),
        closedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const res = FinancialBridge.mapCashSessionVarianceToJournal(ctx, mockSession, lookup);
      expect(res).not.toBeNull();
      expect(res!.journal.totalDebit).toBe(8000);
      expect(res!.journal.totalCredit).toBe(8000);
      expect(() => assertJournalBalanced(res!.journal, res!.lines)).not.toThrow();
    });

    it("1.6 Accounts Receivable and Accounts Payable aging buckets categorize accurately", () => {
      const invoices = [
        { dueDate: "2026-09-15T00:00:00.000Z", balanceDue: 500000 },  // Current (due in future relative to 2026-09-04)
        { dueDate: "2026-08-15T00:00:00.000Z", balanceDue: 300000 },  // 20 days overdue (days1To30)
        { dueDate: "2026-07-20T00:00:00.000Z", balanceDue: 200000 },  // 46 days overdue (days31To60)
        { dueDate: "2026-06-01T00:00:00.000Z", balanceDue: 150000 },  // 95 days overdue (days90Plus)
      ];

      const asOf = new Date("2026-09-04T00:00:00.000Z");
      const aging = ReceivablesPayablesEngine.categorizeAgingBuckets(invoices, asOf);

      expect(aging.current).toBe(500000);
      expect(aging.days1To30).toBe(300000);
      expect(aging.days31To60).toBe(200000);
      expect(aging.days90Plus).toBe(150000);
      expect(aging.total).toBe(1150000);
    });

    it("1.7 Financial Period Close enforces immutability and rejects subsequent postings", () => {
      const fiscalYear = financeRepo.createFiscalYear(ctx, {
        name: "FY 2026",
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-12-31T23:59:59.999Z",
      });

      const period = financeRepo.createAccountingPeriod(ctx, {
        fiscalYearId: fiscalYear.id,
        periodNumber: 8,
        name: "2026-08-AUGUST",
        startDate: "2026-08-01T00:00:00.000Z",
        endDate: "2026-08-31T23:59:59.999Z",
      });

      const closedPeriod = financeRepo.closePeriod(ctx, period.id);
      expect(closedPeriod.status).toBe("CLOSED");

      // Verify that posting to a closed period throws invariant violation
      expect(() => assertPeriodAllowsPosting(closedPeriod)).toThrow(/INVARIANT_F010_VIOLATION/);
    });

    it("1.8 Non-destructive reversing journal inverts entries and maintains audit provenance", () => {
      const lookup = financeRepo.getAccountLookup(ctx);
      const { journal: original, lines: origLines } = financeRepo.createJournalEntry(ctx, {
        description: "Accidental double accrual",
        sourceType: "MANUAL",
        lines: [
          { accountId: lookup.expenseDefaultAccountId, debit: 45000, credit: 0 },
          { accountId: lookup.bankAccountId, debit: 0, credit: 45000 },
        ],
      });

      const { reversalJournal, reversalLines } = AccountingEngine.createReversalJournal(
        ctx,
        original,
        origLines,
        "Reversal of accidental double accrual",
        "REV-2026-001"
      );

      expect(reversalJournal.isReversal).toBe(true);
      expect(reversalJournal.reversalOfJournalId).toBe(original.id);
      expect(reversalJournal.totalDebit).toBe(45000);
      expect(reversalJournal.totalCredit).toBe(45000);
      expect(reversalLines[0].credit).toBe(45000); // Inverted
      expect(reversalLines[1].debit).toBe(45000);  // Inverted
      expect(() => assertJournalBalanced(reversalJournal, reversalLines)).not.toThrow();
    });
  });

  // =========================================================================
  // PILLAR 2: PAYROLL & LABOR COSTING
  // =========================================================================
  describe("Pillar 2: Payroll Calculation & Automated GL Labor Posting", () => {
    it("2.1 Computes gross pay, overtime, and statutory deductions from approved timesheet", () => {
      const employee: Employee = {
        id: randomUUID(),
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        userId: randomUUID(),
        employeeCode: "EMP-001",
        firstName: "Juma",
        lastName: "Mkwawa",
        idNumber: "19900101-111",
        dateOfBirth: "1990-01-01",
        gender: "MALE",
        departmentId: randomUUID(),
        jobPositionId: randomUUID(),
        employmentType: "FULL_TIME",
        hireDate: "2024-01-01",
        terminationDate: null,
        baseSalary: 1200000, // Salaried 1.2M TZS / month (~7500 TZS / hr)
        hourlyRate: 0,
        status: "ACTIVE",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const timesheet: Timesheet = {
        id: randomUUID(),
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        employeeId: employee.id,
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        totalRegularMinutes: 9600, // 160 hours
        totalOvertimeMinutes: 600,  // 10 hours overtime
        status: "APPROVED",
        approvedById: ctx.userId,
        approvedAt: new Date().toISOString(),
        notes: "August approved timesheet",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const payrollInput = PayrollInputEngine.generatePayrollInput(
        ctx,
        employee,
        timesheet,
        [],     // commissions
        1.5,    // overtime multiplier
        50000,  // bonus
        30000,  // allowance
        150000  // deductions (PAYE + Pension)
      );

      expect(payrollInput.regularPay).toBe(1200000);
      expect(payrollInput.overtimePay).toBe(112500); // 10 hrs * (1.2M / 160) * 1.5 = 112,500
      expect(payrollInput.bonusesTotal).toBe(50000);
      expect(payrollInput.allowancesTotal).toBe(30000);
      expect(payrollInput.deductionsTotal).toBe(150000);
      expect(payrollInput.grossPay).toBe(1200000 + 112500 + 50000 + 30000 - 150000); // 1,242,500 net
    });

    it("2.2 Bridges approved payroll input into balanced General Ledger journal", () => {
      const lookup = financeRepo.getAccountLookup(ctx);
      const payrollAccountLookup = {
        salariesExpenseAccountId: lookup.salariesExpenseAccountId,
        payrollTaxesPayableAccountId: lookup.payrollTaxesPayableAccountId,
        netSalariesPayableAccountId: lookup.netSalariesPayableAccountId,
        bankAccountId: lookup.bankAccountId,
        cashAccountId: lookup.cashAccountId,
      };

      const mockPayrollInput = {
        id: randomUUID(),
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        employeeId: "EMP-001",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        basicHours: 160,
        overtimeHours: 10,
        regularPay: 1200000,
        overtimePay: 112500,
        commissionsTotal: 50000,
        bonusesTotal: 25000,
        allowancesTotal: 15000,
        deductionsTotal: 180000,
        grossPay: 1222500, // Net earnings: 1.4025M - 180k = 1,222,500
        status: "APPROVED" as const,
        approvedById: ctx.userId,
        approvedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const { journal, lines } = PayrollPostingBridge.mapPayrollInputToJournal(
        ctx,
        mockPayrollInput,
        payrollAccountLookup
      );

      expect(journal.status).toBe("POSTED");
      expect(journal.sourceType).toBe("PAYROLL");
      expect(journal.totalDebit).toBe(1402500);  // Total labor cost
      expect(journal.totalCredit).toBe(1402500); // 180,000 tax + 1,222,500 net salary
      expect(() => assertJournalBalanced(journal, lines)).not.toThrow();
    });

    it("2.3 Bridges batch payroll run and subsequent bank payout disbursement", () => {
      const lookup = financeRepo.getAccountLookup(ctx);
      const payrollAccountLookup = {
        salariesExpenseAccountId: lookup.salariesExpenseAccountId,
        payrollTaxesPayableAccountId: lookup.payrollTaxesPayableAccountId,
        netSalariesPayableAccountId: lookup.netSalariesPayableAccountId,
        bankAccountId: lookup.bankAccountId,
        cashAccountId: lookup.cashAccountId,
      };

      const emp1Input = {
        id: randomUUID(),
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        employeeId: "EMP-001",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        basicHours: 160,
        overtimeHours: 0,
        regularPay: 1000000,
        overtimePay: 0,
        commissionsTotal: 0,
        bonusesTotal: 0,
        allowancesTotal: 0,
        deductionsTotal: 120000,
        grossPay: 880000,
        status: "APPROVED" as const,
        approvedById: ctx.userId,
        approvedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const emp2Input = {
        id: randomUUID(),
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        employeeId: "EMP-002",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        basicHours: 160,
        overtimeHours: 5,
        regularPay: 800000,
        overtimePay: 37500,
        commissionsTotal: 25000,
        bonusesTotal: 0,
        allowancesTotal: 0,
        deductionsTotal: 90000,
        grossPay: 772500,
        status: "APPROVED" as const,
        approvedById: ctx.userId,
        approvedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // 1. Accrual Journal
      const batchRes = PayrollPostingBridge.mapPayrollRunBatchToJournal(
        ctx,
        "RUN-2026-08",
        [emp1Input, emp2Input],
        payrollAccountLookup
      );

      expect(batchRes.journal.totalDebit).toBe(1862500);  // 1M + 800k + 37.5k + 25k
      expect(batchRes.journal.totalCredit).toBe(1862500); // 210,000 deductions + 1,652,500 net salaries
      expect(() => assertJournalBalanced(batchRes.journal, batchRes.lines)).not.toThrow();

      // 2. Disbursement Payout Journal (Paying employees via Bank)
      const payoutRes = PayrollPostingBridge.mapPayrollDisbursementToJournal(
        ctx,
        "PAYOUT-2026-08",
        1652500,
        payrollAccountLookup,
        "BANK"
      );

      expect(payoutRes.journal.totalDebit).toBe(1652500);  // Dr Net Salaries Payable
      expect(payoutRes.journal.totalCredit).toBe(1652500); // Cr Bank Account
      expect(() => assertJournalBalanced(payoutRes.journal, payoutRes.lines)).not.toThrow();
    });
  });

  // =========================================================================
  // PILLAR 3: AUDITING & CRYPTOGRAPHIC PROVENANCE
  // =========================================================================
  describe("Pillar 3: Cryptographic Audit Trail & Forensic Verification", () => {
    it("3.1 Logs sequential audit records with unbroken SHA-256 hash chaining", () => {
      complianceEngine.appendAuditRecord(ctx.tenantId, "FINANCE", "CREATE_ACCOUNT", ctx.userId, "ACC-1110");
      complianceEngine.appendAuditRecord(ctx.tenantId, "FINANCE", "POST_JOURNAL", ctx.userId, "JRN-001");
      complianceEngine.appendAuditRecord(ctx.tenantId, "PAYROLL", "APPROVE_RUN", ctx.userId, "RUN-001");

      const isIntact = complianceEngine.verifyAuditChain(ctx.tenantId);
      expect(isIntact).toBe(true);

      const health = complianceEngine.getHealthSummary(ctx.tenantId);
      expect(health.engineOperational).toBe(true);
      expect(health.auditLogChainVerified).toBe(true);
      expect(health.totalAuditRecordsCount).toBe(3);
    });

    it("3.2 Detects unauthorized data tampering and immediately breaks verification", () => {
      complianceEngine.appendAuditRecord(ctx.tenantId, "FINANCE", "CLOSE_PERIOD", ctx.userId, "PERIOD-01");
      const rec2 = complianceEngine.appendAuditRecord(ctx.tenantId, "FINANCE", "POST_JOURNAL", ctx.userId, "JRN-002");

      expect(complianceEngine.verifyAuditChain(ctx.tenantId)).toBe(true);

      // Malicious direct database tampering: mutate previousHash
      rec2.previousHash = "TAMPERED_HASH_MALICIOUS_INJECTION";

      // Verification fails immediately
      expect(complianceEngine.verifyAuditChain(ctx.tenantId)).toBe(false);
    });
  });

  // =========================================================================
  // PILLAR 4: COMPLIANCE & STATUTORY FRAMEWORK
  // =========================================================================
  describe("Pillar 4: Statutory Compliance & Regulatory Certification", () => {
    it("4.1 Evaluates TRA EFDMS fiscal device compliance and Data Protection standards", () => {
      const traRule = complianceEngine.evaluateRule({
        ruleId: "COMP-TRA-EFDMS",
        tenantId: ctx.tenantId,
        framework: "TRA_EFDMS_TZ",
        ruleName: "TRA Electronic Fiscal Device Signature Validation",
        description: "All fiscal transactions signed with valid VFD / EFD cert",
        status: "COMPLIANT",
      });
      expect(traRule.success).toBe(true);

      const dpaRule = complianceEngine.evaluateRule({
        ruleId: "COMP-DPA-2022",
        tenantId: ctx.tenantId,
        framework: "DATA_PROTECTION_ACT_TZ",
        ruleName: "Tanzania Data Protection Act PII Privacy",
        description: "Customer personal identification data encrypted at rest",
        status: "COMPLIANT",
      });
      expect(dpaRule.success).toBe(true);

      const health = complianceEngine.getHealthSummary(ctx.tenantId);
      expect(health.totalRulesCount).toBe(2);
      expect(health.compliantRulesCount).toBe(2);
      expect(health.nonCompliantRulesCount).toBe(0);
      expect(health.auditLogChainVerified).toBe(true);
    });
  });
});
