import { z } from "zod";

// ============================================================
// Phase 41 — KwakoPos Global Platform Contracts (KGPA v1.0.0)
// ============================================================

export const GlobalRegionEnum = z.enum([
  "EAST_AFRICA", "WEST_AFRICA", "SOUTHERN_AFRICA", "NORTH_AMERICA", "EUROPE", "ASIA_PACIFIC",
]);
export type GlobalRegion = z.infer<typeof GlobalRegionEnum>;

export const CountryPackSchema = z.object({
  countryCode: z.string().length(2),
  countryName: z.string(),
  region: GlobalRegionEnum,
  defaultCurrency: z.string().length(3),
  defaultLanguage: z.string().default("en"),
  taxEngineVersion: z.string().default("v1.0"),
  fiscalComplianceCode: z.string().default("STANDARD"),
  supportedPaymentGateways: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
  createdAt: z.string(),
});
export type CountryPack = z.infer<typeof CountryPackSchema>;

export const MultiCurrencyRateRecordSchema = z.object({
  rateId: z.string(),
  baseCurrency: z.string().length(3),
  targetCurrency: z.string().length(3),
  exchangeRate: z.number().positive(),
  rateSource: z.string().default("CENTRAL_BANK"),
  timestamp: z.string(),
});
export type MultiCurrencyRateRecord = z.infer<typeof MultiCurrencyRateRecordSchema>;

export const DataResidencyPolicySchema = z.object({
  policyId: z.string(),
  tenantId: z.string(),
  dataCategory: z.enum(["FINANCIAL", "PII", "OPERATIONAL", "AUDIT"]),
  primaryRegion: GlobalRegionEnum,
  allowCrossBorderTransfer: z.boolean().default(false),
  complianceStandard: z.string().default("LOCAL_RESIDENCY_STRICT"),
  createdAt: z.string(),
});
export type DataResidencyPolicy = z.infer<typeof DataResidencyPolicySchema>;

export const GlobalPlatformHealthSummarySchema = z.object({
  tenantId: z.string(),
  engineOperational: z.boolean(),
  activeCountryPacksCount: z.number().int().nonnegative(),
  supportedRegionsCount: z.number().int().nonnegative(),
  dataResidencyCompliant: z.boolean(),
  activeExchangeRatesCount: z.number().int().nonnegative(),
  auditEntryCount: z.number().int().nonnegative(),
});
export type GlobalPlatformHealthSummary = z.infer<typeof GlobalPlatformHealthSummarySchema>;

export const GlobalPlatformAuditEntrySchema = z.object({
  auditId: z.string(),
  tenantId: z.string(),
  eventType: z.enum([
    "COUNTRY_PACK_REGISTERED", "CURRENCY_RATE_UPDATED", "RESIDENCY_POLICY_CONFIGURED",
    "CROSS_BORDER_TRANSFER_EVALUATED", "GLOBAL_ROUTE_RESOLVED",
  ]),
  actorId: z.string(),
  targetEntityId: z.string(),
  details: z.string(),
  timestamp: z.string(),
});
export type GlobalPlatformAuditEntry = z.infer<typeof GlobalPlatformAuditEntrySchema>;
