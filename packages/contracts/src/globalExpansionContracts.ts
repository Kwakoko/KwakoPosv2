import { z } from "zod";

// 1. Country Health States (9 States)
export const CountryHealthStateEnum = z.enum([
  "RESEARCH",
  "BUILDING",
  "CERTIFICATION",
  "PILOT",
  "LIMITED_COMMERCIAL",
  "GENERAL_AVAILABILITY",
  "SCALE",
  "PAUSED",
  "EXIT",
]);

export type CountryHealthState = z.infer<typeof CountryHealthStateEnum>;

// 2. Country Pack Manifest
export const CountryPackManifestSchema = z.object({
  countryCode: z.string().length(2), // ISO 3166-1 alpha-2 e.g. TZ, KE, UG, RW
  countryName: z.string(),
  packVersion: z.string(),
  currencyCode: z.string().length(3), // TZS, KES, UGX, RWF, USD
  currencySymbol: z.string(),
  decimalPrecision: z.number().int().min(0).max(4),
  defaultLanguage: z.string(),
  supportedLanguages: z.array(z.string()),
  vatRatePct: z.number().min(0).max(100),
  taxInclusivePricing: z.boolean(),
  electronicFiscalSignatureRequired: z.boolean(),
  dataResidencyRequired: z.boolean(),
  hostingRegion: z.string(),
  supportedPaymentAdapters: z.array(z.string()),
  healthState: CountryHealthStateEnum,
  isReferenceMarket: z.boolean().default(false),
  updatedAt: z.string(),
});

export type CountryPackManifest = z.infer<typeof CountryPackManifestSchema>;

// 3. Global Currency & Multi-Currency Config
export const GlobalCurrencyConfigSchema = z.object({
  currencyCode: z.string().length(3),
  symbol: z.string(),
  decimalPrecision: z.number().int(),
  roundingRule: z.enum(["ROUND_HALF_UP", "ROUND_FLOOR", "ROUND_CEIL"]),
  baseRateToUsd: z.number().positive(),
  updatedAt: z.string(),
});

export type GlobalCurrencyConfig = z.infer<typeof GlobalCurrencyConfigSchema>;

export const MultiCurrencyTransactionRecordSchema = z.object({
  transactionId: z.string(),
  tenantBaseCurrency: z.string(),
  transactionCurrency: z.string(),
  transactionAmount: z.number(),
  exchangeRateUsed: z.number().positive(),
  convertedAmountBaseCurrency: z.number(),
  realizedGainLossUsd: z.number().default(0),
  timestamp: z.string(),
});

export type MultiCurrencyTransactionRecord = z.infer<typeof MultiCurrencyTransactionRecordSchema>;

// 4. Country Tax Rule (Effective-Dated)
export const CountryTaxRuleSchema = z.object({
  ruleId: z.string(),
  countryCode: z.string().length(2),
  taxCategory: z.enum(["STANDARD_VAT", "REDUCED_VAT", "ZERO_RATED", "EXEMPT", "WITHHOLDING"]),
  ratePct: z.number().min(0).max(100),
  taxInclusive: z.boolean(),
  effectiveFrom: z.string(),
  effectiveUntil: z.string().optional(),
  statutoryReference: z.string(),
});

export type CountryTaxRule = z.infer<typeof CountryTaxRuleSchema>;

// 5. Payment Adapter Configuration & State Machine
export const PaymentAdapterConfigSchema = z.object({
  adapterId: z.string(),
  countryCode: z.string().length(2),
  adapterName: z.string(),
  providerType: z.enum(["MOBILE_MONEY", "BANK_TRANSFER", "CARD_GATEWAY", "CASH", "LOCAL_AGGREGATOR"]),
  idempotencySupported: z.boolean(),
  reconciliationSupported: z.boolean(),
  supportedCurrencies: z.array(z.string()),
  activeStatus: z.boolean(),
});

export type PaymentAdapterConfig = z.infer<typeof PaymentAdapterConfigSchema>;

// 6. Country Market Readiness Gate (15 Criteria)
export const CountryMarketReadinessGateSchema = z.object({
  legalReviewPassed: z.boolean(),
  taxReviewPassed: z.boolean(),
  paymentReadinessPassed: z.boolean(),
  currencyReadinessPassed: z.boolean(),
  languageReadinessPassed: z.boolean(),
  privacyDataReviewPassed: z.boolean(),
  hostingResidencyPassed: z.boolean(),
  industryAssessmentPassed: z.boolean(),
  securityAssessmentPassed: z.boolean(),
  operationalReadinessPassed: z.boolean(),
  supportReadinessPassed: z.boolean(),
  partnerReadinessPassed: z.boolean(),
  pilotValidationPassed: z.boolean(),
  commercialValidationPassed: z.boolean(),
  zeroCodeForkVerified: z.boolean(),
  all15CriteriaPassed: z.boolean(),
  evaluatedAt: z.string(),
});

export type CountryMarketReadinessGate = z.infer<typeof CountryMarketReadinessGateSchema>;

// 7. Global Expansion Dashboard Metrics
export const GlobalExpansionDashboardSummarySchema = z.object({
  totalSupportedCountries: z.number().int().nonnegative(),
  referenceMarket: z.string(),
  activeEastAfricaMarkets: z.array(z.string()),
  countryPacksActive: z.number().int().nonnegative(),
  zeroCodeForkComplianceRatePct: z.number().min(0).max(100),
  activeMultiCurrencyVolumeUsd: z.number().nonnegative(),
});

export type GlobalExpansionDashboardSummary = z.infer<typeof GlobalExpansionDashboardSummarySchema>;
