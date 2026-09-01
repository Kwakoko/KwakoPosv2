import { runWorkflowAutomationCertification } from "./workflow-automation-certification-engine.js";

console.log("========================================================================");
console.log(" KWAKOPOS PHASE 31 WORKFLOW & AUTOMATION OS CERTIFICATION ENGINE         ");
console.log(" Standard: KwakoPos Workflow Automation Standard (KBPE v1.0.0)           ");
console.log("========================================================================\n");

const cert = runWorkflowAutomationCertification();

for (const res of cert.results) {
  const icon = res.passed ? "✓" : "✗";
  console.log(` ${icon} [${res.pillarId}] ${res.pillarName}: ${res.details}`);
}

console.log("\n========================================================================");
console.log(` TOTAL PILLARS: ${cert.totalPillars}`);
console.log(` PASSED       : ${cert.passedPillars}`);
console.log(` FAILED       : ${cert.failedPillars}`);
console.log(` SUCCESS RATE : ${cert.successRatePct}%`);
console.log("========================================================================\n");

if (cert.failedPillars > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
