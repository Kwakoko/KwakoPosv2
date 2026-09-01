import { FinanceTreasuryEngine } from "@kwakopos2/domain";
import { TREASURY_CERTIFICATION_PILLARS } from "./finance-treasury-certification-engine.js";

// ============================================================
// Phase 35 — Finance & Treasury Certification Runner
// ============================================================

async function runFinanceTreasuryCertification(): Promise<void> {
  console.log("========================================================================");
  console.log(" KWAKOPOS FINANCE & TREASURY CERTIFICATION (KFTL v1.0.0)               ");
  console.log(" Phase 35 — 90-Pillar Certification Suite                               ");
  console.log("========================================================================\n");

  const engine = new FinanceTreasuryEngine();
  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const pillar of TREASURY_CERTIFICATION_PILLARS) {
    try {
      const result = await pillar.test(engine);
      if (result) {
        console.log(` ✓ [${pillar.id}] ${pillar.description}`);
        passed++;
      } else {
        console.error(` ✗ [${pillar.id}] ${pillar.description}`);
        failures.push(`[${pillar.id}] ${pillar.description}`);
        failed++;
      }
    } catch (err) {
      console.error(` ✗ [${pillar.id}] ${pillar.description}`);
      console.error(`   ERROR: ${err instanceof Error ? err.message : String(err)}`);
      failures.push(`[${pillar.id}] ${pillar.description} — ERROR: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log("\n========================================================================");
  console.log(` TOTAL PILLARS: ${TREASURY_CERTIFICATION_PILLARS.length}`);
  console.log(` PASSED       : ${passed}`);
  console.log(` FAILED       : ${failed}`);
  console.log(` SUCCESS RATE : ${((passed / TREASURY_CERTIFICATION_PILLARS.length) * 100).toFixed(0)}%`);
  console.log("========================================================================\n");

  if (failures.length > 0) {
    console.error("FAILED PILLARS:");
    failures.forEach(f => console.error(`  - ${f}`));
    process.exit(1);
  }
}

runFinanceTreasuryCertification().catch(err => {
  console.error("CERTIFICATION RUNNER FATAL ERROR:", err);
  process.exit(1);
});
