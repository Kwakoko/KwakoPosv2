import { randomUUID } from "crypto";
import type {
  TenantContext,
  LawFirmModuleManifest,
  LawFirmSettings,
  LegalMatter,
  ConflictCheckResult,
  LegalDeadline,
  TimeEntry,
  TrustAccountTransaction,
  LawFirmAiRecommendation,
} from "@kwakopos2/contracts";

export class LawFirmOperatingEngine {
  getModuleManifest(): LawFirmModuleManifest {
    return {
      moduleId: "law_firm_operating_system",
      name: "KwakoPos Enterprise Law Firm Operating System",
      version: "2.2.0",
      status: "ACTIVE",
      supportedPracticeAreas: [
        "LITIGATION",
        "CORPORATE",
        "COMMERCIAL",
        "CONVEYANCING_PROPERTY",
        "EMPLOYMENT",
        "FAMILY",
        "IMMIGRATION",
        "TAX",
        "INTELLECTUAL_PROPERTY",
        "BANKING_FINANCE",
        "ARBITRATION",
      ],
      permissions: [
        "LAWFIRM_CLIENT_VIEW",
        "LAWFIRM_CLIENT_MANAGE",
        "LAWFIRM_MATTER_VIEW",
        "LAWFIRM_MATTER_MANAGE",
        "LAWFIRM_CONFLICT_CHECK",
        "LAWFIRM_DEADLINE_MANAGE",
        "LAWFIRM_TIMETRACK_MANAGE",
        "LAWFIRM_BILLING_MANAGE",
        "LAWFIRM_TRUST_FUNDS_MANAGE",
        "LAWFIRM_AI_RESEARCH_VIEW",
      ],
      navigationRoutes: [
        "/law-firm/matters",
        "/law-firm/clients",
        "/law-firm/conflicts",
        "/law-firm/deadlines",
        "/law-firm/time-tracking",
        "/law-firm/billing",
        "/law-firm/trust-accounts",
        "/law-firm/ai-insights",
      ],
      dashboardWidgetIds: [
        "widget_open_matters",
        "widget_critical_deadlines",
        "widget_unbilled_time",
        "widget_trust_fund_balances",
        "widget_matter_profitability",
      ],
    };
  }

  getDefaultSettings(tenantId: string, branchId: string): LawFirmSettings {
    return {
      tenantId,
      branchId,
      currency: "TZS",
      requireConflictCheckBeforeMatterOpen: true,
      defaultHourlyRateTzs: 250000,
      segregateClientTrustFunds: true,
      autoEscalateMissedDeadlines: true,
    };
  }

  performConflictCheck(
    ctx: TenantContext,
    targetName: string,
    existingMatters: LegalMatter[]
  ): ConflictCheckResult {
    const cleanTarget = targetName.trim().toLowerCase();
    const matchingEntities: string[] = [];

    for (const m of existingMatters) {
      if (m.clientName.toLowerCase().includes(cleanTarget)) {
        matchingEntities.push(`Existing Client in Matter #${m.matterNumber}: '${m.title}'`);
      }
      if (m.opposingParty && m.opposingParty.toLowerCase().includes(cleanTarget)) {
        matchingEntities.push(`Existing Opposing Party in Matter #${m.matterNumber}: '${m.title}'`);
      }
    }

    const hasConflict = matchingEntities.length > 0;

    return {
      id: `CONF-${randomUUID().slice(0, 6)}`,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      searchedName: targetName,
      hasConflict,
      matchingEntities,
      reviewedByUserId: ctx.userId,
      decision: hasConflict ? "DECLINED_CONFLICT_EXISTS" : "APPROVED_NO_CONFLICT",
      timestamp: new Date().toISOString(),
    };
  }

  calculateTimeEntryBilling(
    durationHours: number,
    hourlyRateTzs: number,
    isBillable: boolean = true
  ): {
    totalBillableTzs: number;
  } {
    if (!isBillable) return { totalBillableTzs: 0 };
    const total = Math.round(durationHours * hourlyRateTzs);
    return { totalBillableTzs: total };
  }

  reconcileTrustAccount(
    deposit: number,
    withdrawals: number,
    fees: number
  ): {
    trustBalance: number;
    segregated: boolean;
  } {
    // Client Trust Funds Must Never Go Below 0
    const trustBalance = deposit - withdrawals - fees;
    if (trustBalance < 0) {
      throw new Error(`Trust Account Violation! Client trust funds balance cannot be negative (${trustBalance} TZS).`);
    }
    return {
      trustBalance: Math.round(trustBalance),
      segregated: true,
    };
  }

  calculateLimitationDeadline(incidentDateStr: string, limitationYears: number = 3): string {
    const d = new Date(incidentDateStr);
    d.setFullYear(d.getFullYear() + limitationYears);
    return d.toISOString();
  }

  generateExplainableAiRecommendations(
    ctx: TenantContext,
    matters: LegalMatter[],
    deadlines: LegalDeadline[],
    timeEntries: TimeEntry[]
  ): LawFirmAiRecommendation[] {
    const recs: LawFirmAiRecommendation[] = [];
    const now = new Date().toISOString();

    // 1. Critical Deadline Risk
    const criticalDeadlines = deadlines.filter(
      (d) => d.isCritical && d.status === "PENDING" && new Date(d.dueDate).getTime() - new Date().getTime() < 7 * 24 * 60 * 60 * 1000
    );
    if (criticalDeadlines.length > 0) {
      recs.push({
        id: `REC-LAW-DEAD-${randomUUID().slice(0, 6)}`,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        category: "DEADLINE_LIMITATION_RISK",
        observation: `${criticalDeadlines.length} critical court/limitation deadlines due within 7 days.`,
        evidence: `Matter #${criticalDeadlines[0].matterId} has court filing due on ${criticalDeadlines[0].dueDate}.`,
        recommendation: "Assign senior litigation associate to complete court filings immediately.",
        expectedImpact: "Prevents default judgment or statutory limitation bar.",
        confidenceScore: 98,
        createdAt: now,
      });
    }

    // 2. Unbilled Time Leakage
    const unbilledTime = timeEntries.filter((t) => t.isBillable && t.status === "APPROVED");
    const unbilledTotal = unbilledTime.reduce((a, b) => a + b.totalBillableTzs, 0);
    if (unbilledTotal > 2000000) {
      recs.push({
        id: `REC-LAW-TIME-${randomUUID().slice(0, 6)}`,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        category: "UNBILLED_TIME_LEAKAGE",
        observation: `Approved unbilled time total reached ${unbilledTotal.toLocaleString()} TZS.`,
        evidence: `${unbilledTime.length} approved time entries pending invoice generation across active matters.`,
        recommendation: "Generate draft invoices for approved fee entries.",
        expectedImpact: `Accelerates cash collection of ${unbilledTotal.toLocaleString()} TZS legal fees.`,
        confidenceScore: 95,
        createdAt: now,
      });
    }

    return recs;
  }
}

export const globalLawFirmOperatingEngine = new LawFirmOperatingEngine();
