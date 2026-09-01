import { NotificationEngine } from "@kwakopos2/domain";
import { NOTIFICATION_CERTIFICATION_PILLARS } from "./notification-certification-engine.js";

async function runCertification() {
  console.log("========================================================================");
  console.log(" KWAKOPOS NOTIFICATION CERTIFICATION (KNCOL v1.0.0)                    ");
  console.log(" Phase 42 — 100-Pillar Certification Suite                             ");
  console.log("========================================================================\n");

  const engine = new NotificationEngine();
  let passed = 0;
  for (const pillar of NOTIFICATION_CERTIFICATION_PILLARS) {
    if (await pillar.test(engine)) {
      passed++;
      console.log(` ✓ [${pillar.id}] ${pillar.description}`);
    }
  }

  console.log(`\n PASSED: ${passed}/${NOTIFICATION_CERTIFICATION_PILLARS.length}`);
  if (passed === NOTIFICATION_CERTIFICATION_PILLARS.length) {
    console.log("🎉 ALL 100 NOTIFICATION CERTIFICATION PILLARS PASSED SUCCESSFULLY!\n");
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runCertification();
