import { DocumentEngine } from "@kwakopos2/domain";
import { DOCUMENT_CERTIFICATION_PILLARS } from "./document-certification-engine.js";

async function runCertification() {
  console.log("========================================================================");
  console.log(" KWAKOPOS DOCUMENT CERTIFICATION (KDAOL v1.0.0)                        ");
  console.log(" Phase 40 — 100-Pillar Certification Suite                             ");
  console.log("========================================================================\n");

  const engine = new DocumentEngine();
  let passed = 0;
  for (const pillar of DOCUMENT_CERTIFICATION_PILLARS) {
    if (await pillar.test(engine)) {
      passed++;
      console.log(` ✓ [${pillar.id}] ${pillar.description}`);
    }
  }

  console.log(`\n PASSED: ${passed}/${DOCUMENT_CERTIFICATION_PILLARS.length}`);
  if (passed === DOCUMENT_CERTIFICATION_PILLARS.length) {
    console.log("🎉 ALL 100 DOCUMENT CERTIFICATION PILLARS PASSED SUCCESSFULLY!\n");
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runCertification();
