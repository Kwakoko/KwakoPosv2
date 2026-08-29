import { MarketplaceEngine } from "@kwakopos2/domain";
import { MarketplaceCategory } from "@kwakopos2/contracts";

export class MarketplaceService {
  private engine: MarketplaceEngine;

  constructor(engine?: MarketplaceEngine) {
    this.engine = engine ?? new MarketplaceEngine();
  }

  public getEngine(): MarketplaceEngine {
    return this.engine;
  }

  public registerProvider(params: Parameters<MarketplaceEngine["registerProvider"]>[0]) {
    return this.engine.registerProvider(params);
  }

  public publishListing(params: Parameters<MarketplaceEngine["publishListing"]>[0]) {
    return this.engine.publishListing(params);
  }

  public evaluateCompatibility(tenantId: string, listingId: string) {
    return this.engine.evaluateCompatibility(tenantId, listingId);
  }

  public installExtension(tenantId: string, listingId: string, installedScope: "TENANT" | "BRANCH" = "TENANT") {
    return this.engine.installExtension(tenantId, listingId, installedScope);
  }

  public uninstallExtension(tenantId: string, listingId: string) {
    return this.engine.uninstallExtension(tenantId, listingId);
  }

  public listListings(category?: MarketplaceCategory) {
    return this.engine.listListings(category);
  }

  public getHealthSummary(tenantId: string) {
    return this.engine.getHealthSummary(tenantId);
  }
}

export const globalMarketplaceService = new MarketplaceService();
