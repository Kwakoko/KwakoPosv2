import { runPmfValidationCertification } from "./pmf-validation-certification-engine.js";

async function main() {
  const report = await runPmfValidationCertification();
  if (!report.overallPassed) {
    console.error("❌ PRODUCT-MARKET VALIDATION CERTIFICATION FAILED!");
    process.exit(1);
  } else {
    console.log("🎉 ALL 34 PRODUCT-MARKET VALIDATION PILLARS PASSED!");
  }
}

main().catch((err) => {
  console.error("Fatal error during PMF validation certification:", err);
  process.exit(1);
});
