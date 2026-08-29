import { MarketplaceEngine } from "@kwakopos2/domain";
import { MARKETPLACE_CERTIFICATION_PILLARS } from "./marketplace-certification-engine.js";

async function runCertification() {
  console.log("========================================================================");
  console.log(" KWAKOPOS MARKETPLACE CERTIFICATION (KMKOL v1.0.0)                     ");
  console.log(" Phase 40 — 100-Pillar Certification Suite                             ");
  console.log("========================================================================\n");

  const engine = new MarketplaceEngine();
  let passed = 0;
  for (const pillar of MARKETPLACE_CERTIFICATION_PILLARS) {
    if (await pillar.test(engine)) {
      passed++;
      console.log(` ✓ [${pillar.id}] ${pillar.description}`);
    }
  }

  console.log(`\n PASSED: ${passed}/${MARKETPLACE_CERTIFICATION_PILLARS.length}`);
  if (passed === MARKETPLACE_CERTIFICATION_PILLARS.length) {
    console.log("🎉 ALL 100 MARKETPLACE CERTIFICATION PILLARS PASSED SUCCESSFULLY!\n");
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runCertification();
