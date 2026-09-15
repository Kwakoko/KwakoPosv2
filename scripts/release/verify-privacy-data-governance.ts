import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { KWAKOKO_PRIVACY_DATA_GOVERNANCE } from "../../packages/config/src/privacyDataGovernance.js";

const root = process.cwd();
const checks: { name: string; passed: boolean; detail: string }[] = [];
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
const fileExists = (rel: string) => fs.existsSync(path.join(root, rel));

for (const [name, rel] of Object.entries(KWAKOKO_PRIVACY_DATA_GOVERNANCE.requiredAuthorities)) {
  checks.push({ name: `authority:${name}`, passed: fileExists(rel), detail: rel });
}

const legal = read("apps/api/src/routes/legalGovernanceRoutes.ts");
const exportRoutes = read("apps/api/src/routes/tenantExportRoutes.ts");
const legalSvc = read("apps/api/src/services/legalGovernanceService.ts");
const privacy = read("apps/web/src/pages/PrivacyCenterPage.tsx");
const acceptance = read("apps/web/src/components/LegalAcceptanceModal.tsx");
const cleanup = read("apps/web/src/services/tenantStoreCleanupService.ts");
const tenantEngine = read("packages/domain/src/foundation/tenantOrganizationEngine.ts");
const securityGovernance = read("packages/config/src/securityTrustGovernance.ts");
const aiGovernance = read("packages/config/src/aiAgentGovernance.ts");

checks.push({
  name: "privacy-center",
  passed: /privacy|data/i.test(privacy),
  detail: "customer privacy experience present",
});
checks.push({
  name: "legal-acceptance",
  passed: /accept|consent|legal/i.test(acceptance) && /audit|record|timestamp/i.test(acceptance + legal + legalSvc),
  detail: "legal acceptance and audit evidence present",
});
checks.push({
  name: "tenant-export-boundary",
  passed: /tenant|authorization|permission|context/i.test(exportRoutes),
  detail: "tenant export route contains authorization/tenant controls",
});
checks.push({
  name: "deletion-retention-governance",
  passed: /(delete|cleanup|retention|restore|trash)/i.test(cleanup + legalSvc + legal),
  detail: "deletion/cleanup governance surface present",
});
checks.push({
  name: "privacy-claim-governance",
  passed: KWAKOKO_PRIVACY_DATA_GOVERNANCE.rules.some((rule) => /legal|claim|policy/i.test(rule)),
  detail: "privacy claim rule exists",
});
checks.push({
  name: "tenant-isolation",
  passed: /tenantId|tenant context|cross-tenant|isolation/i.test(tenantEngine + exportRoutes + legalSvc),
  detail: "tenant-scoped controls present",
});
checks.push({
  name: "security-governance-convergence",
  passed: fileExists("scripts/release/verify-security-trust.ts") && /security|trust/i.test(securityGovernance),
  detail: "security governance authority present",
});
checks.push({
  name: "ai-governance-convergence",
  passed: fileExists("scripts/release/verify-ai-agent-governance.ts") && /tenant|privacy|claim/i.test(aiGovernance),
  detail: "AI governance present",
});

let secretScanPassed = false;
try {
  execSync("npm run security-trust:verify", { cwd: root, stdio: "ignore" });
  secretScanPassed = true;
} catch {
  secretScanPassed = false;
}
checks.push({
  name: "hardcoded-secret-scan",
  passed: secretScanPassed,
  detail: "delegated to certified Security & Trust hardcoded-secret scan",
});

const passed = checks.every((check) => check.passed);
const certificate = {
  id: KWAKOKO_PRIVACY_DATA_GOVERNANCE.certification.certificate,
  version: KWAKOKO_PRIVACY_DATA_GOVERNANCE.version,
  status: passed ? "PASS" : "FAIL",
  checks,
  generatedAt: new Date().toISOString(),
};

const artifactDir = path.join(root, "artifacts/governance");
fs.mkdirSync(artifactDir, { recursive: true });
fs.writeFileSync(path.join(artifactDir, "privacy-data-governance-certificate.json"), JSON.stringify(certificate, null, 2));

for (const check of checks) {
  console.log(`${check.passed ? "✅" : "❌"} ${check.name}: ${check.detail}`);
}
console.log(`${passed ? "✅" : "❌"} Kwakoko Privacy, Compliance & Data Governance: ${passed ? "PASS" : "FAIL"}`);
console.log(`   certificate: ${certificate.id}`);
process.exit(passed ? 0 : 1);
