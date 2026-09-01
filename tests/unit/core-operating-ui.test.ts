import { describe, it, expect } from "vitest";
import { CoreOperatingUiEngine } from "@kwakopos2/domain";
import { runCoreOperatingUiCertification } from "../../scripts/certification/core-operating-ui-certification-engine.js";

describe("Phase 27 — KwakoPos Core Operating UI Test Suite", () => {
  const engine = new CoreOperatingUiEngine();

  it("should render role-specific dashboard perspectives for cashiers and finance team", () => {
    const cshDash = engine.renderRoleDashboard("CASHIER");
    expect(cshDash.role).toBe("CASHIER");
    expect(cshDash.salesToday).toBe(1850000);

    const finDash = engine.renderRoleDashboard("FINANCE");
    expect(finDash.role).toBe("FINANCE");
    expect(finDash.salesToday).toBe(12450000);
    expect(finDash.receivablesTotal).toBe(15400000);
  });

  it("should execute POS checkout and manage offline local status vs online sync status", () => {
    const onlineTx = engine.executePosCheckout(
      {
        transactionId: "TX-ONLINE-01",
        items: [{ productId: "P-101", productName: "Cement", unitPrice: 22000, quantity: 5, lineSubtotal: 110000 }],
        subtotal: 110000,
        taxTotal: 0,
        discountTotal: 0,
        grandTotal: 110000,
        paymentMethod: "CASH",
      },
      true
    );
    expect(onlineTx.syncStatus).toBe("SYNCHRONIZED");
    expect(onlineTx.createdOffline).toBe(false);

    const offlineTx = engine.executePosCheckout(
      {
        transactionId: "TX-OFFLINE-01",
        items: [{ productId: "P-101", productName: "Cement", unitPrice: 22000, quantity: 2, lineSubtotal: 44000 }],
        subtotal: 44000,
        taxTotal: 0,
        discountTotal: 0,
        grandTotal: 44000,
        paymentMethod: "MOBILE_MONEY",
      },
      false
    );
    expect(offlineTx.syncStatus).toBe("LOCAL_SAVED");
    expect(offlineTx.createdOffline).toBe(true);
  });

  it("should trace downstream financial transaction lineage from sale to ledger", () => {
    const trace = engine.traceFinancialTransaction("SALE-999");
    expect(trace.saleId).toBe("SALE-999");
    expect(trace.paymentId).toBe("PAY-SALE-999");
    expect(trace.journalId).toBe("JRN-SALE-999");
    expect(trace.ledgerId).toBe("LDG-SALE-999");
    expect(trace.status).toBe("POSTED");
  });

  it("should process approval center decisions for discounts and AI actions", () => {
    const approval = engine.processApprovalDecision("APPR-DISC-01", "APPROVED", "Manager authorized");
    expect(approval.status).toBe("APPROVED");
    expect(approval.decisionReason).toBe("Manager authorized");
  });

  it("should pass 100% of the 73-Pillar Core Operating UI certification campaign", () => {
    const cert = runCoreOperatingUiCertification();
    expect(cert.totalPillars).toBe(73);
    expect(cert.passedPillars).toBe(73);
    expect(cert.failedPillars).toBe(0);
    expect(cert.successRatePct).toBe(100);
  });
});
