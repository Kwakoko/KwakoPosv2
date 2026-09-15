import fs from "node:fs";
import path from "node:path";
import { RELEASE_CERTIFICATION_GATES,
  RELEASE_CERTIFICATION_INVARIANTS,
  RELEASE_CERTIFICATION_REQUIRED_AUTHORITIES,
  KWAKOKO_RELEASE_CERTIFICATION_CERTIFICATE,
  KWAKOKO_RELEASE_CERTIFICATION_VERSION,
} from "@kwakopos2/config";
import { certifyReleaseEvidence } from "@kwakopos2/domain";

const root = process.cwd();
const checks: Array<[string, boolean, string]> = [];
const exists = (p: string) => fs.existsSync(path.join(root, p));
const text = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const check = (name: string, ok: boolean, detail: string) => checks.push([name, ok, detail]);

check("authority-core", exists("packages/config/src/releaseCertificationGovernance.ts") && exists("packages/domain/src/releaseCertificationEngine.ts"), "Step 24 authority and engine exist");
check("certificate", KWAKOKO_RELEASE_CERTIFICATION_CERTIFICATE === "KWAKOKO-RELEASE-CERTIFICATION-CERTIFICATE-v1.0", KWAKOKO_RELEASE_CERTIFICATION_CERTIFICATE);
check("version", KWAKOKO_RELEASE_CERTIFICATION_VERSION === "1.0.0", KWAKOKO_RELEASE_CERTIFICATION_VERSION);
check("gate-count", RELEASE_CERTIFICATION_GATES.length === 15, `count=${RELEASE_CERTIFICATION_GATES.length}`);
check("invariant-count", RELEASE_CERTIFICATION_INVARIANTS.length === 17, `count=${RELEASE_CERTIFICATION_INVARIANTS.length}`);

for (const [name, file] of Object.entries(RELEASE_CERTIFICATION_REQUIRED_AUTHORITIES)) {
  check(`authority:${name}`, exists(file), file);
}

check("no-synthetic-quality-authority", text("scripts/release/quality-gates.ts").includes("runReleaseQualityGates"), "existing quality-gate authority is retained");
check("release-policy-authority", text("scripts/release/release-policy-engine.ts").includes("DEFAULT_PRODUCTION_POLICY"), "production release policy present");
check("release-candidate-authority", text("scripts/release/release-candidate-engine.ts").includes("ReleaseCandidateEntity"), "release candidate authority present");
check("migration-authority", text("scripts/release/database-migration-gate.ts").length > 0, "migration gate present");
check("fail-closed-engine", text("packages/domain/src/releaseCertificationEngine.ts").includes('decision: ReleaseCertificationDecision'), "aggregate decision engine present");
check("claim-boundary", text("packages/domain/src/releaseCertificationEngine.ts").includes("not proof of production customer outcomes"), "production claim boundary present");

const evidence = certifyReleaseEvidence({
  releaseId: "RC-CONTROLLED-STEP24",
  version: "2.12.5",
  gitSha: "0123456789012345678901234567890123456789",
  buildPassed: true,
  typecheckPassed: true,
  testsPassed: true,
  securityPassed: true,
  privacyPassed: true,
  tenantIsolationPassed: true,
  offlineSyncPassed: true,
  migrationPassed: true,
  reliabilityPassed: true,
  performancePassed: true,
  rollbackReady: true,
  provenanceVerified: true,
  attestationVerified: true,
  evidenceClassificationValid: true,
  governanceConvergencePassed: true,
  finalApprovalPresent: true,
});
check("controlled-certification-pass", evidence.decision === "PASS" && evidence.gatesPassed === 15, `${evidence.gatesPassed}/15 gates`);

const blocked = certifyReleaseEvidence({ ...({
  releaseId: "RC-CONTROLLED-BLOCK", version: "2.12.5", gitSha: "0123456789012345678901234567890123456789",
  buildPassed: true, typecheckPassed: true, testsPassed: true, securityPassed: true, privacyPassed: true,
  tenantIsolationPassed: false, offlineSyncPassed: true, migrationPassed: true, reliabilityPassed: true,
  performancePassed: true, rollbackReady: true, provenanceVerified: true, attestationVerified: true,
  evidenceClassificationValid: true, governanceConvergencePassed: true, finalApprovalPresent: true,
} as const) });
check("fail-closed-block", blocked.decision === "BLOCK" && blocked.failedGates.includes("tenant-isolation"), `decision=${blocked.decision}`);

const passed = checks.filter(([, ok]) => ok).length;
console.log(`KWAKOKO RELEASE CERTIFICATION VERIFIER v${KWAKOKO_RELEASE_CERTIFICATION_VERSION}`);
for (const [name, ok, detail] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
console.log(`SUMMARY ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exit(1);
