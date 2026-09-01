import { RealEstateEngine } from "@kwakopos2/domain";
import {
  PropertyMasterRecord,
  RentableUnitRecord,
  LeaseRecord,
  RentInvoiceRecord,
  SecurityDepositAccount,
  MaintenanceWorkOrder,
  RealEstateFinancialSummary,
} from "@kwakopos2/contracts";

export class RealEstateService {
  private engine = new RealEstateEngine();

  private mockProperties: PropertyMasterRecord[] = [
    {
      id: "p1111111-1111-1111-1111-111111111111",
      propertyCode: "PROP-001",
      propertyName: "Kwakopos Grand Plaza",
      propertyType: "COMMERCIAL_OFFICE",
      address: "100 Innovation Way, Nairobi",
      portfolioId: "port-1",
      propertyManagerId: "mgr-1",
      totalUnitsCount: 50,
      occupiedUnitsCount: 45,
      occupancyRatePct: 90,
      acquisitionCostUsd: 2500000,
      currentBookValueUsd: 2800000,
      createdAt: "2026-01-01T00:00:00Z",
    },
  ];

  private mockInvoices: RentInvoiceRecord[] = [
    {
      id: "inv-001",
      invoiceNumber: "INV-2026-09-L001",
      leaseId: "l1111111-1111-1111-1111-111111111111",
      tenantId: "t1111111-1111-1111-1111-111111111111",
      unitId: "u1111111-1111-1111-1111-111111111111",
      billingPeriod: "2026-09",
      baseRentUsd: 3500,
      utilityChargesUsd: 250,
      serviceChargesUsd: 150,
      lateFeesUsd: 0,
      totalInvoiceUsd: 3900,
      amountPaidUsd: 3900,
      balanceDueUsd: 0,
      idempotencyKey: "RENT-l1-2026-09",
      status: "PAID",
    },
  ];

  private mockWorkOrders: MaintenanceWorkOrder[] = [
    {
      id: "wo-001",
      workOrderNumber: "WO-PROP-001",
      propertyId: "p1111111-1111-1111-1111-111111111111",
      unitId: "u1111111-1111-1111-1111-111111111111",
      category: "HVAC",
      priority: "ROUTINE",
      partsCostUsd: 200,
      laborCostUsd: 150,
      vendorCostUsd: 0,
      totalWorkOrderCostUsd: 350,
      status: "COMPLETED",
    },
  ];

  private mockDeposits: SecurityDepositAccount[] = [
    {
      tenantId: "t1111111-1111-1111-1111-111111111111",
      leaseId: "l1111111-1111-1111-1111-111111111111",
      unitId: "u1111111-1111-1111-1111-111111111111",
      depositHeldUsd: 3500,
      deductionsUsd: 0,
      refundsUsd: 0,
      currentBalanceUsd: 3500,
    },
  ];

  public getProperties(): PropertyMasterRecord[] {
    return this.mockProperties;
  }

  public getFinancialSummary(): RealEstateFinancialSummary {
    return this.engine.calculatePropertyFinancialSummary(
      this.mockProperties,
      this.mockInvoices,
      this.mockWorkOrders,
      this.mockDeposits
    );
  }
}

export const globalRealEstateService = new RealEstateService();
