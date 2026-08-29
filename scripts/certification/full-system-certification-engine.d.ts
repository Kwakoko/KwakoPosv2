import { CertificationEvidencePackage } from "./certification-evidence-bundle.js";
import { BusinessFlowResult } from "./business-flow-certifier.js";
import { CrossDomainResult } from "./cross-domain-certifier.js";
export type KPCPMode = "source" | "build" | "staging" | "deployed" | "full";
export declare function runFullSystemCertificationEngine(mode?: KPCPMode, overrideVersion?: string): Promise<{
    passed: boolean;
    evidencePackage: CertificationEvidencePackage;
    businessJourneys: Record<string, BusinessFlowResult>;
    crossDomainProbes: Record<string, CrossDomainResult>;
}>;
//# sourceMappingURL=full-system-certification-engine.d.ts.map