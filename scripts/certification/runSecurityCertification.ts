import { SecurityEngine } from "@kwakopos2/domain";
import { SECURITY_CERTIFICATION_PILLARS } from "./security-certification-engine.js";

async function runCertification() {
  console.log("========================================================================");
  console.log(" KWAKOPOS SECURITY CERTIFICATION (KSROL v1.0.0)                        ");
  console.log(" Phase 41 — 100-Pillar Certification Suite                             ");
  console.log("========================================================================\n");

  const engine = new SecurityEngine();
  let passed = 0;
  for (const pillar of SECURITY_CERTIFICATION_PILLARS) {
    if (await pillar.test(engine)) {
      passed++;
      console.log(` ✓ [${pillar.id}] ${pillar.description}`);
    }
  }

  console.log(`\n PASSED: ${passed}/${SECURITY_CERTIFICATION_PILLARS.length}`);
  if (passed === SECURITY_CERTIFICATION_PILLARS.length) {
    console.log("🎉 ALL 100 SECURITY CERTIFICATION PILLARS PASSED SUCCESSFULLY!\n");
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runCertification();
