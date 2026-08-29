import {
  PropertyMasterRecord,
  RentableUnitRecord,
  LeaseRecord,
  RentInvoiceRecord,
  SecurityDepositAccount,
  MaintenanceWorkOrder,
  RealEstateFinancialSummary,
  UnitStatus,
} from "@kwakopos2/contracts";


export class RealEstateEngine {
  private validUnitTransitions: Record<UnitStatus, UnitStatus[]> = {
    AVAILABLE: ["RESERVED", "APPLICATION", "MAINTENANCE"],
    RESERVED: ["APPLICATION", "AVAILABLE"],
    APPLICATION: ["OCCUPIED", "AVAILABLE"],
    OCCUPIED: ["NOTICE_GIVEN", "MAINTENANCE"],
    NOTICE_GIVEN: ["VACANT", "OCCUPIED"],
    VACANT: ["MAINTENANCE", "AVAILABLE", "APPLICATION"],
    MAINTENANCE: ["AVAILABLE", "VACANT"],
  };

  public validateUnitStatusTransition(currentStatus: UnitStatus, newStatus: UnitStatus): boolean {
    if (currentStatus === newStatus) return true;
    const allowed = this.validUnitTransitions[currentStatus] || [];
    return allowed.includes(newStatus);
  }

  public calculateRentEscalation(currentRentUsd: number, escalationPct: number): number {
    if (escalationPct <= 0) return currentRentUsd;
    const escalated = currentRentUsd * (1 + escalationPct / 100);
    return Math.round(escalated * 100) / 100;
  }

  public generateIdempotentRentInvoice(
    lease: LeaseRecord,
    billingPeriod: string,
    utilityChargesUsd = 0,
    serviceChargesUsd = 0
  ): RentInvoiceRecord {
    const idempotencyKey = `RENT-${lease.id}-${billingPeriod}`;
    const baseRentUsd = lease.monthlyBaseRentUsd * lease.billingFrequencyMonths;
    const totalInvoiceUsd = baseRentUsd + utilityChargesUsd + serviceChargesUsd;

    return {
      id: `inv-${Math.random().toString(36).substring(2, 9)}`,
      invoiceNumber: `INV-${billingPeriod}-${lease.leaseNumber}`,
      leaseId: lease.id,
      tenantId: lease.tenantId,
      unitId: lease.unitId,
      billingPeriod,
      baseRentUsd,
      utilityChargesUsd,
      serviceChargesUsd,
      lateFeesUsd: 0,
      totalInvoiceUsd,
      amountPaidUsd: 0,
      balanceDueUsd: totalInvoiceUsd,
      idempotencyKey,
      status: "ISSUED",
    };
  }

  public reconcileSecurityDeposit(
    depositReceivedUsd: number,
    deductionsUsd: number,
    refundsUsd: number
  ): SecurityDepositAccount {
    const balance = depositReceivedUsd - deductionsUsd - refundsUsd;
    if (balance < 0) {
      throw new Error(`Invalid deposit reconciliation: balance cannot be negative ($${balance})`);
    }

    return {
      tenantId: "00000000-0000-0000-0000-000000000001",
      leaseId: "00000000-0000-0000-0000-000000000002",
      unitId: "00000000-0000-0000-0000-000000000003",
      depositHeldUsd: depositReceivedUsd,
      deductionsUsd,
      refundsUsd,
      currentBalanceUsd: balance,
    };
  }

  public calculatePropertyFinancialSummary(
    properties: PropertyMasterRecord[],
    invoices: RentInvoiceRecord[],
    workOrders: MaintenanceWorkOrder[],
    deposits: SecurityDepositAccount[]
  ): RealEstateFinancialSummary {
    const totalPropertiesCount = properties.length;
    const totalUnitsCount = properties.reduce((acc, p) => acc + p.totalUnitsCount, 0);
    const totalOccupiedUnits = properties.reduce((acc, p) => acc + p.occupiedUnitsCount, 0);
    const averageOccupancyRatePct =
      totalUnitsCount > 0 ? Math.round((totalOccupiedUnits / totalUnitsCount) * 1000) / 10 : 0;

    const totalRentalRevenueUsd = invoices.reduce((acc, inv) => acc + inv.amountPaidUsd, 0);
    const totalMaintenanceCostUsd = workOrders.reduce((acc, wo) => acc + wo.totalWorkOrderCostUsd, 0);
    const totalOperatingExpensesUsd = totalMaintenanceCostUsd * 1.25; // 25% overhead for property mgmt
    const netOperatingIncomeNoiUsd = totalRentalRevenueUsd - totalOperatingExpensesUsd;
    const grossMarginPct =
      totalRentalRevenueUsd > 0
        ? Math.round((netOperatingIncomeNoiUsd / totalRentalRevenueUsd) * 1000) / 10
        : 0;

    const totalDepositsHeldUsd = deposits.reduce((acc, d) => acc + d.currentBalanceUsd, 0);
    const totalOverdueRentUsd = invoices
      .filter((i) => i.status === "OVERDUE")
      .reduce((acc, i) => acc + i.balanceDueUsd, 0);

    return {
      totalPropertiesCount,
      totalUnitsCount,
      averageOccupancyRatePct,
      totalRentalRevenueUsd,
      totalOperatingExpensesUsd,
      totalMaintenanceCostUsd,
      netOperatingIncomeNoiUsd,
      grossMarginPct,
      totalDepositsHeldUsd,
      totalOverdueRentUsd,
    };
  }
}
