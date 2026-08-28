import { runSecurityCertificationEngine } from "./security-certification-engine.js";

export async function runSecurityCertificationCLI() {
  const res = await runSecurityCertificationEngine();
  if (!res.passed) {
    console.error(" ❌ Phase 12 Security & Compliance Certification Failed.");
    process.exit(1);
  }
  console.log(" 🎉 KWAKOPOS PHASE 12 SECURITY CERTIFICATION PASSED: ASSESSMENT-READY");
}

if (process.argv[1]?.endsWith("runSecurityCertification.ts")) {
  runSecurityCertificationCLI();
}
