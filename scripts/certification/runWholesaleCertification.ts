import { runWholesaleCertification } from "./wholesale-certification-engine.js";

async function main() {
  const report = await runWholesaleCertification();
  if (!report.overallPassed) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal error during Wholesale certification:", err);
  process.exit(1);
});
