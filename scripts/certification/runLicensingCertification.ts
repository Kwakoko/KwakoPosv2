import { LicensingEngine } from "@kwakopos2/domain";
import { LICENSING_CERTIFICATION_PILLARS } from "./licensing-certification-engine.js";

async function runCertification() {
  console.log("========================================================================");
  console.log(" KWAKOPOS LICENSING CERTIFICATION (KPLOL v1.0.0)                      ");
  console.log(" Phase 45 — 100-Pillar Certification Suite                             ");
  console.log("========================================================================\n");

  const engine = new LicensingEngine();
  let passed = 0;
  for (const pillar of LICENSING_CERTIFICATION_PILLARS) {
    if (await pillar.test(engine)) {
      passed++;
      console.log(` ✓ [${pillar.id}] ${pillar.description}`);
    }
  }

  console.log(`\n PASSED: ${passed}/${LICENSING_CERTIFICATION_PILLARS.length}`);
  if (passed === LICENSING_CERTIFICATION_PILLARS.length) {
    console.log("🎉 ALL 100 LICENSING CERTIFICATION PILLARS PASSED SUCCESSFULLY!\n");
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runCertification();
