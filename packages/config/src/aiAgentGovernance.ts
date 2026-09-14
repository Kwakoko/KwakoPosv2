import fs from "node:fs";
import path from "node:path";

export const KWAKOKO_AI_AGENT_GOVERNANCE = {
  version: "1.0.0",
  authority: "Kwakoko AI Product-Agent Governance Registry",
  purpose: "Prevent AI-generated or AI-assisted product changes from bypassing Kwakoko architecture, brand, UX, security, persistence, localization, and release-certification contracts.",
  canonicalAuthorities: {
    brandHierarchy: "packages/config/src/brandHierarchy.ts",
    positioning: "packages/config/src/brandPositioning.ts",
    visualIdentity: "packages/config/src/visualIdentity.ts",
    voice: "packages/config/src/brandVoice.ts",
    koko: "packages/config/src/kokoAmbassador.ts",
    experience: "packages/config/src/experienceGovernance.ts",
    designSystem: "packages/config/src/designSystem.ts",
    workflow: "packages/config/src/workflowGovernance.ts",
    aiAgent: "packages/config/src/aiAgentGovernance.ts",
  },
  mandatoryRules: [
    "AI-generated changes MUST use canonical Kwakoko naming, positioning, voice, and visual authorities.",
    "AI-generated UI MUST use governed design-system contracts and MUST NOT introduce uncontrolled visual variants.",
    "AI-generated interactive controls MUST satisfy the closed-loop UI → Action → Route → Service → Persistence → Permission → Outcome contract.",
    "AI-generated mutations MUST have an authoritative persistence path and offline outbox handling where the capability is offline-first.",
    "AI-generated privileged operations MUST have an explicit permission boundary and appropriate platform context for Super Admin operations.",
    "AI-generated browser code MUST NOT import Node-only runtime modules or server-only configuration contracts.",
    "AI-generated business logic MUST preserve tenant isolation and MUST NOT infer tenant identity from client-controlled display state.",
    "AI-generated customer-facing claims MUST be supportable and MUST NOT represent roadmap or unverified behavior as available capability.",
    "AI-generated localized copy MUST preserve semantic meaning across English, Kiswahili, and French and MUST use canonical terminology.",
    "AI agents MUST NOT bypass, disable, weaken, mock, or suppress release certification gates.",
    "AI agents MUST NOT hide discovered governance findings; blocking findings remain release-blocking until remediated.",
  ],
  requiredReleaseGates: [
    "brand:verify",
    "design:verify",
    "experience:verify",
    "workflow:verify",
    "ai-governance:verify",
    "test:unit",
    "build",
  ],
  prohibitedBrowserImports: [
    "node:fs", "node:path", "node:crypto", "node:child_process", "fs", "path", "crypto", "child_process",
  ],
  prohibitedGovernanceBypasses: [
    "SKIP_GOVERNANCE",
    "DISABLE_GOVERNANCE",
    "BYPASS_CERTIFICATION",
    "ALLOW_GOVERNANCE_FAILURE",
    "IGNORE_GOVERNANCE_FAILURE",
    "eslint-disable",
  ],
  certification: {
    certificate: "KWAKOKO-AI-AGENT-CERTIFICATE-v1.0",
    failClosed: true,
    requireAuthorityFiles: true,
    requireExistingVerifierContracts: true,
    requireBrowserBoundaryScan: true,
    requireGovernanceGateConvergence: true,
  },
} as const;

export type KwakokoAiAgentGovernance = typeof KWAKOKO_AI_AGENT_GOVERNANCE;

export function getAiAgentGovernance(): KwakokoAiAgentGovernance {
  return KWAKOKO_AI_AGENT_GOVERNANCE;
}

export function resolveRepoRoot(start = process.cwd()): string {
  let current = path.resolve(start);
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "package.json"))) return current;
    current = path.dirname(current);
  }
  return path.resolve(start);
}
