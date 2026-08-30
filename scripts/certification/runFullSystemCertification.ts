import { FullSystemCertificationEngine } from "@kwakopos2/domain";
import { FULL_SYSTEM_CERTIFICATION_PILLARS } from "./full-system-certification-engine.js";

async function runCertification() {
  console.log("========================================================================");
  console.log(" KWAKOPOS FULL SYSTEM OPERATING CERTIFICATION (KFOS-CERT v1.0.0)        ");
  console.log(" Phase 45 — Master 181-Pillar Full Operating System Certification Suite ");
  console.log("========================================================================\n");

  const engine = new FullSystemCertificationEngine();
  let passed = 0;
  for (const pillar of FULL_SYSTEM_CERTIFICATION_PILLARS) {
    if (await pillar.test(engine)) {
      passed++;
      console.log(` ✓ [${pillar.id}] ${pillar.description}`);
    }
  }

  console.log(`\n PASSED: ${passed}/${FULL_SYSTEM_CERTIFICATION_PILLARS.length}`);
  if (passed === FULL_SYSTEM_CERTIFICATION_PILLARS.length) {
    console.log("🎉 ALL 181 FULL SYSTEM OPERATING CERTIFICATION PILLARS PASSED SUCCESSFULLY!\n");
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runCertification();
