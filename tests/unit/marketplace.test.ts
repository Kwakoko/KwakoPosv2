import { describe, it, expect, beforeEach } from "vitest";
import { MarketplaceEngine } from "@kwakopos2/domain";

describe("Phase 40 — KwakoPos Marketplace OS (KMKOL v1.0.0)", () => {
  let engine: MarketplaceEngine;

  beforeEach(() => {
    engine = new MarketplaceEngine();
  });

  it("should register provider, publish listing, evaluate compatibility, and install extension", () => {
    const prov = engine.registerProvider({
      providerId: "P-T1", legalName: "Kwakoko Software", sellerType: "KWAKOKO",
      isVerified: true, supportContactEmail: "support@kwakoko.com",
    });
    expect(prov.success).toBe(true);

    const list = engine.publishListing({
      listingId: "LST-T1", providerId: "P-T1", title: "Pharmacy Expiry Tracking",
      category: "APPLICATIONS", version: "2.0.0", description: "Batch & Expiry alerts",
      pricingModel: "FREE", certificationLevel: "ENTERPRISE_CERTIFIED",
      manifest: {
        extensionId: "EXT-PHARM-01", version: "2.0.0", requiredModules: ["PHARMACY"],
        permissions: ["pharmacy.read"], declaredRoutes: ["/pharmacy/expiry"],
        eventSubscriptions: [], dataAccessScopes: ["BATCH"], countrySupport: ["GLOBAL"],
      },
    });
    expect(list.success).toBe(true);

    const inst = engine.installExtension("TEN-01", "LST-T1", "TENANT");
    expect(inst.success).toBe(true);
    expect(inst.installation?.status).toBe("ACTIVE");

    const hs = engine.getHealthSummary("TEN-01");
    expect(hs.engineOperational).toBe(true);
    expect(hs.installedExtensionsCount).toBe(1);
    expect(hs.certifiedListingsRatioPercent).toBe(100);
  });
});
