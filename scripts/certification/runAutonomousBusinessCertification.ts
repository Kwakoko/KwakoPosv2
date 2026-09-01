import { AutonomousBusinessEngine } from "@kwakopos2/domain";
import { AUTONOMOUS_BUSINESS_CERTIFICATION_PILLARS } from "./autonomous-business-certification-engine.js";

async function runCertification() {
  console.log("========================================================================");
  console.log(" KWAKOPOS AUTONOMOUS BUSINESS CERTIFICATION (KABO v1.0.0)               ");
  console.log(" Phase 42 — 100-Pillar Certification Suite                             ");
  console.log("========================================================================\n");

  const engine = new AutonomousBusinessEngine();
  let passed = 0;
  for (const pillar of AUTONOMOUS_BUSINESS_CERTIFICATION_PILLARS) {
    if (await pillar.test(engine)) {
      passed++;
      console.log(` ✓ [${pillar.id}] ${pillar.description}`);
    }
  }

  console.log(`\n PASSED: ${passed}/${AUTONOMOUS_BUSINESS_CERTIFICATION_PILLARS.length}`);
  if (passed === AUTONOMOUS_BUSINESS_CERTIFICATION_PILLARS.length) {
    console.log("🎉 ALL 100 AUTONOMOUS BUSINESS CERTIFICATION PILLARS PASSED SUCCESSFULLY!\n");
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runCertification();
