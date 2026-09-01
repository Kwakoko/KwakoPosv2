import {
  VerticalPmfSummaryProfile,
  PmfHealthScoreInput,
  PmfHealthScoreOutput,
  CohortRetentionRecord,
  CustomerFeedbackRecord,
} from "@kwakopos2/contracts";
import { globalPmfValidationEngine, FalsePmfAnomalyAlert } from "@kwakopos2/domain";
import { randomUUID } from "crypto";

export class PmfValidationService {
  private flagshipPmfProfiles: VerticalPmfSummaryProfile[] = [
    {
      verticalId: "retail",
      displayName: "Retail Operating System",
      northStarMetricName: "Reconciled Active Sales",
      northStarValue: "142,500 Sales / Month",
      activationRatePct: 88.5,
      ttfvDaysAverage: 1.2,
      wauTenantsCount: 145,
      cohortRetentionW4Pct: 84.0,
      featureAdoptionRatePct: 78.0,
      supportCostPerCustomerUsd: 12.0,
      monthlyChurnPct: 1.8,
      operationalReliabilityPct: 99.8,
      pmfHealthScore: 89,
      pmfState: "PROVEN",
      investmentAction: "DOUBLE_DOWN",
    },
    {
      verticalId: "restaurant",
      displayName: "Restaurant Operating System",
      northStarMetricName: "Completed Digital Kitchen Orders",
      northStarValue: "88,200 Orders / Month",
      activationRatePct: 82.0,
      ttfvDaysAverage: 1.8,
      wauTenantsCount: 98,
      cohortRetentionW4Pct: 79.5,
      featureAdoptionRatePct: 74.0,
      supportCostPerCustomerUsd: 18.0,
      monthlyChurnPct: 2.2,
      operationalReliabilityPct: 99.5,
      pmfHealthScore: 84,
      pmfState: "PROVEN",
      investmentAction: "DOUBLE_DOWN",
    },
    {
      verticalId: "pharmacy",
      displayName: "Pharmacy Management OS",
      northStarMetricName: "Controlled Dispensing Transactions",
      northStarValue: "64,100 Dispenses / Month",
      activationRatePct: 85.0,
      ttfvDaysAverage: 2.1,
      wauTenantsCount: 72,
      cohortRetentionW4Pct: 86.0,
      featureAdoptionRatePct: 81.0,
      supportCostPerCustomerUsd: 15.0,
      monthlyChurnPct: 1.4,
      operationalReliabilityPct: 99.9,
      pmfHealthScore: 88,
      pmfState: "PROVEN",
      investmentAction: "DOUBLE_DOWN",
    },
    {
      verticalId: "lawfirm",
      displayName: "Law Firm Management OS",
      northStarMetricName: "Active Matters with Billable Activity",
      northStarValue: "3,400 Matters / Month",
      activationRatePct: 76.0,
      ttfvDaysAverage: 3.5,
      wauTenantsCount: 45,
      cohortRetentionW4Pct: 78.0,
      featureAdoptionRatePct: 69.0,
      supportCostPerCustomerUsd: 20.0,
      monthlyChurnPct: 2.5,
      operationalReliabilityPct: 99.6,
      pmfHealthScore: 78,
      pmfState: "PROMISING",
      investmentAction: "OPTIMIZE",
    },
    {
      verticalId: "saccovicoba",
      displayName: "SACCO / VICOBA Operating System",
      northStarMetricName: "Active Members Performing Financial Activity",
      northStarValue: "52,000 Members Active",
      activationRatePct: 91.0,
      ttfvDaysAverage: 1.5,
      wauTenantsCount: 110,
      cohortRetentionW4Pct: 92.0,
      featureAdoptionRatePct: 84.0,
      supportCostPerCustomerUsd: 18.0,
      monthlyChurnPct: 1.1,
      operationalReliabilityPct: 99.7,
      pmfHealthScore: 92,
      pmfState: "PROVEN",
      investmentAction: "DOUBLE_DOWN",
    },
    {
      verticalId: "microfinance",
      displayName: "Microfinance & Lending OS",
      northStarMetricName: "Active Loans with Healthy Repayment",
      northStarValue: "18,900 Active Loans",
      activationRatePct: 87.0,
      ttfvDaysAverage: 2.0,
      wauTenantsCount: 64,
      cohortRetentionW4Pct: 88.0,
      featureAdoptionRatePct: 82.0,
      supportCostPerCustomerUsd: 22.0,
      monthlyChurnPct: 1.5,
      operationalReliabilityPct: 99.8,
      pmfHealthScore: 90,
      pmfState: "PROVEN",
      investmentAction: "DOUBLE_DOWN",
    },
    {
      verticalId: "poultrylivestock",
      displayName: "Poultry & Livestock Operating System",
      northStarMetricName: "Active Production Cycles",
      northStarValue: "1,250 Active Batches",
      activationRatePct: 74.0,
      ttfvDaysAverage: 4.0,
      wauTenantsCount: 38,
      cohortRetentionW4Pct: 72.0,
      featureAdoptionRatePct: 65.0,
      supportCostPerCustomerUsd: 10.0,
      monthlyChurnPct: 3.1,
      operationalReliabilityPct: 99.4,
      pmfHealthScore: 73,
      pmfState: "PROMISING",
      investmentAction: "OPTIMIZE",
    },
    {
      verticalId: "vehiclefleet",
      displayName: "Vehicle & Fleet Management OS",
      northStarMetricName: "Active Vehicles with Operational Tracking",
      northStarValue: "4,800 Active Vehicles",
      activationRatePct: 83.0,
      ttfvDaysAverage: 2.8,
      wauTenantsCount: 52,
      cohortRetentionW4Pct: 82.0,
      featureAdoptionRatePct: 76.0,
      supportCostPerCustomerUsd: 19.0,
      monthlyChurnPct: 2.0,
      operationalReliabilityPct: 99.6,
      pmfHealthScore: 83,
      pmfState: "PROVEN",
      investmentAction: "DOUBLE_DOWN",
    },
    {
      verticalId: "hardware",
      displayName: "Hardware & Building Materials OS",
      northStarMetricName: "Recurring Contractor Transactions",
      northStarValue: "31,000 Transactions / Month",
      activationRatePct: 86.0,
      ttfvDaysAverage: 1.6,
      wauTenantsCount: 88,
      cohortRetentionW4Pct: 85.0,
      featureAdoptionRatePct: 79.0,
      supportCostPerCustomerUsd: 14.0,
      monthlyChurnPct: 1.6,
      operationalReliabilityPct: 99.7,
      pmfHealthScore: 87,
      pmfState: "PROVEN",
      investmentAction: "DOUBLE_DOWN",
    },
    {
      verticalId: "electronics",
      displayName: "Advanced Electronics & Device Lifecycle OS",
      northStarMetricName: "Serialised Device Transactions",
      northStarValue: "24,500 Devices / Month",
      activationRatePct: 84.0,
      ttfvDaysAverage: 1.9,
      wauTenantsCount: 79,
      cohortRetentionW4Pct: 83.0,
      featureAdoptionRatePct: 77.0,
      supportCostPerCustomerUsd: 16.0,
      monthlyChurnPct: 1.9,
      operationalReliabilityPct: 99.6,
      pmfHealthScore: 85,
      pmfState: "PROVEN",
      investmentAction: "DOUBLE_DOWN",
    },
  ];

  private feedbackRecords: CustomerFeedbackRecord[] = [];

  public getAllVerticalPmfProfiles(): VerticalPmfSummaryProfile[] {
    return this.flagshipPmfProfiles;
  }

  public evaluatePmfHealth(input: PmfHealthScoreInput): PmfHealthScoreOutput {
    return globalPmfValidationEngine.calculatePmfHealthScore(input);
  }

  public getCohortRetention(verticalId: string): CohortRetentionRecord {
    return {
      verticalId,
      cohortPeriod: "2026-Q1",
      initialCount: 100,
      week1Pct: 95.0,
      week2Pct: 90.0,
      week4Pct: 84.0,
      week8Pct: 81.0,
      week12Pct: 79.0,
      month6Pct: 76.0,
      month12Pct: 72.0,
    };
  }

  public getFalsePmfAnomalies(): FalsePmfAnomalyAlert[] {
    const alerts: FalsePmfAnomalyAlert[] = [];

    for (const p of this.flagshipPmfProfiles) {
      const input: PmfHealthScoreInput = {
        verticalId: p.verticalId,
        cohortRetentionPct: p.cohortRetentionW4Pct,
        recurringRevenueUsd: 8500,
        activationRatePct: p.activationRatePct,
        weeklyActiveUsersCount: p.wauTenantsCount,
        workflowAdoptionRatePct: p.featureAdoptionRatePct,
        operationalReliabilityPct: p.operationalReliabilityPct,
        supportTicketsPerCustomer: p.supportCostPerCustomerUsd > 18 ? 3.5 : 1.2,
        monthlyChurnRatePct: p.monthlyChurnPct,
      };
      alerts.push(...globalPmfValidationEngine.detectFalsePmfAnomalies(input));
    }

    return alerts;
  }

  public submitCustomerFeedback(
    tenantId: string,
    verticalId: string,
    rawContent: string,
    sourceChannel: "IN_APP" | "SUPPORT_TICKET" | "INTERVIEW" | "TELEMETRY" = "IN_APP"
  ): CustomerFeedbackRecord {
    const category = globalPmfValidationEngine.classifyCustomerFeedback(rawContent);
    const record: CustomerFeedbackRecord = {
      id: randomUUID(),
      tenantId,
      verticalId,
      category,
      rawContent,
      sourceChannel,
      status: "OPEN",
      createdAt: new Date().toISOString(),
    };
    this.feedbackRecords.push(record);
    return record;
  }
}

export const globalPmfValidationService = new PmfValidationService();
