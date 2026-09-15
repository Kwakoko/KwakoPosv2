import { runSyntheticProductionSuite } from "../ops/synthetic-monitor.js";
import * as fs from "fs";
import * as path from "path";
import { KWAKOKO_PRODUCTION_RELIABILITY_GOVERNANCE as G } from "../../packages/config/src/productionReliabilityGovernance.js";

const targetUrl = process.env.CANDIDATE_URL || process.env.SERVICE_URL;

async function probe(url: string, route: string): Promise<{ passed: boolean; status: number; latencyMs: number; detail: string }> {
  const started = Date.now();
  try {
    const response = await fetch(`${url}${route}`);
    const text = await response.text();
    const passed = response.ok;
    return { passed, status: response.status, latencyMs: Date.now() - started, detail: text.slice(0, 300) };
  } catch (error) {
    return { passed: false, status: 0, latencyMs: Date.now() - started, detail: String(error) };
  }
}

async function runObservabilityReleaseGate() {
  if (!targetUrl) throw new Error("RELEASE_BLOCKED: CANDIDATE_URL or SERVICE_URL is required; live health cannot be inferred.");
  const health = await probe(targetUrl, "/health");
  const readiness = await probe(targetUrl, "/readiness");
  if (!health.passed || !readiness.passed) throw new Error("RELEASE_BLOCKED: live health/readiness probe failed.");

  const synthetic = await runSyntheticProductionSuite(targetUrl);
  if (!synthetic.allPassed) throw new Error("RELEASE_BLOCKED: synthetic monitoring has one or more failed tests.");

  const evidence = {
    certificate: G.releaseGate.certificate,
    status: "PASS",
    evidenceClass: "LIVE_HEALTH_AND_CONTROLLED_SYNTHETIC",
    targetUrl,
    probes: { health, readiness },
    synthetic: synthetic.results.map((result) => ({ test: result.testSuite, status: result.status, durationMs: result.durationMs })),
    generatedAt: new Date().toISOString(),
    note: "SLO compliance is not fabricated from a single probe; historical SLO/error-budget evidence must be supplied by the observability platform.",
  };
  const dir = path.join(process.cwd(), "artifacts", "governance");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "production-reliability-live-gate.json"), JSON.stringify(evidence, null, 2) + "\n", "utf8");
  console.log("Kwakoko Production Reliability Live Gate: PASS");
}

runObservabilityReleaseGate().catch((error) => {
  console.error("Kwakoko Production Reliability Live Gate: FAIL");
  console.error(error);
  process.exit(1);
});
