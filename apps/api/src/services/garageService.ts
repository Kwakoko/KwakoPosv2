import {
  VehicleMasterRecord,
  JobCardRecord,
  EstimateRecord,
  CheckInIntakeRecord,
  GarageFinancialSummary,
} from "@kwakopos2/contracts";
import { globalGarageEngine } from "@kwakopos2/domain";
import { randomUUID } from "crypto";

export class GarageService {
  private vehicles: VehicleMasterRecord[] = [
    {
      id: "00000000-0000-0000-0000-000000000001",
      registrationNumber: "T123 ABC",
      vinChassisNumber: "JT111ABC987654321",
      make: "Toyota",
      model: "Land Cruiser Hardtop",
      year: 2022,
      vehicleClass: "CAR",
      fuelType: "DIESEL",
      transmission: "MANUAL",
      currentMileageKm: 45000,
      customerId: "00000000-0000-0000-0000-000000000001",
      serviceIntervalKm: 10000,
      warrantyStatus: "UNDER_WARRANTY",
      createdAt: new Date().toISOString(),
    },
  ];

  private jobCards: JobCardRecord[] = [
    {
      id: "00000000-0000-0000-0000-000000000001",
      jobNumber: "JOB-2026-0001",
      customerId: "00000000-0000-0000-0000-000000000001",
      vehicleId: "00000000-0000-0000-0000-000000000001",
      status: "IN_PROGRESS",
      checkInMileageKm: 45000,
      customerComplaints: ["Brake noise during deceleration", "Annual major service due"],
      approvedCostUsd: 450.0,
      actualCostUsd: 420.0,
      isReleased: false,
      createdAt: new Date().toISOString(),
    },
  ];

  public getVehicles(): VehicleMasterRecord[] {
    return this.vehicles;
  }

  public getJobCards(): JobCardRecord[] {
    return this.jobCards;
  }

  public getFinancialSummary(): GarageFinancialSummary {
    return {
      totalJobCardsCount: this.jobCards.length,
      totalPartsRevenueUsd: 25000.0,
      totalPartsCostUsd: 14000.0,
      totalLaborRevenueUsd: 18000.0,
      totalLaborCostUsd: 7500.0,
      grossMarginUsd: 21500.0,
      marginPct: 50.0,
    };
  }
}

export const globalGarageService = new GarageService();
