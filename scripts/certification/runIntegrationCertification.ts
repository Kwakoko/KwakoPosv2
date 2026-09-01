import { IntegrationEngine } from "@kwakopos2/domain";
import { INTEGRATION_CERTIFICATION_PILLARS } from "./integration-certification-engine.js";

// ============================================================
// Phase 39 — Integration Certification Suite Runner
// ============================================================

async function runCertification() {
  console.log("========================================================================");
  console.log(" KWAKOPOS INTEGRATION CERTIFICATION (KIOL v1.0.0)                      ");
  console.log(" Phase 39 — 100-Pillar Certification Suite                             ");
  console.log("========================================================================\n");

  const engine = new IntegrationEngine();
  let passed = 0;
  let failed = 0;
  const failedPillars: { id: string; description: string; error?: string }[] = [];

  for (const pillar of INTEGRATION_CERTIFICATION_PILLARS) {
    try {
      const result = await pillar.test(engine);
      if (result) {
        passed++;
        console.log(` ✓ [${pillar.id}] ${pillar.description}`);
      } else {
        failed++;
        failedPillars.push({ id: pillar.id, description: pillar.description });
        console.log(` ✗ [${pillar.id}] ${pillar.description}`);
      }
    } catch (err: any) {
      failed++;
      failedPillars.push({ id: pillar.id, description: pillar.description, error: err?.message || String(err) });
      console.log(` ✗ [${pillar.id}] ${pillar.description} (ERROR: ${err?.message || err})`);
    }
  }

  console.log("\n========================================================================");
  console.log(` TOTAL PILLARS: ${INTEGRATION_CERTIFICATION_PILLARS.length}`);
  console.log(` PASSED       : ${passed}`);
  console.log(` FAILED       : ${failed}`);
  console.log(` SUCCESS RATE : ${Math.round((passed / INTEGRATION_CERTIFICATION_PILLARS.length) * 100)}%`);
  console.log("========================================================================\n");

  if (failed > 0) {
    console.log("FAILED PILLARS:");
    failedPillars.forEach(f => console.log(`  - [${f.id}] ${f.description} ${f.error ? `(${f.error})` : ""}`));
    process.exit(1);
  } else {
    console.log("🎉 ALL 100 INTEGRATION CERTIFICATION PILLARS PASSED SUCCESSFULLY!\n");
    process.exit(0);
  }
}

runCertification();
