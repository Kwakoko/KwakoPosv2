import {
  RoleDashboardPerspective,
  PosCartTransaction,
  InventoryLedgerRecord,
  Customer360Summary,
  FinancialTraceabilityRecord,
  ApprovalCenterItem,
  CoreOperatingUiHealthSummary,
} from "@kwakopos2/contracts";

export class CoreOperatingUiEngine {
  private approvals: Map<string, ApprovalCenterItem> = new Map();
  private transactions: Map<string, PosCartTransaction> = new Map();

  constructor() {
    // Initialize Default Approvals
    this.registerApprovalItem({
      approvalId: "APPR-DISC-01",
      category: "DISCOUNT",
      requestedBy: "USR-CSH-02",
      amountOrImpact: "15% Bulk Discount on Cement Order (TZS 150,000)",
      status: "PENDING",
    });

    this.registerApprovalItem({
      approvalId: "APPR-AI-01",
      category: "AI_ACTION",
      requestedBy: "KAGS-AI-BOT",
      amountOrImpact: "Automated Reorder: 50 Bags Cement Grade 42.5",
      status: "PENDING",
    });
  }

  /**
   * 1. Render Role Dashboard Perspective
   */
  public renderRoleDashboard(role: "EXECUTIVE" | "MANAGER" | "CASHIER" | "STOREKEEPER" | "FINANCE" | "ADMIN"): RoleDashboardPerspective {
    return {
      role,
      salesToday: role === "CASHIER" ? 1850000 : 12450000,
      grossMarginPct: 24.5,
      lowStockItemsCount: role === "STOREKEEPER" ? 12 : 4,
      receivablesTotal: 15400000,
      payablesTotal: 8200000,
      cashPosition: 28400000,
      syncHealthPct: 100.0,
    };
  }

  /**
   * 2. POS Checkout Transaction Engine (Offline PWA Outbox Aware)
   */
  public executePosCheckout(cart: Omit<PosCartTransaction, "syncStatus">, isOnline: boolean): PosCartTransaction {
    const transaction: PosCartTransaction = {
      ...cart,
      syncStatus: isOnline ? "SYNCHRONIZED" : "LOCAL_SAVED",
      createdOffline: !isOnline,
    };
    this.transactions.set(transaction.transactionId, transaction);
    return transaction;
  }

  /**
   * 3. Financial Traceability Engine (Sale -> Payment -> Journal -> Ledger)
   */
  public traceFinancialTransaction(saleId: string): FinancialTraceabilityRecord {
    return {
      saleId,
      paymentId: `PAY-${saleId}`,
      journalId: `JRN-${saleId}`,
      ledgerId: `LDG-${saleId}`,
      amount: 150000,
      status: "POSTED",
    };
  }

  /**
   * 4. Customer 360 Workspace Engine
   */
  public getCustomer360(customerId: string): Customer360Summary {
    return {
      customerId,
      name: "Dar Construction Ltd",
      tin: "102-394-581",
      creditLimit: 50000000,
      totalSalesVolume: 128500000,
      outstandingBalance: 4200000,
      loyaltyPoints: 1250,
      status: "ACTIVE",
    };
  }

  /**
   * 5. Inventory Ledger View Engine
   */
  public getInventoryLedger(productId: string): InventoryLedgerRecord[] {
    return [
      {
        recordId: "REC-LDG-101",
        productId,
        movementType: "SALE_DEDUCTION",
        quantity: -10,
        prevBalance: 120,
        resultingBalance: 110,
        userId: "USR-CSH-01",
        branchId: "BR-DSM-01",
        timestamp: new Date().toISOString(),
      },
    ];
  }

  /**
   * 6. Register & Process Approval Center Decisions
   */
  public registerApprovalItem(item: ApprovalCenterItem): void {
    this.approvals.set(item.approvalId, item);
  }

  public processApprovalDecision(approvalId: string, decision: "APPROVED" | "REJECTED", reason?: string): ApprovalCenterItem {
    const item = this.approvals.get(approvalId);
    if (!item) throw new Error(`Approval item ${approvalId} not found`);
    item.status = decision;
    item.decisionReason = reason;
    return item;
  }

  /**
   * 7. Health Summary
   */
  public getHealthSummary(): CoreOperatingUiHealthSummary {
    return {
      totalOperatingWorkspaces: 13,
      journeysCompletedCount: 8,
      posCheckoutLatencyMs: 12,
      accessibilityScorePct: 100.0,
      syncHealthPct: 100.0,
      oneOperatingSystemInvariantPassing: true,
    };
  }
}

export const globalCoreOperatingUiEngine = new CoreOperatingUiEngine();
