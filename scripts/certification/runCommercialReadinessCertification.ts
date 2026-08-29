import { runCommercialReadinessCertification } from "./commercial-readiness-certification-engine.js";

async function main() {
  const report = await runCommercialReadinessCertification();
  if (!report.overallPassed) {
    console.error("❌ COMMERCIAL PRODUCT READINESS CERTIFICATION FAILED!");
    process.exit(1);
  } else {
    console.log("🎉 ALL 30 COMMERCIAL PRODUCT READINESS PILLARS PASSED!");
  }
}

main().catch((err) => {
  console.error("Fatal error during commercial readiness certification:", err);
  process.exit(1);
});
