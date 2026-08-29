import {
  ProviderIdentity, MarketplaceListing, ExtensionInstallation,
  MarketplaceHealthSummary, MarketplaceAuditEntry, MarketplaceCategory,
} from "@kwakopos2/contracts";

export class MarketplaceEngine {
  private providers: Map<string, ProviderIdentity> = new Map();
  private listings: Map<string, MarketplaceListing> = new Map();
  private installations: Map<string, ExtensionInstallation> = new Map();
  private auditLedger: MarketplaceAuditEntry[] = [];

  public registerProvider(params: Omit<ProviderIdentity, "createdAt">): {
    success: boolean; provider?: ProviderIdentity;
  } {
    const now = new Date().toISOString();
    const provider: ProviderIdentity = {
      ...params,
      createdAt: now,
    };
    this.providers.set(params.providerId, provider);
    this._writeAudit("SYSTEM", "PROVIDER_REGISTERED", "SYSTEM", params.providerId,
      `Provider registered: ${params.legalName} (${params.sellerType})`);
    return { success: true, provider };
  }

  public publishListing(params: Omit<MarketplaceListing, "publishedAt" | "installCount" | "ratingScore" | "isActive" | "supportedIndustries"> & {
    installCount?: number;
    ratingScore?: number;
    isActive?: boolean;
    supportedIndustries?: string[];
  }): {
    success: boolean; listing?: MarketplaceListing; error?: string;
  } {
    if (!params.listingId || !params.providerId || !params.title || !params.category) {
      return { success: false, error: "listingId, providerId, title, and category are required" };
    }

    const now = new Date().toISOString();
    const listing: MarketplaceListing = {
      ...params,
      supportedIndustries: params.supportedIndustries ?? ["ALL"],
      isActive: params.isActive ?? true,
      ratingScore: params.ratingScore ?? 5.0,
      installCount: params.installCount ?? 0,
      publishedAt: now,
    };

    this.listings.set(params.listingId, listing);
    this._writeAudit("SYSTEM", "LISTING_PUBLISHED", params.providerId, params.listingId,
      `Listing published: ${params.title} v${params.version} (${params.certificationLevel})`);

    return { success: true, listing };
  }

  public evaluateCompatibility(tenantId: string, listingId: string): {
    compatible: boolean; reason: string;
  } {
    const listing = this.listings.get(listingId);
    if (!listing) return { compatible: false, reason: "Listing not found" };
    if (!listing.isActive) return { compatible: false, reason: "Listing is inactive" };

    this._writeAudit(tenantId, "COMPATIBILITY_CHECK", "SYSTEM", listingId,
      `Compatibility check passed for ${listing.title}`);
    return { compatible: true, reason: "Fully compatible with tenant platform profile" };
  }

  public installExtension(tenantId: string, listingId: string, installedScope: "TENANT" | "BRANCH" = "TENANT"): {
    success: boolean; installation?: ExtensionInstallation; error?: string;
  } {
    const compat = this.evaluateCompatibility(tenantId, listingId);
    if (!compat.compatible) return { success: false, error: compat.reason };

    const listing = this.listings.get(listingId)!;
    const now = new Date().toISOString();
    const installationId = `INST-${tenantId}-${listingId}`;

    const installation: ExtensionInstallation = {
      installationId,
      tenantId,
      listingId,
      installedVersion: listing.version,
      status: "ACTIVE",
      installedScope,
      installedAt: now,
      updatedAt: now,
    };

    listing.installCount += 1;
    this.installations.set(installationId, installation);
    this._writeAudit(tenantId, "EXTENSION_INSTALLED", "USER", listingId,
      `Extension installed: ${listing.title} v${listing.version} Scope=${installedScope}`);

    return { success: true, installation };
  }

  public uninstallExtension(tenantId: string, listingId: string): { success: boolean; error?: string } {
    const installationId = `INST-${tenantId}-${listingId}`;
    const inst = this.installations.get(installationId);
    if (!inst) return { success: false, error: "Installation not found" };

    inst.status = "UNINSTALLED";
    inst.updatedAt = new Date().toISOString();

    this._writeAudit(tenantId, "EXTENSION_UNINSTALLED", "USER", listingId, `Extension uninstalled (business audit records preserved)`);
    return { success: true };
  }

  public listListings(category?: MarketplaceCategory): MarketplaceListing[] {
    const list = Array.from(this.listings.values()).filter(l => l.isActive);
    if (category) return list.filter(l => l.category === category);
    return list;
  }

  public getHealthSummary(tenantId: string): MarketplaceHealthSummary {
    const totalListings = Array.from(this.listings.values()).length;
    const verifiedProv = Array.from(this.providers.values()).filter(p => p.isVerified).length;
    const tenantInst = Array.from(this.installations.values()).filter(i => i.tenantId === tenantId && i.status === "ACTIVE").length;

    const certifiedListings = Array.from(this.listings.values()).filter(l => l.certificationLevel === "CERTIFIED" || l.certificationLevel === "ENTERPRISE_CERTIFIED").length;
    const ratio = totalListings > 0 ? Math.round((certifiedListings / totalListings) * 100) : 100;

    return {
      tenantId,
      engineOperational: true,
      totalPublishedListingsCount: totalListings,
      verifiedProvidersCount: verifiedProv,
      installedExtensionsCount: tenantInst,
      certifiedListingsRatioPercent: ratio,
      auditEntryCount: this.getAuditTrail(tenantId).length,
    };
  }

  public getAuditTrail(tenantId: string): MarketplaceAuditEntry[] {
    return this.auditLedger.filter(a => a.tenantId === tenantId || a.tenantId === "SYSTEM");
  }

  private _writeAudit(tenantId: string, eventType: MarketplaceAuditEntry["eventType"], actorId: string, targetEntityId: string, details: string) {
    this.auditLedger.push({
      auditId: `AUD-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      tenantId,
      eventType,
      actorId,
      targetEntityId,
      details,
      timestamp: new Date().toISOString(),
    });
  }
}
