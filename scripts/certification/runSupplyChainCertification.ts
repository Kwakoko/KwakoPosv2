import { SupplyChainEngine } from "@kwakopos2/domain";
import { SUPPLY_CHAIN_CERTIFICATION_PILLARS } from "./supply-chain-certification-engine.js";

// ============================================================
// Phase 36 — Supply Chain Certification Suite Runner
// ============================================================

async function runSupplyChainCertificationCampaign() {
  console.log("========================================================================");
  console.log(" KWAKOPOS SUPPLY CHAIN CERTIFICATION (KSCOL v1.0.0)                     ");
  console.log(" Phase 36 — 100-Pillar Certification Suite                             ");
  console.log("========================================================================\n");

  const engine = new SupplyChainEngine();
  let passed = 0;
  let failed = 0;
  const failures: { id: string; description: string; error?: string }[] = [];

  for (const pillar of SUPPLY_CHAIN_CERTIFICATION_PILLARS) {
    try {
      const result = await pillar.test(engine);
      if (result) {
        passed++;
        console.log(` ✓ [${pillar.id}] ${pillar.description}`);
      } else {
        failed++;
        failures.push({ id: pillar.id, description: pillar.description });
        console.log(` ✗ [${pillar.id}] ${pillar.description}`);
      }
    } catch (err: any) {
      failed++;
      failures.push({ id: pillar.id, description: pillar.description, error: err?.message ?? String(err) });
      console.log(` ✗ [${pillar.id}] ${pillar.description} — EXCEPTION: ${err?.message ?? String(err)}`);
    }
  }

  const total = SUPPLY_CHAIN_CERTIFICATION_PILLARS.length;
  const rate = Math.round((passed / total) * 100);

  console.log("\n========================================================================");
  console.log(` TOTAL PILLARS: ${total}`);
  console.log(` PASSED       : ${passed}`);
  console.log(` FAILED       : ${failed}`);
  console.log(` SUCCESS RATE : ${rate}%`);
  console.log("========================================================================\n");

  if (failures.length > 0) {
    console.log("FAILED PILLARS:");
    failures.forEach(f => {
      console.log(`  - [${f.id}] ${f.description}${f.error ? ` (Error: ${f.error})` : ""}`);
    });
    console.log("");
    process.exit(1);
  } else {
    console.log("🎉 ALL 100 SUPPLY CHAIN CERTIFICATION PILLARS PASSED SUCCESSFULLY!\n");
    process.exit(0);
  }
}

runSupplyChainCertificationCampaign().catch(err => {
  console.error("Fatal error during certification execution:", err);
  process.exit(1);
});
