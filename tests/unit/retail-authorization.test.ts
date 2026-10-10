import { describe, expect, it } from "vitest";
import { assertRetailCapability, hasRetailCapability } from "../../apps/api/src/services/retailAuthorization.js";
import type { TenantContext } from "@kwakopos2/contracts";

const context = (permissions: string[], roles: string[] = ["CASHIER"]): TenantContext => ({
  tenantId: "00000000-0000-0000-0000-000000000001",
  branchId: "00000000-0000-0000-0000-000000000002",
  userId: "00000000-0000-0000-0000-000000000003",
  roles,
  permissions,
});

describe("Retail API capability authorization", () => {
  it("allows a specifically granted retail AI insights capability", () => {
    expect(hasRetailCapability(context(["RETAIL_AI_INSIGHTS_VIEW"]), "RETAIL_AI_INSIGHTS_VIEW")).toBe(true);
  });

  it("accepts only configured legacy aliases", () => {
    expect(hasRetailCapability(context(["retail.replenishment.view"]), "RETAIL_REPLENISHMENT_EXECUTE", ["retail.replenishment.view"])).toBe(true);
  });

  it("denies retail AI insights when the capability is missing", () => {
    expect(hasRetailCapability(context(["RETAIL_POS_CHECKOUT"]), "RETAIL_AI_INSIGHTS_VIEW")).toBe(false);
    expect(() => assertRetailCapability(context(["RETAIL_POS_CHECKOUT"]), "RETAIL_AI_INSIGHTS_VIEW")).toThrow(/FORBIDDEN/);
  });

  it("allows administrators and explicit Retail wildcards", () => {
    expect(hasRetailCapability(context([], ["ADMIN"]), "RETAIL_AI_INSIGHTS_VIEW")).toBe(true);
    expect(hasRetailCapability(context(["retail.*"]), "RETAIL_REPLENISHMENT_EXECUTE")).toBe(true);
  });

  it("fails closed without a complete tenant context", () => {
    expect(hasRetailCapability(undefined, "RETAIL_AI_INSIGHTS_VIEW")).toBe(false);
  });
});
