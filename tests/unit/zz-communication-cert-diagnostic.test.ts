import { describe, it, expect } from "vitest";
import { runBusinessFlowJourneys } from "../../scripts/certification/business-flow-certifier.js";
import { runCrossDomainProbes } from "../../scripts/certification/cross-domain-certifier.js";
import { runCoreBusinessEngineCertification } from "../../scripts/certification/core-business-engine-certification-engine.js";

describe("temporary certification diagnostic", () => {
  it("prints active certification failures for closed-loop remediation", async () => {
    const [core, journeys, probes] = await Promise.all([
      runCoreBusinessEngineCertification(),
      runBusinessFlowJourneys(),
      runCrossDomainProbes(),
    ]);
    console.error("DIAGNOSTIC_CORE", JSON.stringify({ overallCertified: core.overallCertified, failures: core.results?.filter((r: any) => !r.passed) }, null, 2));
    console.error("DIAGNOSTIC_JOURNEYS", JSON.stringify(Object.fromEntries(Object.entries(journeys.journeys).filter(([, r]: any) => !r.passed)), null, 2));
    console.error("DIAGNOSTIC_PROBES", JSON.stringify(Object.fromEntries(Object.entries(probes.probes).filter(([, r]: any) => !r.passed)), null, 2));
    expect(true).toBe(true);
  });
});
