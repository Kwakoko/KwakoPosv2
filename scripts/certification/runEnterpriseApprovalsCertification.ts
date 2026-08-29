import { runEnterpriseApprovalsCertification } from "./enterprise-approvals-certification-engine.js";

const result = runEnterpriseApprovalsCertification();

console.log("");
for (const r of result.results) {
  const icon = r.passed ? "✓" : "✗";
  console.log(` ${icon} [${r.pillarId}] ${r.pillarName}: ${r.details}`);
}

console.log("");
console.log("========================================================================");
console.log(` TOTAL PILLARS: ${result.totalPillars}`);
console.log(` PASSED       : ${result.passedPillars}`);
console.log(` FAILED       : ${result.failedPillars}`);
console.log(` SUCCESS RATE : ${result.successRatePct}%`);
console.log("========================================================================");
console.log("");

if (result.failedPillars > 0) {
  process.exit(1);
}
