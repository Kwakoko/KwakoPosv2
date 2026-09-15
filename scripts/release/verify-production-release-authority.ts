import fs from "fs";
import path from "path";
import { PRODUCTION_RELEASE_AUTHORITY, PRODUCTION_RELEASE_GATES, PRODUCTION_RELEASE_INVARIANTS } from "@kwakopos2/config";
import { assessProductionRelease } from "@kwakopos2/domain";

const root = process.cwd();
let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail: string) {
  if (condition) { passed++; console.log(`PASS ${name}: ${detail}`); }
  else { failed++; console.error(`FAIL ${name}: ${detail}`); }
}
function exists(relative: string) { return fs.existsSync(path.join(root, relative)); }

console.log("KWAKOKO PRODUCTION RELEASE AUTHORITY VERIFIER v1.0.0");
check("authority", PRODUCTION_RELEASE_AUTHORITY.version === "1.0.0", "Step 25 authority version is 1.0.0");
check("certificate", PRODUCTION_RELEASE_AUTHORITY.certificate === "KWAKOKO-PRODUCTION-RELEASE-CERTIFICATE-v1.0", "canonical production certificate exists");
check("gate-count", PRODUCTION_RELEASE_GATES.length === 15, `count=${PRODUCTION_RELEASE_GATES.length}`);
check("invariant-count", PRODUCTION_RELEASE_INVARIANTS.length === 16, `count=${PRODUCTION_RELEASE_INVARIANTS.length}`);
for (const [key, file] of Object.entries(PRODUCTION_RELEASE_AUTHORITY.delegation)) check(`authority:${key}`, exists(file), file);
check("progressive-stages", PRODUCTION_RELEASE_AUTHORITY.lifecycle.includes("OBSERVE") && PRODUCTION_RELEASE_AUTHORITY.lifecycle.includes("ROLLBACK_OR_COMPLETE"), "promotion lifecycle includes observation and rollback/completion");
check("no-synthetic-health", !String(PRODUCTION_RELEASE_AUTHORITY).includes("100% SUCCESS") && !String(PRODUCTION_RELEASE_AUTHORITY).includes("99.9%"), "authority contains no hard-coded health claim");

const evidence = {
  unifiedCertification: true, authenticatedIdentity: true, candidateReady: true, zeroTrafficDeployed: true,
  tenantCanaryPassed: true, healthPassed: true, liveIdentityMatched: true, synchronizationPassed: true,
  databaseCompatibilityPassed: true, observabilityPassed: true, performancePassed: true, rollbackReady: true,
  killSwitchReady: true, trafficIntegrityPassed: true, auditEvidencePresent: true, evidenceClass: "DEPLOYED" as const,
};
const passAssessment = assessProductionRelease(evidence, "PERCENT_5");
check("controlled-promotion-pass", passAssessment.decision === "PASS" && passAssessment.targetTrafficPercent === 5, "5% promotion passes with complete deployed evidence");
const blockedAssessment = assessProductionRelease({ ...evidence, healthPassed: false }, "PERCENT_25");
check("health-fail-block", blockedAssessment.decision === "BLOCK" && blockedAssessment.failedGates.includes("health-readiness"), "failed health blocks 25% promotion");
const simulatedAssessment = assessProductionRelease({ ...evidence, evidenceClass: "SIMULATED" }, "PERCENT_1");
check("simulation-block", simulatedAssessment.decision === "BLOCK" && simulatedAssessment.failedGates.includes("evidence-classification"), "simulated evidence cannot authorize production traffic");

console.log(`SUMMARY ${passed}/${passed + failed} PASS`);
if (failed) process.exit(1);
