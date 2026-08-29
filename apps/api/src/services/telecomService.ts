import { TelecomEngine } from "@kwakopos2/domain";
import {
  SiteHierarchyRecord,
  TechnicalAssetRecord,
  WorkOrderIncidentRecord,
  TelecomFinancialSummary,
} from "@kwakopos2/contracts";

export class TelecomService {
  private engine = new TelecomEngine();

  private mockSites: SiteHierarchyRecord[] = [
    {
      id: "site-001",
      siteCode: "ST-NAI-01",
      siteName: "Nairobi Central Fiber POP",
      customerId: "cust-01",
      address: "Harambee Avenue, Nairobi",
      gpsLatitude: -1.286389,
      gpsLongitude: 36.817223,
      siteType: "FIBER_POP",
      powerBackupType: "BATTERY_UPS",
      createdAt: "2026-01-01T00:00:00Z",
    },
  ];

  private mockAssets: TechnicalAssetRecord[] = [
    {
      id: "ast-001",
      assetTag: "AST-RTR-01",
      serialNumber: "SN-9876543210",
      macAddress: "00:1A:2B:3C:4D:5E",
      deviceModel: "Core Router 9000",
      manufacturer: "Cisco",
      siteId: "site-001",
      rackLocation: "Rack A, Unit 12",
      status: "ACTIVE",
      installationDate: "2026-02-01",
    },
  ];

  private mockWorkOrders: WorkOrderIncidentRecord[] = [
    {
      id: "wo-tel-001",
      workOrderNumber: "WO-TEL-2026-001",
      customerId: "cust-01",
      siteId: "site-001",
      assetId: "ast-001",
      issueCategory: "FIBER_CUT",
      priority: "CRITICAL",
      slaResponseTargetHours: 2,
      slaResolutionTargetHours: 4,
      assignedTechnicianId: "tech-01",
      actualResponseHours: 1.2,
      actualResolutionHours: 3.5,
      slaBreached: false,
      status: "CLOSED",
      createdAt: "2026-08-28T10:00:00Z",
    },
  ];

  public getSites(): SiteHierarchyRecord[] {
    return this.mockSites;
  }

  public getAssets(): TechnicalAssetRecord[] {
    return this.mockAssets;
  }

  public getWorkOrders(): WorkOrderIncidentRecord[] {
    return this.mockWorkOrders;
  }

  public getFinancialSummary(): TelecomFinancialSummary {
    return this.engine.calculateTelecomFinancialSummary(
      this.mockWorkOrders,
      12000,
      4500,
      3200,
      0
    );
  }
}

export const globalTelecomService = new TelecomService();
