import { PlatformSecurityEngine } from "@kwakopos2/domain";
import { PLATFORM_SECURITY_CERTIFICATION_PILLARS } from "./platform-security-engine.js";

async function runCertification() {
  console.log("========================================================================");
  console.log(" KWAKOPOS PLATFORM SECURITY CERTIFICATION (KSOL v2.0.0)                ");
  console.log(" Phase 42 — 100-Pillar Certification Suite                             ");
  console.log("========================================================================\n");

  const engine = new PlatformSecurityEngine();
  let passed = 0;
  for (const pillar of PLATFORM_SECURITY_CERTIFICATION_PILLARS) {
    if (await pillar.test(engine)) {
      passed++;
      console.log(` ✓ [${pillar.id}] ${pillar.description}`);
    }
  }

  console.log(`\n PASSED: ${passed}/${PLATFORM_SECURITY_CERTIFICATION_PILLARS.length}`);
  if (passed === PLATFORM_SECURITY_CERTIFICATION_PILLARS.length) {
    console.log("🎉 ALL 100 PLATFORM SECURITY CERTIFICATION PILLARS PASSED SUCCESSFULLY!\n");
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runCertification();
