import { describe, it, expect } from "vitest";
import { runCoreBusinessEngineCertification } from "../../scripts/certification/core-business-engine-certification-engine.js";

describe("Platform Core Business Engine Layer — 360° Certification Suite", () => {
  it("executes all 12 core business engine pillars with 100% pass score", async () => {
    const report = await runCoreBusinessEngineCertification();

    expect(report.totalPillars).toBe(12);
    expect(report.passedPillars).toBe(12);
    expect(report.failedPillars).toBe(0);
    expect(report.scorePercentage).toBe(100);
    expect(report.overallCertified).toBe(true);

    for (const pillar of report.results) {
      expect(pillar.passed, `Pillar ${pillar.pillarId}: ${pillar.name} failed: ${pillar.details}`).toBe(true);
    }
  });
});
