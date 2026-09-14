import { z } from "zod";

/**
 * Brand Level Enum representing the strict hierarchy of the Kwakoko brand ecosystem.
 */
export enum BrandLevel {
  /** Level 1: Master technology brand / parent corporate entity */
  MASTER_BRAND = "MASTER_BRAND",
  /** Level 2: Flagship enterprise platform / operating system */
  FLAGSHIP_PLATFORM = "FLAGSHIP_PLATFORM",
  /** Level 3: Industry-specific vertical modules operating beneath the platform */
  INDUSTRY_MODULE = "INDUSTRY_MODULE",
  /** Level 4: Point of Sale checkout and cashier capability */
  CAPABILITY = "CAPABILITY",
}

export const MasterBrandDefinitionSchema = z.object({
  id: z.literal("kwakoko"),
  name: z.literal("Kwakoko"),
  legalName: z.string().default("Kwakoko Technologies Ltd"),
  level: z.literal(BrandLevel.MASTER_BRAND),
  role: z.string().default("Authoritative master technology brand"),
  description: z.string(),
  officialDomains: z.array(z.string()),
  tagline: z.string(),
  isMasterBrand: z.literal(true),
});

export type MasterBrandDefinition = z.infer<typeof MasterBrandDefinitionSchema>;

export const FlagshipPlatformDefinitionSchema = z.object({
  id: z.literal("kwakoko-bos"),
  name: z.literal("Kwakoko Business Operating System"),
  shortName: z.literal("Kwakoko BOS"),
  code: z.literal("KWAKOKO_BOS"),
  level: z.literal(BrandLevel.FLAGSHIP_PLATFORM),
  parentBrandId: z.literal("kwakoko"),
  role: z.string().default("Flagship enterprise business operating platform"),
  description: z.string(),
  version: z.string(),
  isParentIdentity: z.literal(false),
  isPlatform: z.literal(true),
});

export type FlagshipPlatformDefinition = z.infer<typeof FlagshipPlatformDefinitionSchema>;

export const IndustryModuleDefinitionSchema = z.object({
  key: z.string(),
  canonicalName: z.string(),
  shortLabel: z.string(),
  sector: z.string(),
  level: z.literal(BrandLevel.INDUSTRY_MODULE),
  parentPlatformId: z.literal("kwakoko-bos"),
  description: z.string(),
  supportedCapabilities: z.array(z.string()),
});

export type IndustryModuleDefinition = z.infer<typeof IndustryModuleDefinitionSchema>;

export const PosCapabilityDefinitionSchema = z.object({
  id: z.literal("kwakopos"),
  name: z.literal("KwakoPos"),
  shortName: z.literal("KwakoPos"),
  code: z.literal("KWAKOPOS"),
  level: z.literal(BrandLevel.CAPABILITY),
  parentPlatformId: z.literal("kwakoko-bos"),
  masterBrandId: z.literal("kwakoko"),
  role: z.literal("POS capability and cashier checkout subsystem"),
  isMasterBrand: z.literal(false),
  isPlatform: z.literal(false),
  isCapability: z.literal(true),
  description: z.string(),
});

export type PosCapabilityDefinition = z.infer<typeof PosCapabilityDefinitionSchema>;

export const BrandHierarchySchema = z.object({
  masterBrand: MasterBrandDefinitionSchema,
  flagshipPlatform: FlagshipPlatformDefinitionSchema,
  posCapability: PosCapabilityDefinitionSchema,
  industryModules: z.record(z.string(), IndustryModuleDefinitionSchema),
  rules: z.object({
    prohibitedMasterBrandTerms: z.array(z.string()),
    prohibitedPlatformTerms: z.array(z.string()),
    requiredMasterBrand: z.literal("Kwakoko"),
    requiredFlagshipPlatform: z.literal("Kwakoko Business Operating System"),
    requiredPosCapability: z.literal("KwakoPos"),
  }),
});

export type BrandHierarchy = z.infer<typeof BrandHierarchySchema>;

export interface BrandViolation {
  file?: string;
  line?: number;
  snippet?: string;
  prohibitedTerm: string;
  correction: string;
  reason: string;
}

export interface BrandValidationResult {
  valid: boolean;
  violations: BrandViolation[];
  totalViolations: number;
}
