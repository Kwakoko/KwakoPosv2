import { MultiSiteEngine } from "@kwakopos2/domain";
import { MULTISITE_CERTIFICATION_PILLARS } from "./multisite-certification-engine.js";

async function runCertification() {
  console.log("========================================================================");
  console.log(" KWAKOPOS MULTI-SITE CERTIFICATION (KMAOL v1.0.0)                      ");
  console.log(" Phase 44 — 100-Pillar Certification Suite                             ");
  console.log("========================================================================\n");

  const engine = new MultiSiteEngine();
  let passed = 0;
  for (const pillar of MULTISITE_CERTIFICATION_PILLARS) {
    if (await pillar.test(engine)) {
      passed++;
      console.log(` ✓ [${pillar.id}] ${pillar.description}`);
    }
  }

  console.log(`\n PASSED: ${passed}/${MULTISITE_CERTIFICATION_PILLARS.length}`);
  if (passed === MULTISITE_CERTIFICATION_PILLARS.length) {
    console.log("🎉 ALL 100 MULTI-SITE CERTIFICATION PILLARS PASSED SUCCESSFULLY!\n");
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runCertification();
