import { LIVE_PRODUCTION_EVIDENCE_GOVERNANCE } from "@kwakopos2/config";
import { assessLiveProductionEvidence } from "@kwakopos2/domain";
import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "../..");
const requiredFiles = [
  "packages/config/src/liveProductionEvidenceGovernance.ts",
  "packages/domain/src/liveProductionEvidenceEngine.ts",
  "scripts/release/prove-production-release.ts",
  "scripts/release/deploy-candidate.ts",
  "scripts/release/certify-deployed.ts",
  "scripts/release/promote-revision.ts",
  "scripts/release/rollback-engine.ts",
];

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
  ok ? passed++ : failed++;
}

console.log("KWAKOKO LIVE PRODUCTION EVIDENCE VERIFIER v1.0.0");
check("authority-version", LIVE_PRODUCTION_EVIDENCE_GOVERNANCE.version === "1.0.0", LIVE_PRODUCTION_EVIDENCE_GOVERNANCE.version);
check("gate-count", LIVE_PRODUCTION_EVIDENCE_GOVERNANCE.mandatoryGates.length === 16, `count=${LIVE_PRODUCTION_EVIDENCE_GOVERNANCE.mandatoryGates.length}`);
check("invariant-count", LIVE_PRODUCTION_EVIDENCE_GOVERNANCE.invariants.length === 12, `count=${LIVE_PRODUCTION_EVIDENCE_GOVERNANCE.invariants.length}`);

for (const file of requiredFiles) check(`authority:${path.basename(file)}`, fs.existsSync(path.join(root, file)), file);

const baseEvidence = {
  certificationDecision: "PASS" as const, evidenceClass: "PRODUCTION", productionCertificationMode: true,
  gitSha: "0123456789abcdef0123456789abcdef01234567", containerDigest: `sha256:${"a".repeat(64)}`,
  cloudRunRevision: "kwakopos-prod-20260915", liveRevisionVerified: true, liveHealth: true, liveReadiness: true,
  liveIdentity: true, browserRuntime: true, syncConvergence: true, databaseReconciliation: true,
  tenantIsolation: true, observability: true, trafficMeasured: true, rollbackReady: true, postReleaseReconciliation: true,
};

check("production-evidence-pass", assessLiveProductionEvidence(baseEvidence).decision === "PASS", `decision=${assessLiveProductionEvidence(baseEvidence).decision}`);
check("simulation-block", assessLiveProductionEvidence({ ...baseEvidence, evidenceClass: "SIMULATED" }).decision === "BLOCK", "simulation cannot authorize production");
check("missing-evidence-block", assessLiveProductionEvidence({ ...baseEvidence, liveIdentity: false, browserRuntime: false, syncConvergence: false }).decision === "BLOCK", "missing evidence blocks");
check("controlled-is-hold", assessLiveProductionEvidence({ ...baseEvidence, evidenceClass: "CONTROLLED", productionCertificationMode: false }).decision === "HOLD", "controlled evidence is not production proof");

const proveSource = fs.readFileSync(path.join(root, "scripts/release/prove-production-release.ts"), "utf8");
const certifySource = fs.readFileSync(path.join(root, "scripts/release/certify-deployed.ts"), "utf8");
check("strict-production-mode", proveSource.includes('NODE_ENV === "production-certification"') && certifySource.includes('NODE_ENV === "production-certification"'), "strict mode is explicit");
check("production-no-localhost", certifySource.includes("Production certification must target Cloud Run HTTPS revision, not localhost."), "localhost rejected in production-certification mode");
check("production-no-fallback", certifySource.includes("if (isProdCert || process.env.STRICT_HTTPS === \"true\")"), "real HTTPS path selected for production certification");

console.log(`SUMMARY ${passed}/${passed + failed} PASS`);
if (failed > 0) process.exit(1);
