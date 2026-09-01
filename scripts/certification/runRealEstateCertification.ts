import { runRealEstateCertification } from "./real-estate-certification-engine.js";

console.log("========================================================================");
console.log(" EXECUTING KWAKOPOS REAL ESTATE & PROPERTY OS CERTIFICATION (61 PILLARS)");
console.log("========================================================================");

const results = runRealEstateCertification();

results.pillars.forEach((p) => {
  const icon = p.status === "PASSED" ? "✓" : "✗";
  console.log(` ${icon} [${p.id}] ${p.name}: ${p.details}`);
});

console.log("------------------------------------------------------------------------");
console.log(` TOTAL PILLARS: ${results.totalPillars}`);
console.log(` PASSED       : ${results.passedPillars}`);
console.log(` FAILED       : ${results.failedPillars}`);
console.log(` SUCCESS RATE : ${results.successRatePct}%`);
console.log("========================================================================");

if (results.failedPillars > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
