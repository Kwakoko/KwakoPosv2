import { runGarageCertification } from "./garage-certification-engine.js";

async function main() {
  const report = await runGarageCertification();
  if (!report.overallPassed) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal error during Garage certification:", err);
  process.exit(1);
});
