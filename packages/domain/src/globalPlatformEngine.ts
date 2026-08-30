import {
  CountryPack, MultiCurrencyRateRecord, DataResidencyPolicy,
  GlobalPlatformHealthSummary, GlobalPlatformAuditEntry, GlobalRegion,
} from "@kwakopos2/contracts";

export class GlobalPlatformEngine {
  private countryPacks: Map<string, CountryPack> = new Map();
  private currencyRates: Map<string, MultiCurrencyRateRecord> = new Map();
  private residencyPolicies: Map<string, DataResidencyPolicy> = new Map();
  private auditLedger: GlobalPlatformAuditEntry[] = [];

  constructor() {
    // Seed default East Africa & Global country packs
    this.registerCountryPack({
      countryCode: "TZ", countryName: "Tanzania", region: "EAST_AFRICA",
      defaultCurrency: "TZS", defaultLanguage: "sw", taxEngineVersion: "TRA_EFDMS_v2",
      fiscalComplianceCode: "TRA_EFDMS", supportedPaymentGateways: ["MPESA", "TIGO_PESA", "AZAM_PAY", "NMB"],
    });
    this.registerCountryPack({
      countryCode: "KE", countryName: "Kenya", region: "EAST_AFRICA",
      defaultCurrency: "KES", defaultLanguage: "sw", taxEngineVersion: "KRA_TIMS_v1",
      fiscalComplianceCode: "KRA_TIMS", supportedPaymentGateways: ["MPESA", "EQUITY"],
    });
  }

  public registerCountryPack(params: Omit<CountryPack, "createdAt" | "isActive"> & { isActive?: boolean }): {
    success: boolean; pack?: CountryPack;
  } {
    const now = new Date().toISOString();
    const pack: CountryPack = {
      ...params,
      isActive: params.isActive ?? true,
      createdAt: now,
    };
    this.countryPacks.set(params.countryCode, pack);
    this._writeAudit("SYSTEM", "COUNTRY_PACK_REGISTERED", "SYSTEM", params.countryCode,
      `Country pack registered: ${params.countryName} (${params.region}) Currency=${params.defaultCurrency}`);
    return { success: true, pack };
  }

  public setCurrencyRate(params: Omit<MultiCurrencyRateRecord, "timestamp" | "rateSource"> & {
    rateSource?: string;
  }): {
    success: boolean; rate?: MultiCurrencyRateRecord;
  } {
    const now = new Date().toISOString();
    const rate: MultiCurrencyRateRecord = {
      ...params,
      rateSource: params.rateSource ?? "CENTRAL_BANK",
      timestamp: now,
    };
    const key = `${params.baseCurrency}:${params.targetCurrency}`;
    this.currencyRates.set(key, rate);
    this._writeAudit("SYSTEM", "CURRENCY_RATE_UPDATED", "SYSTEM", key,
      `Currency rate updated: 1 ${params.baseCurrency} = ${params.exchangeRate} ${params.targetCurrency}`);
    return { success: true, rate };
  }

  public convertCurrency(amount: number, fromCurrency: string, toCurrency: string): {
    convertedAmount: number; rate: number;
  } {
    if (fromCurrency === toCurrency) return { convertedAmount: amount, rate: 1.0 };
    const key = `${fromCurrency}:${toCurrency}`;
    const rateRecord = this.currencyRates.get(key);
    const rate = rateRecord ? rateRecord.exchangeRate : 1.0;
    return { convertedAmount: amount * rate, rate };
  }

  public configureResidencyPolicy(params: Omit<DataResidencyPolicy, "createdAt">): {
    success: boolean; policy?: DataResidencyPolicy;
  } {
    const now = new Date().toISOString();
    const policy: DataResidencyPolicy = {
      ...params,
      createdAt: now,
    };
    this.residencyPolicies.set(params.policyId, policy);
    this._writeAudit(params.tenantId, "RESIDENCY_POLICY_CONFIGURED", "SYSTEM", params.policyId,
      `Residency policy configured for category ${params.dataCategory} in region ${params.primaryRegion}`);
    return { success: true, policy };
  }

  public evaluateCrossBorderTransfer(tenantId: string, dataCategory: DataResidencyPolicy["dataCategory"], targetRegion: GlobalRegion): {
    allowed: boolean; reason: string;
  } {
    const policy = Array.from(this.residencyPolicies.values()).find(
      p => p.tenantId === tenantId && p.dataCategory === dataCategory
    );
    if (!policy) return { allowed: true, reason: "No restrictive policy configured" };
    if (policy.primaryRegion === targetRegion) return { allowed: true, reason: "Target matches primary residency region" };
    
    const allowed = policy.allowCrossBorderTransfer;
    this._writeAudit(tenantId, "CROSS_BORDER_TRANSFER_EVALUATED", "SYSTEM", dataCategory,
      `Cross-border transfer evaluated to ${targetRegion}: ${allowed ? "ALLOWED" : "BLOCKED"}`);

    return { allowed, reason: allowed ? "Explicitly allowed by policy" : "Blocked by data residency policy" };
  }

  public getHealthSummary(tenantId: string): GlobalPlatformHealthSummary {
    const activePacks = Array.from(this.countryPacks.values()).filter(p => p.isActive);
    const regions = new Set(activePacks.map(p => p.region));

    return {
      tenantId,
      engineOperational: true,
      activeCountryPacksCount: activePacks.length,
      supportedRegionsCount: regions.size,
      dataResidencyCompliant: true,
      activeExchangeRatesCount: this.currencyRates.size,
      auditEntryCount: this.getAuditTrail(tenantId).length,
    };
  }

  public getAuditTrail(tenantId: string): GlobalPlatformAuditEntry[] {
    return this.auditLedger.filter(a => a.tenantId === tenantId || a.tenantId === "SYSTEM");
  }

  private _writeAudit(tenantId: string, eventType: GlobalPlatformAuditEntry["eventType"], actorId: string, targetEntityId: string, details: string) {
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
