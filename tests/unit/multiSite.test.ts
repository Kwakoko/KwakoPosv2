import { describe, it, expect, beforeEach } from "vitest";
import { MultiSiteEngine } from "@kwakopos2/domain";

describe("Phase 44 — KwakoPos Multi-Site OS (KMAOL v1.0.0)", () => {
  let engine: MultiSiteEngine;

  beforeEach(() => {
    engine = new MultiSiteEngine();
  });

  it("should create organization hierarchy and consolidate financial metrics", () => {
    const h = engine.createOrganizationNode({
      nodeId: "HOLD-1", tenantId: "TEN-01", name: "Mega Corp", level: "HOLDING_COMPANY",
    });
    expect(h.success).toBe(true);

    const b = engine.createOrganizationNode({
      nodeId: "BR-1", tenantId: "TEN-01", parentId: "HOLD-1", name: "Dar Branch", level: "BRANCH",
    });
    expect(b.success).toBe(true);

    const m = engine.recordConsolidatedMetric({
      recordId: "MET-1", tenantId: "TEN-01", nodeId: "BR-1", periodDate: "2026-08-01",
      totalSalesVolume: 80000000, totalNetProfit: 16000000, activeEmployeeCount: 20,
    });
    expect(m.success).toBe(true);

    const hs = engine.getHealthSummary("TEN-01");
    expect(hs.engineOperational).toBe(true);
    expect(hs.totalConsolidatedSalesVolume).toBe(80000000);
  });
});
