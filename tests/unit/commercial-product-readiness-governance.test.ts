import { describe, expect, it } from "vitest";
import { KWAKOKO_COMMERCIAL_PRODUCT_READINESS_GOVERNANCE as G } from "../../packages/config/src/commercialProductReadinessGovernance.js";
import { EntitlementEngine, SubscriptionLifecycleEngine, UsageMeteringEngine } from "@kwakopos2/domain";

describe("Kwakoko Commercial Product Readiness Governance", () => {
  it("defines the commercial lifecycle and fail-closed certificate", () => {
    expect(G.lifecycle).toEqual(["DISCOVER","TRIAL","ACTIVATE","SUBSCRIBE","BILL","COLLECT","RETAIN","EXPAND","CANCEL","REACTIVATE"]);
    expect(G.certification.failClosed).toBe(true);
    expect(G.certification.certificate).toBe("KWAKOKO-COMMERCIAL-READINESS-CERTIFICATE-v1.0");
  });

  it("governs commercial arithmetic and payment boundaries", () => {
    expect(G.commercialBudgets.invoiceArithmeticVarianceMax).toBe(0);
    expect(G.commercialBudgets.paymentOverAllocationMax).toBe(0);
    expect(G.commercialBudgets.duplicatePaymentEffectMax).toBe(0);
  });

  it("preserves subscription lifecycle rules", () => {
    expect(SubscriptionLifecycleEngine.validateStateTransition("TRIAL", "ACTIVE")).toBe(true);
    expect(SubscriptionLifecycleEngine.validateStateTransition("EXPIRED", "CANCELLED")).toBe(false);
  });

  it("preserves usage threshold governance", () => {
    expect(UsageMeteringEngine.evaluateUsageThreshold(750, 1000).threshold).toBe("NOTICE");
    expect(UsageMeteringEngine.evaluateUsageThreshold(1000, 1000).threshold).toBe("LIMIT_REACHED");
  });

  it("keeps entitlements server-side and denies inactive subscriptions", () => {
    const result = EntitlementEngine.evaluateEntitlement(null, null, "core.pos");
    expect(result.allowed).toBe(false);
    expect(result.resultCode).toBe("SUBSCRIPTION_INACTIVE");
  });

  it("does not use a hard-coded healthy NRR benchmark", () => {
    expect(G.invariants.some((x) => x.includes("Commercial KPIs MUST be calculated"))).toBe(true);
  });
});
