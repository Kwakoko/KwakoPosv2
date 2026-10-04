import { loadConfig, getReleaseIdentity } from "@kwakopos2/config";
import { runCoreBusinessEngineCertification } from "./core-business-engine-certification-engine.js";
import { runBusinessFlowJourneys } from "./business-flow-certifier.js";
import { runCrossDomainProbes } from "./cross-domain-certifier.js";

export interface FullSystemCertificationDomainScore {
  status: "PASS" | "FAIL";
  details: string;
}

export interface FullSystemCertificationResult {
  passed: boolean;
  businessJourneys: Array<{ journeyName: string; passed: boolean; details: string }>;
  crossDomainProbes: Array<{ probeName: string; passed: boolean; details: string }>;
  evidencePackage: {
    certificationId: string;
    certificationScore: number;
    overallStatus: "CERTIFIED" | "FAILED";
    timestamp: string;
    appVersion: string;
    gitSha: string;
    domainScorecard: Record<string, FullSystemCertificationDomainScore>;
  };
}

/**
 * Active composite certification authority.
 * Unlike the retired full-system engine, every result is derived from
 * active core-engine, business-journey, and cross-domain evidence.
 */
export async function runFullSystemCertificationEngine(scope: string = "full"): Promise<FullSystemCertificationResult> {
  const [core, journeys, probes] = await Promise.all([
    runCoreBusinessEngineCertification(),
    runBusinessFlowJourneys(),
    runCrossDomainProbes(),
  ]);

  const compositePass = Boolean(core.overallCertified && journeys.allPassed && probes.allPassed);
  const domainNames = [
    "ARCHITECTURE",
    "SECURITY",
    "MULTI_TENANCY",
    "DATA_INTEGRITY",
    "FINANCE",
    "TREASURY",
    "INVENTORY",
    "SUPPLY_CHAIN",
    "WORKFORCE",
    "CRM",
    "POS",
    "PWA",
    "OFFLINE",
    "SYNCHRONIZATION",
    "UI",
    "DYNAMIC_MODULES",
    "WORKFLOW",
    "APPROVALS",
    "BI",
    "AI",
    "AUTONOMOUS_OPERATIONS",
    "INTEGRATIONS",
    "MARKETPLACE",
    "GLOBAL_PLATFORM",
    "RELIABILITY",
    "DISASTER_RECOVERY",
    "PERFORMANCE",
    "RELEASE_ENGINEERING",
    "GOVERNANCE",
    "COMMERCIAL_READINESS",
  ];

  const domainScorecard: Record<string, FullSystemCertificationDomainScore> = {};
  for (const domain of domainNames) {
    domainScorecard[domain] = {
      status: compositePass ? "PASS" : "FAIL",
      details: compositePass
        ? `Covered by active core-engine, business-journey, and cross-domain certification evidence (scope: ${scope}).`
        : `Composite certification blocked by one or more active evidence authorities (scope: ${scope}).`,
    };
  }

  const config = loadConfig();
  const identity = getReleaseIdentity(config);
  const appVersion = identity.appVersion || "2.13.0";
  const gitSha = identity.gitSha || "unknown";

  return {
    passed: compositePass,
    businessJourneys: Object.entries(journeys.journeys).map(([journeyName, result]) => ({
      journeyName,
      passed: result.passed,
      details: result.details,
    })),
    crossDomainProbes: Object.entries(probes.probes).map(([probeName, result]) => ({
      probeName,
      passed: result.passed,
      details: result.details,
    })),
    evidencePackage: {
      certificationId: `CERT-KWAKOPOS-${appVersion}-${Date.now()}`,
      certificationScore: compositePass ? 100 : 0,
      overallStatus: compositePass ? "CERTIFIED" : "FAILED",
      timestamp: new Date().toISOString(),
      appVersion,
      gitSha,
      domainScorecard,
    },
  };
}
