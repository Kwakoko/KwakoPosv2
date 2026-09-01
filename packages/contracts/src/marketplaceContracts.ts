import { z } from "zod";

// ============================================================
// Phase 40 — KwakoPos Marketplace Contracts (KMKOL v1.0.0)
// ============================================================

export const MarketplaceCategoryEnum = z.enum([
  "APPLICATIONS", "INTEGRATIONS", "AI", "WORKFLOWS", "SERVICES", "HARDWARE", "INDUSTRY_BUNDLES", "ENTERPRISE_SOLUTIONS",
]);
export type MarketplaceCategory = z.infer<typeof MarketplaceCategoryEnum>;

export const MarketplaceCertificationLevelEnum = z.enum(["UNVERIFIED", "COMPATIBLE", "CERTIFIED", "ENTERPRISE_CERTIFIED"]);
export type MarketplaceCertificationLevel = z.infer<typeof MarketplaceCertificationLevelEnum>;

export const PricingModelEnum = z.enum(["FREE", "ONE_TIME", "SUBSCRIPTION", "USAGE_BASED", "FREEMIUM", "ENTERPRISE"]);
export type PricingModel = z.infer<typeof PricingModelEnum>;

export const SellerTypeEnum = z.enum([
  "KWAKOKO", "CERTIFIED_PARTNER", "INTEGRATION_PROVIDER", "HARDWARE_PARTNER",
  "TRAINING_PARTNER", "THIRD_PARTY_DEV", "STRATEGIC_ENTERPRISE",
]);
export type SellerType = z.infer<typeof SellerTypeEnum>;

export const MarketplaceManifestSchema = z.object({
  extensionId: z.string(),
  version: z.string(),
  requiredModules: z.array(z.string()).default([]),
  permissions: z.array(z.string()).default([]),
  declaredRoutes: z.array(z.string()).default([]),
  eventSubscriptions: z.array(z.string()).default([]),
  dataAccessScopes: z.array(z.string()).default([]),
  countrySupport: z.array(z.string()).default(["GLOBAL"]),
});
export type MarketplaceManifest = z.infer<typeof MarketplaceManifestSchema>;

export const ProviderIdentitySchema = z.object({
  providerId: z.string(),
  legalName: z.string(),
  sellerType: SellerTypeEnum,
  isVerified: z.boolean().default(false),
  certifications: z.array(z.string()).default([]),
  supportContactEmail: z.string(),
  createdAt: z.string(),
});
export type ProviderIdentity = z.infer<typeof ProviderIdentitySchema>;

export const MarketplaceListingSchema = z.object({
  listingId: z.string(),
  title: z.string(),
  providerId: z.string(),
  category: MarketplaceCategoryEnum,
  version: z.string(),
  description: z.string(),
  pricingModel: PricingModelEnum,
  priceAmountTzs: z.number().nonnegative().default(0),
  certificationLevel: MarketplaceCertificationLevelEnum.default("UNVERIFIED"),
  supportedIndustries: z.array(z.string()).default(["ALL"]),
  manifest: MarketplaceManifestSchema,
  ratingScore: z.number().min(0).max(5).default(5.0),
  installCount: z.number().int().nonnegative().default(0),
  isActive: z.boolean().default(true),
  publishedAt: z.string(),
});
export type MarketplaceListing = z.infer<typeof MarketplaceListingSchema>;

export const ExtensionInstallationSchema = z.object({
  installationId: z.string(),
  tenantId: z.string(),
  listingId: z.string(),
  installedVersion: z.string(),
  status: z.enum(["INSTALLED", "ACTIVE", "SUSPENDED", "UNINSTALLED"]),
  installedScope: z.enum(["TENANT", "BRANCH"]),
  installedAt: z.string(),
  updatedAt: z.string(),
});
export type ExtensionInstallation = z.infer<typeof ExtensionInstallationSchema>;

export const MarketplaceHealthSummarySchema = z.object({
  tenantId: z.string(),
  engineOperational: z.boolean(),
  totalPublishedListingsCount: z.number().int().nonnegative(),
  verifiedProvidersCount: z.number().int().nonnegative(),
  installedExtensionsCount: z.number().int().nonnegative(),
  certifiedListingsRatioPercent: z.number().min(0).max(100),
  auditEntryCount: z.number().int().nonnegative(),
});
export type MarketplaceHealthSummary = z.infer<typeof MarketplaceHealthSummarySchema>;

export const MarketplaceAuditEntrySchema = z.object({
  auditId: z.string(),
  tenantId: z.string(),
  eventType: z.enum([
    "PROVIDER_REGISTERED", "LISTING_PUBLISHED", "EXTENSION_INSTALLED",
    "EXTENSION_UNINSTALLED", "COMPATIBILITY_CHECK", "SAFETY_VALIDATION",
  ]),
  actorId: z.string(),
  targetEntityId: z.string(),
  details: z.string(),
  timestamp: z.string(),
});
export type MarketplaceAuditEntry = z.infer<typeof MarketplaceAuditEntrySchema>;
