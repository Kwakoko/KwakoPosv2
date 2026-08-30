import { GlobalPlatformEngine } from "@kwakopos2/domain";
import { GLOBAL_PLATFORM_CERTIFICATION_PILLARS } from "./global-platform-certification-engine.js";

async function runCertification() {
  console.log("========================================================================");
  console.log(" KWAKOPOS GLOBAL PLATFORM CERTIFICATION (KGPA v1.0.0)                  ");
  console.log(" Phase 41 — 100-Pillar Certification Suite                             ");
  console.log("========================================================================\n");

  const engine = new GlobalPlatformEngine();
  let passed = 0;
  for (const pillar of GLOBAL_PLATFORM_CERTIFICATION_PILLARS) {
    if (await pillar.test(engine)) {
      passed++;
      console.log(` ✓ [${pillar.id}] ${pillar.description}`);
    }
  }

  console.log(`\n PASSED: ${passed}/${GLOBAL_PLATFORM_CERTIFICATION_PILLARS.length}`);
  if (passed === GLOBAL_PLATFORM_CERTIFICATION_PILLARS.length) {
    console.log("🎉 ALL 100 GLOBAL PLATFORM CERTIFICATION PILLARS PASSED SUCCESSFULLY!\n");
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runCertification();
