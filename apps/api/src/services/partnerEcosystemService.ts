import {
  PartnerProfile,
  PartnerCategory,
  PartnerCertificationRecord,
  PartnerSandboxEnvironment,
  MarketplaceExtensionManifest,
  MarketplaceExtensionGate,
  PartnerScopedApiToken,
  PartnerPerformanceScorecard,
  PartnerCapacityMetrics,
} from "@kwakopos2/contracts";
import { globalPartnerEcosystemEngine } from "@kwakopos2/domain";

export class PartnerEcosystemService {
  private registeredExtensions: Map<string, MarketplaceExtensionManifest> = new Map();

  public applyPartner(input: {
    legalEntityName: string;
    category: PartnerCategory;
    territory: string;
    contactEmail: string;
    contactPhone: string;
    technicalCapabilityScore: number;
    financialStabilityScore: number;
    securityMaturityScore: number;
  }): PartnerProfile {
    return globalPartnerEcosystemEngine.conductPartnerDueDiligence(input);
  }

  public certifyPartner(
    partnerId: string,
    certType: "SALES_CERTIFIED" | "IMPLEMENTATION_CERTIFIED" | "TECHNICAL_CERTIFIED" | "INTEGRATION_CERTIFIED" | "INDUSTRY_CERTIFIED" | "SUPPORT_CERTIFIED",
    assessmentScore: number,
    verticalSpecialization?: string
  ): PartnerCertificationRecord {
    return globalPartnerEcosystemEngine.issuePartnerCertification(partnerId, certType, assessmentScore, verticalSpecialization);
  }

  public provisionSandbox(partnerId: string): PartnerSandboxEnvironment {
    return globalPartnerEcosystemEngine.provisionSandboxEnvironment(partnerId);
  }

  public validateAndRegisterExtension(manifest: MarketplaceExtensionManifest): {
    manifest: MarketplaceExtensionManifest;
    gates: MarketplaceExtensionGate;
  } {
    const gates = globalPartnerEcosystemEngine.validateMarketplaceExtension(manifest);
    if (gates.all12GatesPassed) {
      manifest.publishedStatus = "CERTIFIED_PUBLISHED";
      this.registeredExtensions.set(manifest.extensionId, manifest);
    } else {
      manifest.publishedStatus = "REJECTED";
    }
    return { manifest, gates };
  }

  public generateScopedToken(
    partnerId: string,
    authorizedTenantId: string,
    scopes: string[]
  ): PartnerScopedApiToken {
    return globalPartnerEcosystemEngine.generateScopedPartnerToken(partnerId, authorizedTenantId, scopes);
  }

  public getPartnerHealthScore(input: {
    activeImplementationsCount: number;
    successfulGoLivesCount: number;
    customerRetentionPct: number;
    supportEscalationRatePct: number;
    customerSatisfactionNps: number;
  }): PartnerPerformanceScorecard {
    return globalPartnerEcosystemEngine.calculatePartnerHealthScore(input);
  }

  public getCapacityMetrics(certifiedPartnersCount: number): PartnerCapacityMetrics {
    return globalPartnerEcosystemEngine.calculatePartnerCapacityModel(certifiedPartnersCount);
  }

  public getPublicRegistry(): Array<{ partnerId: string; name: string; tier: string; category: string }> {
    return [
      { partnerId: "PTR-ENT-001", name: "Apex Enterprise Tech Solutions", tier: "STRATEGIC", category: "SYSTEM_INTEGRATOR" },
      { partnerId: "PTR-RET-002", name: "Kariakoo POS Retail Partners", tier: "ADVANCED", category: "IMPLEMENTATION" },
      { partnerId: "PTR-PAY-003", name: "Swahili Pay Merchant Solutions", tier: "CERTIFIED", category: "PAYMENT" },
    ];
  }
}

export const globalPartnerEcosystemService = new PartnerEcosystemService();
