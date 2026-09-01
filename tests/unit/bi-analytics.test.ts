import { describe, it, expect } from "vitest";
import { BiAnalyticsEngine } from "@kwakopos2/domain";
import { runBiAnalyticsCertification } from "../../scripts/certification/bi-analytics-certification-engine.js";

describe("Phase 32 — KwakoPos BI & Analytics OS Test Suite", () => {
  const engine = new BiAnalyticsEngine();

  it("should define canonical metrics and execute RBAC-scoped semantic query", () => {
    const defRes = engine.defineMetric({
      metricId: "m-test-margin",
      name: "Net Margin Percentage",
      definition: "Net profit divided by total revenue",
      formula: "(NetProfit / Revenue) * 100",
      source: "Finance Ledger",
      dimensions: ["tenant", "branch"],
      freshness: "DAILY",
      owner: "Finance Team",
    });
    expect(defRes.success).toBe(true);

    const queryRes = engine.executeSemanticQuery("What was gross margin?", ["finance.read"]);
    expect(queryRes.calculatedValue).toBe(42.5);
    expect(queryRes.metricId).toBe("m-gross-margin");
  });

  it("should generate AI insights, demand forecasts, and trigger Phase 31 workflow alerts", () => {
    const insRes = engine.generateInsightsAndForecasts("TEN-001");
    expect(insRes.insights.length).toBeGreaterThan(0);
    expect(insRes.insights[0].confidenceScore).toBeGreaterThan(0.9);
    expect(insRes.forecasts.length).toBeGreaterThan(0);

    const alert = engine.triggerBiWorkflowAlert("m-stock-turnover", 1.8, 4.0);
    expect(alert.severity).toBe("CRITICAL");
    expect(alert.alertId.startsWith("ALERT-BI-")).toBe(true);
  });

  it("should throw error when semantic query is executed without required permissions", () => {
    expect(() => engine.executeSemanticQuery("Gross margin", ["cashier.only"])).toThrow(
      "Unauthorized semantic analytical query access"
    );
  });

  it("should pass 100% of the 85-Pillar BI & Analytics OS certification campaign", () => {
    const cert = runBiAnalyticsCertification();
    expect(cert.totalPillars).toBe(85);
    expect(cert.passedPillars).toBe(85);
    expect(cert.failedPillars).toBe(0);
    expect(cert.successRatePct).toBe(100);
  });
});
