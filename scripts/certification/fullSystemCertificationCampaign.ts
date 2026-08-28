import { runFullSystemCertificationEngine } from "./full-system-certification-engine.js";

export async function runFullSystemCertificationCampaign() {
  const res = await runFullSystemCertificationEngine();
  return {
    passed: res.passed,
    summary: res.evidencePackage.overallStatus === "CERTIFIED" ? "100% All 17 Domains Certified" : "Certification Failed",
    items: Object.entries(res.evidencePackage.domainScorecard).map(([domain, info]) => ({
      domain,
      scope: domain,
      passed: info.status === "PASS",
      message: info.details,
    })),
  };
}

if (process.argv[1]?.endsWith("fullSystemCertificationCampaign.ts")) {
  runFullSystemCertificationCampaign().then((res) => {
    if (!res.passed) process.exit(1);
  });
}
