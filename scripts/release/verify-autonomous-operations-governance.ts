import { readFileSync } from "node:fs";
import { runAutonomousOperationsCertification } from "../certification/autonomous-operations-certification-engine.js";
import { KWAKOKO_AUTONOMOUS_OPERATIONS_GOVERNANCE as G } from "@kwakopos2/config";

const root = process.cwd();
const checks: Array<[string, boolean]> = [];
const text = (p: string) => readFileSync(`${root}/${p}`, "utf8");
const has = (p: string, needle: string) => text(p).includes(needle);
checks.push(["authority:core-surfaces", Object.values(G.authorities).every((p) => has(p, ""))]);
checks.push(["governance-version", G.version === "1.0.0" && G.certificateId.includes("v1.0")]);
checks.push(["lifecycle", G.lifecycle.includes("DETECT") && G.lifecycle.includes("VERIFY") && G.lifecycle.includes("ESCALATE")]);
checks.push(["maturity-model", G.maturity.includes("LEVEL_4_CERTIFIED") && G.maturity.includes("LEVEL_5_COORDINATED")]);
for (const invariant of ["minimum-blast-radius","rollback-required","independent-verification","tenant-isolation","kill-switch","circuit-breaker","rate-budget","cost-envelope","non-destructive-recovery","evidence-ledger","no-silent-data-loss","authoritative-domain-services"] as const) checks.push([invariant, G.invariants.includes(invariant)]);
checks.push(["ai-convergence", has(G.authorities.ai, "tenantIsolation") && has(G.authorities.ai, "humanApprovalForHighImpact") && has(G.authorities.ai, "killSwitch")]);
checks.push(["reliability-convergence", has(G.authorities.reliability, "slo") || has(G.authorities.reliability, "SLO")]);
checks.push(["performance-convergence", has(G.authorities.performance, "workloadProfiles") && has(G.authorities.performance, "performanceBudgets")]);
checks.push(["lifecycle-convergence", has(G.authorities.lifecycle, "VERIFIED_ERASURE")]);
checks.push(["security-convergence", has(G.authorities.security, "tenant-isolation") && has(G.authorities.security, "Cross-tenant access")]);
checks.push(["privacy-convergence", has(G.authorities.privacy, "dataMinimization")]);
checks.push(["bi-convergence", has(G.authorities.bi, "authoritative-reconciliation") && has(G.authorities.bi, "tenant-isolation")]);
const cert = runAutonomousOperationsCertification();
checks.push(["56-pillar-certification", cert.totalPillars === 56 && cert.passedPillars === 56 && cert.failedPillars === 0]);
checks.push(["runtime-certification-rate", cert.successRatePct === 100]);
checks.push(["fail-closed-certificate", G.certificateId === "KWAKOKO-AUTONOMOUS-OPERATIONS-CERTIFICATE-v1.0"]);
for (const [name, pass] of checks) console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
const passed = checks.filter(([, p]) => p).length;
console.log(`Kwakoko Autonomous Operations Governance: ${passed}/${checks.length}`);
if (passed !== checks.length) process.exit(1);

