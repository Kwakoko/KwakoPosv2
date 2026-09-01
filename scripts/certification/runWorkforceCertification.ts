import { WorkforceEngine } from "@kwakopos2/domain";
import { WORKFORCE_CERTIFICATION_PILLARS } from "./workforce-certification-engine.js";

// ============================================================
// Phase 37 — Workforce Certification Suite Runner
// ============================================================

async function runCertification() {
  console.log("========================================================================");
  console.log(" KWAKOPOS WORKFORCE CERTIFICATION (KWOL v1.0.0)                        ");
  console.log(" Phase 37 — 100-Pillar Certification Suite                             ");
  console.log("========================================================================\n");

  const engine = new WorkforceEngine();
  let passed = 0;
  let failed = 0;
  const failedPillars: { id: string; description: string; error?: string }[] = [];

  for (const pillar of WORKFORCE_CERTIFICATION_PILLARS) {
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
  console.log(` TOTAL PILLARS: ${WORKFORCE_CERTIFICATION_PILLARS.length}`);
  console.log(` PASSED       : ${passed}`);
  console.log(` FAILED       : ${failed}`);
  console.log(` SUCCESS RATE : ${Math.round((passed / WORKFORCE_CERTIFICATION_PILLARS.length) * 100)}%`);
  console.log("========================================================================\n");

  if (failed > 0) {
    console.log("FAILED PILLARS:");
    failedPillars.forEach(f => console.log(`  - [${f.id}] ${f.description} ${f.error ? `(${f.error})` : ""}`));
    process.exit(1);
  } else {
    console.log("🎉 ALL 100 WORKFORCE CERTIFICATION PILLARS PASSED SUCCESSFULLY!\n");
    process.exit(0);
  }
}

runCertification();
