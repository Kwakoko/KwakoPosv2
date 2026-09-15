import fs from "node:fs";
import path from "node:path";
import {
  KWAKOKO_PLATFORM_GOVERNANCE_VERSION,
  KWAKOKO_PLATFORM_GOVERNANCE_CERTIFICATE,
  PLATFORM_GOVERNANCE_LIFECYCLE,
  PLATFORM_AUTHORITY_HIERARCHY,
  PLATFORM_GOVERNANCE_INVARIANTS,
  PLATFORM_GOVERNANCE_RELEASE_GATES,
  PLATFORM_GOVERNANCE_AUTHORITIES,
} from "@kwakopos2/config";

const root = process.cwd();
const checks: Array<[string, boolean, string]> = [];
const check = (name: string, passed: boolean, detail: string) => checks.push([name, passed, detail]);
const exists = (file: string) => fs.existsSync(path.join(root, file));
const text = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

check("authority-core", exists("packages/config/src/platformGovernanceControlPlane.ts") && exists("packages/contracts/src/platformGovernanceContracts.ts"), "canonical platform authority and contract exist");
check("version", KWAKOKO_PLATFORM_GOVERNANCE_VERSION === "1.0.0", KWAKOKO_PLATFORM_GOVERNANCE_VERSION);
check("certificate", KWAKOKO_PLATFORM_GOVERNANCE_CERTIFICATE === "KWAKOKO-PLATFORM-GOVERNANCE-CERTIFICATE-v1.0", KWAKOKO_PLATFORM_GOVERNANCE_CERTIFICATE);
check("lifecycle", PLATFORM_GOVERNANCE_LIFECYCLE.join("â†’") === "PROPOSEâ†’ASSESSâ†’AUTHORIZEâ†’IMPLEMENTâ†’VERIFYâ†’PUBLISHâ†’MONITORâ†’EXCEPTâ†’REVIEWâ†’RETIRE", "canonical lifecycle");
check("authority-hierarchy", PLATFORM_AUTHORITY_HIERARCHY.join("â†’") === "GLOBAL_PLATFORMâ†’COUNTRYâ†’TENANTâ†’BRANCHâ†’USER", "canonical precedence");
check("invariants", PLATFORM_GOVERNANCE_INVARIANTS.length === 19 && PLATFORM_GOVERNANCE_INVARIANTS.includes("tenant-isolation") && PLATFORM_GOVERNANCE_INVARIANTS.includes("segregation-of-duties") && PLATFORM_GOVERNANCE_INVARIANTS.includes("no-hardcoded-health-claims"), `count=${PLATFORM_GOVERNANCE_INVARIANTS.length}`);
check("release-gates", PLATFORM_GOVERNANCE_RELEASE_GATES.length === 15, `count=${PLATFORM_GOVERNANCE_RELEASE_GATES.length}`);
for (const [key, file] of Object.entries(PLATFORM_GOVERNANCE_AUTHORITIES)) check(`authority:${key}`, exists(file), file);
check("super-admin-kill-switch", text(PLATFORM_GOVERNANCE_AUTHORITIES.superAdminContracts).includes("PlatformEmergencyKillSwitchSchema"), "kill switch contract");
check("super-admin-sod", ["PLATFORM_ADMIN", "SECURITY_ADMIN", "RELEASE_ADMIN"].every(v => text(PLATFORM_GOVERNANCE_AUTHORITIES.superAdminContracts).includes(v)), "delegated admin roles");
check("tenant-hierarchy", text(PLATFORM_GOVERNANCE_AUTHORITIES.superAdminContracts).includes("tenantId") && exists(PLATFORM_GOVERNANCE_AUTHORITIES.tenantOrganization), "tenant/organization authority");
check("module-registry", text(PLATFORM_GOVERNANCE_AUTHORITIES.moduleRegistry).length > 0, "module registry present");
check("release-authority", text(PLATFORM_GOVERNANCE_AUTHORITIES.authoritativeRelease).includes("releaseId") && text(PLATFORM_GOVERNANCE_AUTHORITIES.releasePolicy).length > 0 && text(PLATFORM_GOVERNANCE_AUTHORITIES.releaseState).length > 0, "release authorities present");
check("prior-governance", [PLATFORM_GOVERNANCE_AUTHORITIES.aiAgentGovernance, PLATFORM_GOVERNANCE_AUTHORITIES.aiOperatingLayer, PLATFORM_GOVERNANCE_AUTHORITIES.autonomousOperations, PLATFORM_GOVERNANCE_AUTHORITIES.securityTrust, PLATFORM_GOVERNANCE_AUTHORITIES.privacyData, PLATFORM_GOVERNANCE_AUTHORITIES.reliability, PLATFORM_GOVERNANCE_AUTHORITIES.performance, PLATFORM_GOVERNANCE_AUTHORITIES.lifecycleDr, PLATFORM_GOVERNANCE_AUTHORITIES.biAnalytics, PLATFORM_GOVERNANCE_AUTHORITIES.commercial, PLATFORM_GOVERNANCE_AUTHORITIES.enterprise, PLATFORM_GOVERNANCE_AUTHORITIES.integrations, PLATFORM_GOVERNANCE_AUTHORITIES.marketplace].every(exists), "previous governance authorities present");
const cc = text("apps/web/src/platformGovernanceCommandCenter.ts");
const forbidden = ["100% PASSING", "1,240 Endpoints", "48 ADRs", "25 / 100", "100.0 %"].filter(v => cc.includes(v));
check("no-hardcoded-control-tower-claims", forbidden.length === 0, forbidden.length ? `forbidden=${forbidden.join(",")}` : "no synthetic control-tower claims");
check("legacy-platform-certification", exists(PLATFORM_GOVERNANCE_AUTHORITIES.platformCertification) && text(PLATFORM_GOVERNANCE_AUTHORITIES.platformCertification).includes("results.length"), "legacy controlled certification preserved");

const passed = checks.filter(([, ok]) => ok).length;
console.log(`KWAKOKO PLATFORM GOVERNANCE VERIFIER v${KWAKOKO_PLATFORM_GOVERNANCE_VERSION}`);
for (const [name, ok, detail] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
console.log(`SUMMARY ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exit(1);
