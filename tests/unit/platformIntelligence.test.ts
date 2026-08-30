import { describe, it, expect, beforeEach } from "vitest";
import { PlatformIntelligenceEngine } from "@kwakopos2/domain";

describe("Phase 44 — KwakoPos Platform Intelligence OS (KPIOL v1.0.0)", () => {
  let engine: PlatformIntelligenceEngine;

  beforeEach(() => {
    engine = new PlatformIntelligenceEngine();
  });

  it("should ingest cross-domain signals, generate recommendations, evaluate scenarios, and track metrics", () => {
    const sig = engine.ingestSignal({
      signalId: "SIG-CASH-01", tenantId: "TEN-01", signalType: "CASH_FLOW_PRESSURE",
      severity: "CRITICAL", confidenceScore: 0.98, evidenceSummary: "High payables vs low receivables",
      affectedDomain: "TREASURY",
    });
    expect(sig.success).toBe(true);

    const rec = engine.generateRecommendation({
      recommendationId: "REC-101", signalId: "SIG-CASH-01", tenantId: "TEN-01",
      recommendedAction: "Negotiate vendor terms by 15 days", financialImpactTzs: 2000000,
      riskAssessment: "LOW_RISK", isAutoActionable: false,
    });
    expect(rec.success).toBe(true);

    const acc = engine.acceptRecommendation("REC-101", "USR-CFO");
    expect(acc.success).toBe(true);
    expect(acc.recommendation?.status).toBe("ACCEPTED");

    const sc = engine.evaluateScenario("TEN-01", "EXPANSION_30", 30);
    expect(sc.predictedRevenueImpactTzs).toBe(3000000);

    const hs = engine.getHealthSummary("TEN-01");
    expect(hs.engineOperational).toBe(true);
    expect(hs.ingestedSignalsCount).toBe(1);
    expect(hs.acceptedRecommendationsCount).toBe(1);
  });
});
