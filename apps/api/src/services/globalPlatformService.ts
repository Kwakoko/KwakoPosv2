import { GlobalPlatformEngine } from "@kwakopos2/domain";
import { GlobalRegion, DataResidencyPolicy } from "@kwakopos2/contracts";

export class GlobalPlatformService {
  private engine: GlobalPlatformEngine;

  constructor(engine?: GlobalPlatformEngine) {
    this.engine = engine ?? new GlobalPlatformEngine();
  }

  public getEngine(): GlobalPlatformEngine {
    return this.engine;
  }

  public registerCountryPack(params: Parameters<GlobalPlatformEngine["registerCountryPack"]>[0]) {
    return this.engine.registerCountryPack(params);
  }

  public setCurrencyRate(params: Parameters<GlobalPlatformEngine["setCurrencyRate"]>[0]) {
    return this.engine.setCurrencyRate(params);
  }

  public convertCurrency(amount: number, fromCurrency: string, toCurrency: string) {
    return this.engine.convertCurrency(amount, fromCurrency, toCurrency);
  }

  public configureResidencyPolicy(params: Parameters<GlobalPlatformEngine["configureResidencyPolicy"]>[0]) {
    return this.engine.configureResidencyPolicy(params);
  }

  public evaluateCrossBorderTransfer(tenantId: string, dataCategory: DataResidencyPolicy["dataCategory"], targetRegion: GlobalRegion) {
    return this.engine.evaluateCrossBorderTransfer(tenantId, dataCategory, targetRegion);
  }

  public getHealthSummary(tenantId: string) {
    return this.engine.getHealthSummary(tenantId);
  }
}

export const globalGlobalPlatformService = new GlobalPlatformService();
