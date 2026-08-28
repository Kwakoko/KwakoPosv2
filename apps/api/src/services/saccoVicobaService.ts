import { randomUUID } from "crypto";
import type {
  TenantContext,
  SaccoVicobaModuleManifest,
  SaccoVicobaSettings,
  SaccoMember,
  SaccoLoan,
  LoanRepaymentRecord,
  VicobaMeetingCycle,
  SaccoVicobaAiRecommendation,
} from "@kwakopos2/contracts";
import {
  globalSaccoVicobaOperatingEngine,
  SaccoVicobaOperatingEngine,
} from "@kwakopos2/domain";
import {
  globalInMemoryStore,
  InMemoryStore,
} from "@kwakopos2/database";

export class SaccoVicobaService {
  private engine: SaccoVicobaOperatingEngine;
  private store: InMemoryStore;

  private memberMap: Map<string, SaccoMember> = new Map();
  private loanMap: Map<string, SaccoLoan> = new Map();
  private repaymentMap: Map<string, LoanRepaymentRecord[]> = new Map();
  private meetingMap: Map<string, VicobaMeetingCycle> = new Map();

  constructor(engine?: SaccoVicobaOperatingEngine, store?: InMemoryStore) {
    this.engine = engine || globalSaccoVicobaOperatingEngine;
    this.store = store || globalInMemoryStore;
  }

  getManifest(): SaccoVicobaModuleManifest {
    return this.engine.getModuleManifest();
  }

  getSettings(ctx: TenantContext): SaccoVicobaSettings {
    return this.engine.getDefaultSettings(ctx.tenantId, ctx.branchId);
  }

  registerMember(ctx: TenantContext, member: Omit<SaccoMember, "id" | "tenantId" | "branchId" | "memberNumber" | "status" | "registeredAt">): SaccoMember {
    const id = randomUUID();
    const memberNumber = `MBR-${Math.floor(10000 + Math.random() * 90000)}`;
    const fullMember: SaccoMember = {
      ...member,
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      memberNumber,
      status: "ACTIVE",
      registeredAt: new Date().toISOString(),
    };
    this.memberMap.set(id, fullMember);
    return fullMember;
  }

  getMembers(ctx: TenantContext): SaccoMember[] {
    return Array.from(this.memberMap.values()).filter(
      (m) => m.tenantId === ctx.tenantId && m.branchId === ctx.branchId
    );
  }

  applyLoan(
    ctx: TenantContext,
    loanData: { memberId: string; productName: string; principalTzs: number; interestRatePct: number; termMonths: number }
  ): {
    loan?: SaccoLoan;
    eligibility: { eligible: boolean; maxAllowedAmountTzs: number; reasons: string[] };
  } {
    const member = this.memberMap.get(loanData.memberId);
    if (!member) throw new Error(`Member with ID '${loanData.memberId}' not found.`);

    const settings = this.getSettings(ctx);
    const eligibility = this.engine.evaluateLoanEligibility(member, loanData.principalTzs, settings);

    if (!eligibility.eligible) {
      return { eligibility };
    }

    const id = randomUUID();
    const loanNumber = `LN-${Math.floor(1000 + Math.random() * 9000)}`;
    const totalInterestTzs = Math.round(loanData.principalTzs * (loanData.interestRatePct / 100) * (loanData.termMonths / 12));
    const totalRepayableTzs = loanData.principalTzs + totalInterestTzs;
    const dueDate = new Date();
    dueDate.setMonth(dueDate.getMonth() + loanData.termMonths);

    const loan: SaccoLoan = {
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      loanNumber,
      memberId: member.id,
      memberName: member.fullName,
      productName: loanData.productName,
      principalTzs: loanData.principalTzs,
      interestRatePct: loanData.interestRatePct,
      termMonths: loanData.termMonths,
      totalInterestTzs,
      totalRepayableTzs,
      totalPaidTzs: 0,
      outstandingPrincipalTzs: loanData.principalTzs,
      status: "DISBURSED",
      disbursedAt: new Date().toISOString(),
      dueDate: dueDate.toISOString(),
    };

    this.loanMap.set(id, loan);
    return { loan, eligibility };
  }

  getLoans(ctx: TenantContext): SaccoLoan[] {
    return Array.from(this.loanMap.values()).filter(
      (l) => l.tenantId === ctx.tenantId && l.branchId === ctx.branchId
    );
  }

  getAiRecommendations(ctx: TenantContext): SaccoVicobaAiRecommendation[] {
    const members = this.getMembers(ctx);
    const loans = this.getLoans(ctx);
    const meetings = Array.from(this.meetingMap.values()).filter((m) => m.tenantId === ctx.tenantId);

    return this.engine.generateExplainableAiRecommendations(ctx, members, loans, meetings);
  }
}

export const globalSaccoVicobaService = new SaccoVicobaService();
