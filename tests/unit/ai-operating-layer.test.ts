import { describe, it, expect } from "vitest";
import { AiOperatingLayerEngine } from "@kwakopos2/domain";
import { runAiOperatingLayerCertification } from "../../scripts/certification/ai-operating-layer-certification-engine.js";

describe("Phase 33 — KwakoPos AI Operating Layer OS Test Suite", () => {
  const engine = new AiOperatingLayerEngine();

  it("should register specialist agents and execute governed Ask AI semantic queries", () => {
    const regRes = engine.registerAgent({
      agentId: "agent-sales-test",
      name: "Sales Performance Agent",
      purpose: "Analyzes daily sales ATV and customer purchase patterns",
      permissions: ["sales.read"],
      tools: ["tool-get-sales-summary"],
      autonomyLevel: "RECOMMEND",
    });
    expect(regRes.success).toBe(true);

    const askRes = engine.askAi("What is gross margin?", ["finance.read"]);
    expect(askRes.answer).toContain("42.5%");
    expect(askRes.evidence.length).toBeGreaterThan(0);
  });

  it("should generate evidence-backed recommendations, explain, and execute approved actions with audit ledger", () => {
    const genRes = engine.generateInsightsAndRecommendations("TEN-001");
    expect(genRes.recommendations.length).toBeGreaterThan(0);

    const recId = genRes.recommendations[0].recommendationId;
    const expRes = engine.explainRecommendation(recId);
    expect(expRes.found).toBe(true);

    const execRes = engine.executeApprovedAction(recId, "ADM-001");
    expect(execRes.success).toBe(true);
    expect(execRes.ledgerEntry?.executionVerified).toBe(true);
  });


  it("should activate kill switch and halt AI operations gracefully while system remains healthy", () => {
    const killRes = engine.toggleKillSwitch("GLOBAL", true);
    expect(killRes).toBe(true);

    const askRes = engine.askAi("Test query", ["finance.read"]);
    expect(askRes.answer).toContain("Kill Switch");

    // Restore kill switch
    engine.toggleKillSwitch("GLOBAL", false);
  });

  it("should pass 100% of the 75-Pillar AI Operating Layer OS certification campaign", () => {
    const cert = runAiOperatingLayerCertification();
    expect(cert.totalPillars).toBe(75);
    expect(cert.passedPillars).toBe(75);
    expect(cert.failedPillars).toBe(0);
    expect(cert.successRatePct).toBe(100);
  });
});
