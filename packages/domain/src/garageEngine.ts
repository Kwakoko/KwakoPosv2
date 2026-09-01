import {
  VehicleMasterRecord,
  JobCardRecord,
  EstimateRecord,
  PartsReservationItem,
  LaborTimeRecord,
  PredictiveMaintenanceAlert,
  GarageFinancialSummary,
} from "@kwakopos2/contracts";
import { randomUUID } from "crypto";

export class GarageEngine {
  /**
   * Transfers vehicle ownership while permanently preserving vehicle UUID and historical service chain.
   */
  public transferVehicleOwnership(
    vehicle: VehicleMasterRecord,
    newCustomerId: string,
    newRegistrationNumber?: string
  ): VehicleMasterRecord {
    return {
      ...vehicle,
      customerId: newCustomerId,
      registrationNumber: newRegistrationNumber || vehicle.registrationNumber,
    };
  }

  /**
   * Evaluates whether actual Job Card costs exceed approved estimate limits.
   */
  public isEstimateOverrun(estimate: EstimateRecord, actualCostUsd: number, overrunThresholdPct = 10): boolean {
    if (estimate.approvalStatus !== "APPROVED") return true; // Work cannot proceed without approval
    const allowedCost = estimate.grandTotalUsd * (1 + overrunThresholdPct / 100);
    return actualCostUsd > allowedCost;
  }

  /**
   * Calculates labor cost vs billing revenue for technician work.
   */
  public calculateLaborCostAndRevenue(
    hoursSpent: number,
    costRatePerHour: number,
    billingRatePerHour: number
  ): { laborCostUsd: number; laborRevenueUsd: number; grossProfitUsd: number } {
    const laborCostUsd = Math.round(hoursSpent * costRatePerHour * 100) / 100;
    const laborRevenueUsd = Math.round(hoursSpent * billingRatePerHour * 100) / 100;
    const grossProfitUsd = Math.round((laborRevenueUsd - laborCostUsd) * 100) / 100;
    return { laborCostUsd, laborRevenueUsd, grossProfitUsd };
  }

  /**
   * Generates predictive maintenance alerts based on mileage and service interval.
   */
  public generatePredictiveMaintenanceAlert(vehicle: VehicleMasterRecord): PredictiveMaintenanceAlert | null {
    const kmSinceLastService = vehicle.currentMileageKm % vehicle.serviceIntervalKm;
    const kmDueIn = vehicle.serviceIntervalKm - kmSinceLastService;

    if (kmDueIn <= 1000) {
      const riskLevel = kmDueIn <= 0 ? "CRITICAL" : kmDueIn <= 500 ? "HIGH" : "MEDIUM";
      return {
        vehicleId: vehicle.id,
        componentName: "Scheduled Major Service & Fluid Change",
        failureRiskLevel: riskLevel,
        evidenceReason: `Vehicle has reached ${vehicle.currentMileageKm} km (Service Interval: ${vehicle.serviceIntervalKm} km).`,
        recommendedServiceWindowKm: vehicle.currentMileageKm + Math.max(0, kmDueIn),
        estimatedRepairCostUsd: 250.0,
      };
    }
    return null;
  }

  /**
   * Calculates total work order / job card cost.
   */
  public calculateWorkOrderCost(
    partsCostTotal: number,
    laborHoursOrTotal: number,
    laborRate = 0,
    discountUsd = 0
  ): { partsCostTotal: number; laborCostTotal: number; grandTotal: number } {
    const laborCostTotal = laborRate > 0 ? laborHoursOrTotal * laborRate : laborHoursOrTotal;
    const grandTotal = Math.round((partsCostTotal + laborCostTotal - discountUsd) * 100) / 100;
    return { partsCostTotal, laborCostTotal, grandTotal };
  }

  /**
   * Asserts whether Quality Control QA signoff is allowed before vehicle release.
   */
  public assertQaSignoffAllowed(jobCard: { status: string; isQualityPassed?: boolean }): boolean {
    const allowedStatuses = ["QA_REVIEW", "REPAIR_COMPLETED", "TESTING"];
    if (!allowedStatuses.includes(jobCard.status)) {
      throw new Error(`GARAGE_VIOLATION: Cannot QA signoff work order in status ${jobCard.status}`);
    }
    return true;
  }

  /**
   * Validates financial reconciliation invariant for a Job Card:
   * Invoice Total = Parts Total + Labor Total + Tax - Discount
   */
  public reconcileJobCardFinancials(
    partsTotalUsd: number,
    laborTotalUsd: number,
    taxTotalUsd: number,
    discountTotalUsd: number,
    invoiceTotalUsd: number
  ): { isReconciled: boolean; expectedTotalUsd: number; varianceUsd: number } {
    const expectedTotalUsd = Math.round((partsTotalUsd + laborTotalUsd + taxTotalUsd - discountTotalUsd) * 100) / 100;
    const varianceUsd = Math.round(Math.abs(expectedTotalUsd - invoiceTotalUsd) * 100) / 100;
    return {
      isReconciled: varianceUsd === 0,
      expectedTotalUsd,
      varianceUsd,
    };
  }
}

export const globalGarageEngine = new GarageEngine();

