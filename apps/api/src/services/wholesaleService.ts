import {
  SalesOrderRecord,
  CustomerCreditAccount,
  WholesaleFinancialSummary,
} from "@kwakopos2/contracts";
import { globalWholesaleEngine } from "@kwakopos2/domain";

export class WholesaleService {
  private salesOrders: SalesOrderRecord[] = [
    {
      id: "00000000-0000-0000-0000-000000000001",
      orderNumber: "SO-B2B-2026-001",
      customerId: "00000000-0000-0000-0000-000000000001",
      warehouseId: "00000000-0000-0000-0000-000000000001",
      orderStatus: "DELIVERED",
      items: [
        {
          id: "00000000-0000-0000-0000-000000000001",
          productId: "00000000-0000-0000-0000-000000000001",
          productName: "Cement 50kg Bags",
          sku: "CEM-50KG-BAG",
          unitOfMeasure: "PALLET",
          quantityOrdered: 10,
          quantityReserved: 10,
          quantityPicked: 10,
          quantityPacked: 10,
          quantityDispatched: 10,
          quantityDelivered: 10,
          unitPriceUsd: 450.0,
          totalUsd: 4500.0,
        },
      ],
      subtotalUsd: 4500.0,
      taxTotalUsd: 810.0,
      discountTotalUsd: 0.0,
      freightCostUsd: 200.0,
      grandTotalUsd: 5510.0,
      creditValidationPassed: true,
      createdAt: new Date().toISOString(),
    },
  ];

  public getSalesOrders(): SalesOrderRecord[] {
    return this.salesOrders;
  }

  public getFinancialSummary(): WholesaleFinancialSummary {
    return {
      totalOrdersCount: this.salesOrders.length,
      totalWholesaleRevenueUsd: 185000.0,
      totalCogsUsd: 120000.0,
      totalFreightCostUsd: 8500.0,
      grossProfitUsd: 56500.0,
      marginPct: 30.5,
      totalAccountsReceivableUsd: 42000.0,
      overdueReceivablesUsd: 3500.0,
    };
  }
}

export const globalWholesaleService = new WholesaleService();
