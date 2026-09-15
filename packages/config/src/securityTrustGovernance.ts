export const KWAKOKO_SECURITY_TRUST_GOVERNANCE = {
  version: "1.0.0",
  authority: "Kwakoko Security & Trust Experience Registry",
  purpose: "Make customer trust, identity, tenant isolation, authorization, secure sessions, auditability, and truthful security communication release-governed contracts.",
  layers: ["identity","session","tenant-isolation","authorization","data-protection","auditability","secure-configuration","security-ux","incident-transparency","ai-safety"] as const,
  requiredAuthorities: {
    releaseConfig: "packages/config/src/index.ts",
    auth: "packages/auth/src/index.ts",
    apiServer: "apps/api/src/server.ts",
    securityMiddleware: "apps/api/src/middleware/securityMiddleware.ts",
    platformSecurity: "apps/api/src/services/platformSecurityService.ts",
    auditEngine: "packages/domain/src/foundation/auditComplianceEngine.ts",
    tenantEngine: "packages/domain/src/foundation/tenantOrganizationEngine.ts",
    aiGovernance: "packages/config/src/aiAgentGovernance.ts",
    workflowGovernance: "packages/config/src/workflowGovernance.ts",
  },
  invariants: [
    "Production deployments MUST require externally supplied JWT_SECRET and DATABASE_URL.",
    "Authenticated API operations MUST resolve tenant context from trusted authentication state, not client display state.",
    "Cross-tenant access MUST fail closed.",
    "Privileged operations MUST have an explicit authorization boundary and platform context where applicable.",
    "Authentication endpoints MUST be rate limited.",
    "Security-sensitive operations MUST be auditable.",
    "Production release identity MUST contain an authentic Git SHA.",
    "Customer-facing security notices MUST distinguish verified facts from interpretation and never claim absolute security.",
    "Koko MUST NOT interrupt or influence security decisions or critical authentication transactions.",
    "AI-generated security changes MUST remain subject to this registry and the existing AI, workflow, brand, and design gates.",
  ] as const,
  forbiddenPatterns: [
    "Access-Control-Allow-Origin: * in production security paths",
    "hardcoded JWT or database secrets",
    "client-controlled tenant identity used as an authorization source",
    "absolute security claims such as 100% secure or impossible to breach",
    "security bypass comments or disabled authorization gates",
  ] as const,
  securityUx: {
    failClosedLabels: ["session expired","access denied","security check failed","verification required","tenant access denied"],
    requiresHumanConfirmFor: ["privileged destructive action","tenant-wide security reset","credential rotation","rollback authorization"],
    noMascotInterference: true,
  },
  certification: {
    certificate: "KWAKOKO-SECURITY-TRUST-CERTIFICATE-v1.0",
    delegatedGates: ["ai-agent-governance","workflow-integrity","brand-integrity"],
    failClosed: true,
  },
} as const;

export type KwakokoSecurityTrustGovernance = typeof KWAKOKO_SECURITY_TRUST_GOVERNANCE;
export function getSecurityTrustGovernance(): KwakokoSecurityTrustGovernance { return KWAKOKO_SECURITY_TRUST_GOVERNANCE; }
