import { randomUUID } from "crypto";
import type {
  TenantContext,
  MicrofinanceModuleManifest,
  MicrofinanceSettings,
  MicrofinanceBorrower,
  MicrofinanceLoan,
  MicrofinanceRepayment,
  MicrofinanceAiRecommendation,
} from "@kwakopos2/contracts";
import {
  globalMicrofinanceOperatingEngine,
  MicrofinanceOperatingEngine,
} from "@kwakopos2/domain";
import {
  globalInMemoryStore,
  InMemoryStore,
} from "@kwakopos2/database";

export class MicrofinanceService {
  private engine: MicrofinanceOperatingEngine;
  private store: InMemoryStore;

  private borrowerMap: Map<string, MicrofinanceBorrower> = new Map();
  private loanMap: Map<string, MicrofinanceLoan> = new Map();
  private repaymentMap: Map<string, MicrofinanceRepayment[]> = new Map();

  constructor(engine?: MicrofinanceOperatingEngine, store?: InMemoryStore) {
    this.engine = engine || globalMicrofinanceOperatingEngine;
    this.store = store || globalInMemoryStore;
  }

  getManifest(): MicrofinanceModuleManifest {
    return this.engine.getModuleManifest();
  }

  getSettings(ctx: TenantContext): MicrofinanceSettings {
    return this.engine.getDefaultSettings(ctx.tenantId, ctx.branchId);
  }

  registerBorrower(
    ctx: TenantContext,
    borrower: Omit<MicrofinanceBorrower, "id" | "tenantId" | "branchId" | "borrowerCode" | "status" | "createdAt">
  ): MicrofinanceBorrower {
    const id = randomUUID();
    const borrowerCode = `BOR-${Math.floor(10000 + Math.random() * 90000)}`;
    const fullBorrower: MicrofinanceBorrower = {
      ...borrower,
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      borrowerCode,
      status: "KYC_VERIFIED",
      createdAt: new Date().toISOString(),
    };
    this.borrowerMap.set(id, fullBorrower);
    return fullBorrower;
  }

  getBorrowers(ctx: TenantContext): MicrofinanceBorrower[] {
    return Array.from(this.borrowerMap.values()).filter(
      (b) => b.tenantId === ctx.tenantId && b.branchId === ctx.branchId
    );
  }

  assessAndDisburseLoan(
    ctx: TenantContext,
    application: {
      borrowerId: string;
      productName: string;
      principalTzs: number;
      interestRatePct: number;
      termMonths: number;
      monthlyIncomeTzs: number;
      existingExpensesTzs: number;
    }
  ): {
    loan?: MicrofinanceLoan;
    affordability: { disposableIncomeTzs: number; debtServiceRatioPct: number; isAffordable: boolean; creditScore: number; riskCategory: string };
  } {
    const borrower = this.borrowerMap.get(application.borrowerId);
    if (!borrower) throw new Error(`Borrower with ID '${application.borrowerId}' not found.`);

    const totalInterestTzs = Math.round(application.principalTzs * (application.interestRatePct / 100) * (application.termMonths / 12));
    const totalRepayableTzs = application.principalTzs + totalInterestTzs;
    const monthlyInstallmentTzs = Math.round(totalRepayableTzs / application.termMonths);

    const affordability = this.engine.calculateAffordabilityAndCreditScore(
      application.monthlyIncomeTzs,
      application.existingExpensesTzs,
      monthlyInstallmentTzs
    );

    if (!affordability.isAffordable) {
      return { affordability };
    }

    const id = randomUUID();
    const loanNumber = `MFI-${Math.floor(1000 + Math.random() * 9000)}`;
    const dueDate = new Date();
    dueDate.setMonth(dueDate.getMonth() + application.termMonths);

    const loan: MicrofinanceLoan = {
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      loanNumber,
      borrowerId: borrower.id,
      borrowerName: borrower.fullName,
      productName: application.productName,
      principalTzs: application.principalTzs,
      interestRatePct: application.interestRatePct,
      termMonths: application.termMonths,
      totalInterestTzs,
      totalRepayableTzs,
      totalPaidTzs: 0,
      outstandingPrincipalTzs: application.principalTzs,
      status: "DISBURSED",
      disbursedAt: new Date().toISOString(),
      dueDate: dueDate.toISOString(),
    };

    this.loanMap.set(id, loan);
    borrower.status = "ACTIVE_BORROWER";
    return { loan, affordability };
  }

  getLoans(ctx: TenantContext): MicrofinanceLoan[] {
    return Array.from(this.loanMap.values()).filter(
      (l) => l.tenantId === ctx.tenantId && l.branchId === ctx.branchId
    );
  }

  getAiRecommendations(ctx: TenantContext): MicrofinanceAiRecommendation[] {
    const borrowers = this.getBorrowers(ctx);
    const loans = this.getLoans(ctx);
    const repayments = Array.from(this.repaymentMap.values()).flat().filter((r) => r.tenantId === ctx.tenantId);

    return this.engine.generateExplainableAiRecommendations(ctx, borrowers, loans, repayments);
  }
}

export const globalMicrofinanceService = new MicrofinanceService();
