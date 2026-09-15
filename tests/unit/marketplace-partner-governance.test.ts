import { describe, expect, it } from "vitest";
import { KWAKOKO_MARKETPLACE_PARTNER_GOVERNANCE as G } from "@kwakopos2/config";
import { MarketplaceEngine, PartnerEcosystemEngine } from "@kwakopos2/domain";
import { MARKETPLACE_CERTIFICATION_PILLARS } from "../../scripts/certification/marketplace-certification-engine.js";
import { runPartnerEcosystemCertification } from "../../scripts/certification/partner-ecosystem-certification-engine.js";

describe("Step 19 — Marketplace & Partner Ecosystem Governance", () => {
  it("defines a fail-closed lifecycle and marketplace certification policy", () => {
    expect(G.failClosed).toBe(true);
    expect(G.lifecycle.length).toBe(12);
    expect(G.marketplace.providerVerificationRequired).toBe(true);
    expect(G.marketplace.tenantIsolationRequired).toBe(true);
  });

  it("preserves partner sandbox and scoped-token boundaries", () => {
    const engine = new PartnerEcosystemEngine();
    const sandbox = engine.provisionSandboxEnvironment("PTR-TEST");
    expect(sandbox.isProductionAccess).toBe(false);
    const token = engine.generateScopedPartnerToken("PTR-TEST", "TEN-TEST", ["POS_VIEW", "RAW_DB_BYPASS"]);
    expect(token.authorizedTenantId).toBe("TEN-TEST");
    expect(token.allowedScopes).not.toContain("RAW_DB_BYPASS");
  });

  it("requires all extension certification gates before marketplace publication", () => {
    const engine = new PartnerEcosystemEngine();
    const gates = engine.validateMarketplaceExtension({
      extensionId: "EXT-TEST", publisherPartnerId: "PTR-TEST", title: "Test Extension", version: "1.0.0",
      category: "ADDON", requestedPermissions: ["POS_VIEW"], supportedKwakoPosVersion: "2.12.5",
      offlineCompatible: true, publishedStatus: "UNDER_REVIEW",
    });
    expect(gates.all12GatesPassed).toBe(true);
  });

  it("keeps existing marketplace and partner certification authorities available", () => {
    expect(MARKETPLACE_CERTIFICATION_PILLARS.length).toBe(100);
    const partnerCert = runPartnerEcosystemCertification();
    expect(partnerCert.totalPillars).toBe(48);
    expect(partnerCert.passedPillars).toBe(48);
  });

  it("preserves marketplace tenant installation boundaries", () => {
    const engine = new MarketplaceEngine();
    const provider = engine.registerProvider({ providerId: "P", legalName: "Provider", sellerType: "CERTIFIED_PARTNER", isVerified: true, supportContactEmail: "support@example.com" });
    expect(provider.success).toBe(true);
    const listing = engine.publishListing({ listingId: "L", providerId: "P", title: "Extension", category: "APPLICATIONS", version: "1.0.0", description: "Certified extension", pricingModel: "FREE", certificationLevel: "CERTIFIED", manifest: { extensionId: "E", version: "1.0.0", requiredModules: [], permissions: ["POS_VIEW"], declaredRoutes: [], eventSubscriptions: [], dataAccessScopes: [], countrySupport: ["TZ"] } });
    expect(listing.success).toBe(true);
    const installed = engine.installExtension("TEN-01", "L", "TENANT");
    expect(installed.installation?.tenantId).toBe("TEN-01");
  });

  it("distinguishes controlled certification from external production evidence", () => {
    expect(G.operations.controlledCertificationDistinctFromProductionProof).toBe(true);
  });
});
