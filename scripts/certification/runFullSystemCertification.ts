import { runFullSystemCertificationEngine } from "./full-system-certification-engine.js";

const result = await runFullSystemCertificationEngine("production-foundation");

for (const journey of result.businessJourneys) {
  console.log((journey.passed ? "PASS" : "FAIL") + " journey:" + journey.journeyName + " — " + journey.details);
}
for (const probe of result.crossDomainProbes) {
  console.log((probe.passed ? "PASS" : "FAIL") + " probe:" + probe.probeName + " — " + probe.details);
}

console.log(JSON.stringify(result.evidencePackage, null, 2));

if (!result.passed) {
  console.error("FULL-SYSTEM CERTIFICATION: FAIL");
  process.exit(1);
}

console.log("FULL-SYSTEM CERTIFICATION: PASS — active core, journey, and cross-domain evidence only.");
