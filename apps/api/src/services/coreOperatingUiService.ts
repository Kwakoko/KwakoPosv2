import {
  RoleDashboardPerspective,
  PosCartTransaction,
  FinancialTraceabilityRecord,
  Customer360Summary,
  CoreOperatingUiHealthSummary,
} from "@kwakopos2/contracts";
import { globalCoreOperatingUiEngine } from "@kwakopos2/domain";

export class CoreOperatingUiService {
  public getRoleDashboard(role: "EXECUTIVE" | "MANAGER" | "CASHIER" | "STOREKEEPER" | "FINANCE" | "ADMIN"): RoleDashboardPerspective {
    return globalCoreOperatingUiEngine.renderRoleDashboard(role);
  }

  public checkout(cart: Omit<PosCartTransaction, "syncStatus">, isOnline: boolean): PosCartTransaction {
    return globalCoreOperatingUiEngine.executePosCheckout(cart, isOnline);
  }

  public traceFinancialTransaction(saleId: string): FinancialTraceabilityRecord {
    return globalCoreOperatingUiEngine.traceFinancialTransaction(saleId);
  }

  public getCustomer360(customerId: string): Customer360Summary {
    return globalCoreOperatingUiEngine.getCustomer360(customerId);
  }

  public processApproval(approvalId: string, decision: "APPROVED" | "REJECTED", reason?: string) {
    return globalCoreOperatingUiEngine.processApprovalDecision(approvalId, decision, reason);
  }

  public getDashboardMetrics(): CoreOperatingUiHealthSummary {
    return globalCoreOperatingUiEngine.getHealthSummary();
  }
}

export const globalCoreOperatingUiService = new CoreOperatingUiService();
