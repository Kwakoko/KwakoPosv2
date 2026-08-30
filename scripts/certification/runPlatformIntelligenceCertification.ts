import { PlatformIntelligenceEngine } from "@kwakopos2/domain";
import { PLATFORM_INTELLIGENCE_CERTIFICATION_PILLARS } from "./platform-intelligence-engine.js";

async function runCertification() {
  console.log("========================================================================");
  console.log(" KWAKOPOS PLATFORM INTELLIGENCE CERTIFICATION (KPIOL v1.0.0)            ");
  console.log(" Phase 44 — 100-Pillar Certification Suite                             ");
  console.log("========================================================================\n");

  const engine = new PlatformIntelligenceEngine();
  let passed = 0;
  for (const pillar of PLATFORM_INTELLIGENCE_CERTIFICATION_PILLARS) {
    if (await pillar.test(engine)) {
      passed++;
      console.log(` ✓ [${pillar.id}] ${pillar.description}`);
    }
  }

  console.log(`\n PASSED: ${passed}/${PLATFORM_INTELLIGENCE_CERTIFICATION_PILLARS.length}`);
  if (passed === PLATFORM_INTELLIGENCE_CERTIFICATION_PILLARS.length) {
    console.log("🎉 ALL 100 PLATFORM INTELLIGENCE CERTIFICATION PILLARS PASSED SUCCESSFULLY!\n");
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runCertification();
