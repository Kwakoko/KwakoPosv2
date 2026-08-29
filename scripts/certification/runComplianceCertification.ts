import { ComplianceEngine } from "@kwakopos2/domain";
import { COMPLIANCE_CERTIFICATION_PILLARS } from "./compliance-certification-engine.js";

async function runCertification() {
  console.log("========================================================================");
  console.log(" KWAKOPOS COMPLIANCE CERTIFICATION (KCAOL v1.0.0)                      ");
  console.log(" Phase 43 — 100-Pillar Certification Suite                             ");
  console.log("========================================================================\n");

  const engine = new ComplianceEngine();
  let passed = 0;
  for (const pillar of COMPLIANCE_CERTIFICATION_PILLARS) {
    if (await pillar.test(engine)) {
      passed++;
      console.log(` ✓ [${pillar.id}] ${pillar.description}`);
    }
  }

  console.log(`\n PASSED: ${passed}/${COMPLIANCE_CERTIFICATION_PILLARS.length}`);
  if (passed === COMPLIANCE_CERTIFICATION_PILLARS.length) {
    console.log("🎉 ALL 100 COMPLIANCE CERTIFICATION PILLARS PASSED SUCCESSFULLY!\n");
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runCertification();
