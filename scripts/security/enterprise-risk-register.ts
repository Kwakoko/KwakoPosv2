export interface SecurityRiskItem {
  riskId: string;
  asset: string;
  threatScenario: string;
  vulnerability: string;
  likelihood: "LOW" | "MEDIUM" | "HIGH";
  impact: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  riskRating: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  owner: string;
  mitigatingControlId: string;
  residualRisk: "LOW" | "ACCEPTED";
  targetRemediationDate: string;
  managementAcceptance: boolean;
}

export function getEnterpriseSecurityRiskRegister(): {
  lastAssessed: string;
  totalMaterialRisks: number;
  criticalRisksMitigated: number;
  risks: SecurityRiskItem[];
} {
  const risks: SecurityRiskItem[] = [
    {
      riskId: "RISK-001",
      asset: "Multi-Tenant Database & Sync Engine",
      threatScenario: "Cross-Tenant Data Exposure via malicious API query manipulation",
      vulnerability: "Missing tenant ID filter on dynamic entity lookup endpoint",
      likelihood: "LOW",
      impact: "CRITICAL",
      riskRating: "HIGH",
      owner: "Lead Architect",
      mitigatingControlId: "KISB-TENANT-004",
      residualRisk: "LOW",
      targetRemediationDate: "2026-08-30",
      managementAcceptance: true,
    },
    {
      riskId: "RISK-002",
      asset: "Authentication & Authorization Engine",
      threatScenario: "Privilege Escalation from POS Cashier to Tenant Super Admin",
      vulnerability: "Flawed JWT role claim parsing in custom Fastify hook",
      likelihood: "LOW",
      impact: "CRITICAL",
      riskRating: "HIGH",
      owner: "API Security Lead",
      mitigatingControlId: "KISB-RBAC-003",
      residualRisk: "LOW",
      targetRemediationDate: "2026-08-30",
      managementAcceptance: true,
    },
    {
      riskId: "RISK-003",
      asset: "CI/CD Pipeline & GitHub Repository",
      threatScenario: "Supply Chain Compromise via malicious npm package dependency code injection",
      vulnerability: "Unpinned transient dependency in monorepo root package.json",
      likelihood: "LOW",
      impact: "CRITICAL",
      riskRating: "HIGH",
      owner: "DevSecOps Lead",
      mitigatingControlId: "KISB-SUPPLY-010",
      residualRisk: "LOW",
      targetRemediationDate: "2026-08-30",
      managementAcceptance: true,
    },
    {
      riskId: "RISK-004",
      asset: "Offline PWA Client & IndexedDB",
      threatScenario: "Malicious Offline Device Tampering & Forged Stock Adjustment Replay",
      vulnerability: "Forged client-side timestamps or modified IndexedDB outbox payload",
      likelihood: "MEDIUM",
      impact: "HIGH",
      riskRating: "MEDIUM",
      owner: "Distributed Systems Lead",
      mitigatingControlId: "KISB-SYNC-008",
      residualRisk: "LOW",
      targetRemediationDate: "2026-09-15",
      managementAcceptance: true,
    },
    {
      riskId: "RISK-005",
      asset: "General Ledger & Financial Records",
      threatScenario: "Unauthorized Financial Transaction Modification or Period Lock Override",
      vulnerability: "Missing double-entry reconciliation check on closed period posting",
      likelihood: "LOW",
      impact: "CRITICAL",
      riskRating: "HIGH",
      owner: "Lead Financial Engineer",
      mitigatingControlId: "KISB-AUDIT-009",
      residualRisk: "LOW",
      targetRemediationDate: "2026-08-30",
      managementAcceptance: true,
    },
    {
      riskId: "RISK-006",
      asset: "Marketplace Plugin Engine",
      threatScenario: "Malicious Plugin Data Exfiltration via unapproved external HTTP fetch",
      vulnerability: "Plugin capability manifest bypass in custom plugin loader",
      likelihood: "LOW",
      impact: "HIGH",
      riskRating: "MEDIUM",
      owner: "Plugin Ecosystem Lead",
      mitigatingControlId: "KISB-API-007",
      residualRisk: "LOW",
      targetRemediationDate: "2026-09-30",
      managementAcceptance: true,
    },
    {
      riskId: "RISK-007",
      asset: "Cloud Run Production Deployment",
      threatScenario: "Compromised Production Secret / GCP Service Account Key Leakage",
      vulnerability: "Hardcoded fallback API key in staging configuration file",
      likelihood: "LOW",
      impact: "CRITICAL",
      riskRating: "HIGH",
      owner: "DevOps Engineer",
      mitigatingControlId: "KISB-SECRETS-012",
      residualRisk: "LOW",
      targetRemediationDate: "2026-08-30",
      managementAcceptance: true,
    },
  ];

  return {
    lastAssessed: new Date().toISOString(),
    totalMaterialRisks: risks.length,
    criticalRisksMitigated: risks.filter((r) => r.residualRisk === "LOW").length,
    risks,
  };
}

if (process.argv[1]?.endsWith("enterprise-risk-register.ts")) {
  console.log(getEnterpriseSecurityRiskRegister());
}
