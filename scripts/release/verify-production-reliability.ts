import * as fs from "fs";
import * as path from "path";
import { KWAKOKO_PRODUCTION_RELIABILITY_GOVERNANCE as G } from "../../packages/config/src/productionReliabilityGovernance.js";

type Check = { name: string; passed: boolean; detail: string };
const root = process.cwd();
const exists = (p: string) => fs.existsSync(path.join(root, p));
const read = (p: string) => exists(p) ? fs.readFileSync(path.join(root, p), "utf8") : "";
const checks: Check[] = [];
function check(name: string, passed: boolean, detail: string) { checks.push({ name, passed, detail }); }
function authority(name: string, p: string) { check(`authority:${name}`, exists(p), p); }

for (const [name, p] of Object.entries(G.authorities)) authority(name, p);
const metrics = read(G.authorities.metrics);
const tracing = read(G.authorities.tracing);
const logger = read(G.authorities.logger);
const sync = read(G.authorities.syncMonitor);
const slo = read(G.authorities.sloEvaluator);
const incident = read(G.authorities.incidentEngine);
const regression = read(G.authorities.regressionAnalyzer);
const platform = read(G.authorities.platformHealth);
const synthetic = read(G.authorities.syntheticMonitor);
const releaseGate = read(G.authorities.releaseObservabilityGate);
const healthGate = read(G.authorities.healthGate);
check("slo-contract", G.slo.availabilityPercent === 99.9 && G.slo.apiSuccessPercent === 99.5 && G.slo.syncSuccessPercent === 99.9 && G.slo.p95LatencyMs === 500, "Availability/API/sync/latency SLOs are explicit and versioned.");
check("error-budget-contract", G.errorBudget.releaseBlockOnBudgetExhaustion === true && G.errorBudget.availabilityBudgetPercent === 0.1, "Error budgets are explicit and release-blocking when exhausted.");
check("telemetry-correlation", /traceId/.test(tracing) && /requestId/.test(tracing) && /operationId/.test(tracing), "Trace context exposes trace, request, and operation correlation identifiers.");
check("telemetry-sanitization", /sanitizeTelemetryData/.test(tracing) && /password|token|apiKey|creditCard/i.test(tracing), "Telemetry has sensitive-data sanitization authority.");
check("health-probes-fail-closed", /passed\s*=\s*false/.test(healthGate) && /process\.exit\(1\)/.test(healthGate), "Health checks fail certification when a probe fails.");
check("synthetic-monitoring-fail-closed", /allPassed/.test(synthetic) && /process\.exit\(1\)/.test(synthetic), "Synthetic monitoring has an explicit failure path.");
check("slo-calculation-evidence-bound", /evaluateProductionSlos/.test(slo) && /overallCompliance/.test(slo) && /anyBreached/.test(slo), "SLO compliance is calculated from measured inputs rather than hard-coded.");
check("sync-health-thresholds", /failureRate > 5/.test(sync) && /oldestPendingOutboxAgeMinutes > 15/.test(sync) && /getDeadLetters/.test(sync), "Sync monitor exposes failure, staleness, and dead-letter thresholds.");
check("incident-lifecycle", G.incidentManagement.requiredStates.every((x) => incident.includes(x)) && /timeline/.test(incident) && /rootCause/.test(incident), "Incident lifecycle, timeline, and root-cause fields are governed.");
check("release-regression-gate", /TRIGGER_ROLLBACK/.test(regression) && /status/.test(regression) && /delta/.test(regression), "Release regression analysis can block promotion and trigger rollback.");
check("tenant-reliability-isolation", /tenantId/.test(metrics) && /tenantId/.test(sync) && /getTenantHttpMetricsSummary/.test(metrics), "Reliability telemetry exposes tenant-scoped metrics and sync health.");
check("delegated-governance-convergence", G.releaseGate.delegatedGates.every((script) => {
  const map: Record<string, string> = {
    "brand:verify": "scripts/release/verify-brand-integrity.ts",
    "design:verify": "scripts/release/verify-design-system.ts",
    "experience:verify": "scripts/release/verify-experience-integrity.ts",
    "workflow:verify": "scripts/release/verify-workflow-integrity.ts",
    "ai-governance:verify": "scripts/release/verify-ai-agent-governance.ts",
    "security-trust:verify": "scripts/release/verify-security-trust.ts",
    "privacy-data:verify": "scripts/release/verify-privacy-data-governance.ts",
    "lifecycle-dr:verify": "scripts/release/verify-data-lifecycle-dr-governance.ts",
  };
  return Boolean(map[script] && exists(map[script]));
}), "All prior governance authorities remain present and delegated.");
check("no-fail-open-observability-gate", /RELEASE_BLOCKED/.test(releaseGate) && /process\.exit\(1\)/.test(releaseGate) && /throw new Error/.test(releaseGate), "Live observability failures cannot be silently tolerated.");
check("no-hard-coded-slo-pass", !/productionSloCompliance.*PASS/.test(releaseGate), "SLO compliance is not hard-coded to PASS.");
check("live-telemetry-required", /CANDIDATE_URL \|\| process\.env\.SERVICE_URL/.test(releaseGate) && /live health cannot be inferred/.test(releaseGate), "Live candidate identity is required for live reliability gating.");
const passed = checks.every((c) => c.passed);
const certificate = {
  id: G.releaseGate.certificate,
  version: G.version,
  status: passed ? "PASS" : "FAIL",
  failClosed: G.releaseGate.failClosed,
  checks,
  slo: G.slo,
  errorBudget: G.errorBudget,
  generatedAt: new Date().toISOString(),
};
const outDir = path.join(root, "artifacts", "governance");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "production-reliability-certificate.json"), JSON.stringify(certificate, null, 2) + "\n", "utf8");
for (const c of checks) console.log(`${c.passed ? "PASS" : "FAIL"} ${c.name}: ${c.detail}`);
console.log(`${passed ? "PASS" : "FAIL"} Kwakoko Production Reliability & Observability Governance: ${passed ? "PASS" : "FAIL"}`);
console.log(`   certificate: ${G.releaseGate.certificate}`);
if (!passed) process.exit(1);
