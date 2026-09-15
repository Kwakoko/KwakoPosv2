import {
  BrandLevel,
  type BrandHierarchy,
  type BrandValidationResult,
  type BrandViolation,
  type MasterBrandDefinition,
  type FlagshipPlatformDefinition,
  type PosCapabilityDefinition,
} from "@kwakopos2/contracts";

/**
 * Authoritative Master Brand Definition
 */
export const MASTER_BRAND_KWAKOKO: MasterBrandDefinition = {
  id: "kwakoko",
  name: "Kwakoko",
  legalName: "Kwakoko Technologies Ltd",
  level: BrandLevel.MASTER_BRAND,
  role: "Authoritative master technology brand",
  description:
    "Kwakoko is the parent technology company and master brand delivering next-generation enterprise business infrastructure, localized commerce engines, and offline-first operating systems across Africa and global markets.",
  officialDomains: ["kwakoko.com", "kwakoko.co.tz"],
  tagline: "Enterprise Technology & Business Operating Systems",
  isMasterBrand: true,
};

/**
 * Flagship Platform Definition
 */
export const FLAGSHIP_PLATFORM_KWAKOKO_BOS: FlagshipPlatformDefinition = {
  id: "kwakoko-bos",
  name: "Kwakoko Business Operating System",
  shortName: "Kwakoko BOS",
  code: "KWAKOKO_BOS",
  level: BrandLevel.FLAGSHIP_PLATFORM,
  parentBrandId: "kwakoko",
  role: "Flagship enterprise business operating platform",
  description:
    "Kwakoko Business Operating System (Kwakoko BOS) is the core multi-tenant application platform providing offline-first local synchronization, double-entry financial accounting, enterprise workforce management, and native industry operating modules.",
  version: "2.12.5",
  isParentIdentity: false,
  isPlatform: true,
};

/**
 * POS Capability Definition — strictly positioned as the POS capability, NOT the parent identity
 */
export const POS_CAPABILITY_KWAKOPOS: PosCapabilityDefinition = {
  id: "kwakopos",
  name: "KwakoPos",
  shortName: "KwakoPos",
  code: "KWAKOPOS",
  level: BrandLevel.CAPABILITY,
  parentPlatformId: "kwakoko-bos",
  masterBrandId: "kwakoko",
  role: "POS capability and cashier checkout subsystem",
  isMasterBrand: false,
  isPlatform: false,
  isCapability: true,
  description:
    "KwakoPos is the dedicated Point of Sale (POS) cashier checkout, barcode scanning, shift register, and receipt management capability operating within the Kwakoko Business Operating System.",
};

/**
 * Authoritative Canonical Brand Hierarchy Map
 */
export const AUTHORITATIVE_BRAND_HIERARCHY: BrandHierarchy = {
  masterBrand: MASTER_BRAND_KWAKOKO,
  flagshipPlatform: FLAGSHIP_PLATFORM_KWAKOKO_BOS,
  posCapability: POS_CAPABILITY_KWAKOPOS,
  industryModules: {
    retail: {
      key: "Retail",
      canonicalName: "Kwakoko Retail",
      shortLabel: "Retail Shop / Store",
      sector: "Retail & Commerce",
      level: BrandLevel.INDUSTRY_MODULE,
      parentPlatformId: "kwakoko-bos",
      description: "Retail inventory management, customer rewards, and checkout operations.",
      supportedCapabilities: ["kwakopos", "inventory", "crm", "receipts"],
    },
    restaurant: {
      key: "Restaurant",
      canonicalName: "Kwakoko Restaurant & Hospitality",
      shortLabel: "Restaurant / Cafe",
      sector: "Food & Hospitality",
      level: BrandLevel.INDUSTRY_MODULE,
      parentPlatformId: "kwakoko-bos",
      description: "Dining floor coordinates, kitchen display system (KDS), and recipe margins.",
      supportedCapabilities: ["kwakopos", "kds", "tables", "reservations"],
    },
    pharmacy: {
      key: "Pharmacy",
      canonicalName: "Kwakoko Pharmacy & Healthcare",
      shortLabel: "Pharmacy / Chemist",
      sector: "Healthcare",
      level: BrandLevel.INDUSTRY_MODULE,
      parentPlatformId: "kwakoko-bos",
      description: "FEFO batch expiration, poison-class registers, and prescription audits.",
      supportedCapabilities: ["kwakopos", "batch-tracking", "prescriptions"],
    },
    sacco: {
      key: "SACCO",
      canonicalName: "Kwakoko SACCO & Microfinance",
      shortLabel: "SACCO / VICOBA",
      sector: "Finance & Lending",
      level: BrandLevel.INDUSTRY_MODULE,
      parentPlatformId: "kwakoko-bos",
      description: "Cooperative member capital, savings programs, and amortized lending.",
      supportedCapabilities: ["savings", "loans", "shares", "repayments"],
    },
    hardware: {
      key: "Hardware",
      canonicalName: "Kwakoko Hardware & Building Materials",
      shortLabel: "Hardware / Building Materials",
      sector: "Retail & Commerce",
      level: BrandLevel.INDUSTRY_MODULE,
      parentPlatformId: "kwakoko-bos",
      description: "Multi-tier unit conversion, contractor project billing, and delivery dispatch.",
      supportedCapabilities: ["kwakopos", "unit-conversions", "contractor-pricing"],
    },
    garage: {
      key: "Garage",
      canonicalName: "Kwakoko Garage & Auto Workshop",
      shortLabel: "Garage / Auto Workshop",
      sector: "Transport & Logistics",
      level: BrandLevel.INDUSTRY_MODULE,
      parentPlatformId: "kwakoko-bos",
      description: "Vehicle intake job cards, technician timesheets, and spare parts allocation.",
      supportedCapabilities: ["kwakopos", "job-cards", "vehicle-tracking"],
    },
    fleet: {
      key: "FleetManagement",
      canonicalName: "Kwakoko Fleet & Logistics",
      shortLabel: "Fleet Management & Transport",
      sector: "Transport & Logistics",
      level: BrandLevel.INDUSTRY_MODULE,
      parentPlatformId: "kwakoko-bos",
      description: "Fleet tracking, fuel efficiency telemetry, and scheduled maintenance.",
      supportedCapabilities: ["gps-tracking", "fuel-monitoring", "maintenance"],
    },
    wholesale: {
      key: "Wholesale",
      canonicalName: "Kwakoko Wholesale & FMCG Distribution",
      shortLabel: "Wholesale & Distribution",
      sector: "Retail & Commerce",
      level: BrandLevel.INDUSTRY_MODULE,
      parentPlatformId: "kwakoko-bos",
      description: "B2B bulk cartons, van sales routing, and distributor pricing matrices.",
      supportedCapabilities: ["kwakopos", "van-sales", "tiered-pricing"],
    },
    telecom: {
      key: "Telecom",
      canonicalName: "Kwakoko Telecom & ISP Operations",
      shortLabel: "Telecom & Internet Service",
      sector: "Industry & Technology",
      level: BrandLevel.INDUSTRY_MODULE,
      parentPlatformId: "kwakoko-bos",
      description: "Base station infrastructure, tower telemetry, and airtime / bundle distribution.",
      supportedCapabilities: ["kwakopos", "tower-monitoring", "airtime-vouchers"],
    },
  },
  rules: {
    prohibitedMasterBrandTerms: [
      "KwakoPos Business Operating System",
      "KwakoPos Platform Systems",
      "KwakoPos Enterprise System",
      "KwakoPos Technologies Ltd",
      "KwakoPos OS",
      "KwakoPos Master Brand",
    ],
    prohibitedPlatformTerms: [
      "KwakoPos Business Operating System",
      "KwakoPos Operating System Core",
      "KwakoPos Universal Platform",
    ],
    requiredMasterBrand: "Kwakoko",
    requiredFlagshipPlatform: "Kwakoko Business Operating System",
    requiredPosCapability: "KwakoPos",
  },
};

/**
 * Rules and patterns for brand governance verification.
 */
export const BRAND_GOVERNANCE_PATTERNS = [
  {
    regex: /\bKwakoPos\s+Business\s+Operating\s+System\b/gi,
    replacement: "Kwakoko Business Operating System",
    reason: "Kwakoko is the authoritative parent brand for the Business Operating System platform; KwakoPos is strictly the POS capability.",
  },
  {
    regex: /\bKwakoPos\s+Platform\s+Systems\b/gi,
    replacement: "Kwakoko Technologies Ltd",
    reason: "Corporate and platform entity is Kwakoko / Kwakoko Technologies Ltd.",
  },
  {
    regex: /\bKwakoPos\s+Operating\s+System\b/gi,
    replacement: "Kwakoko Business Operating System",
    reason: "The operating system platform is Kwakoko Business Operating System.",
  },
  {
    regex: /\bKwakoPos\s+Universal\s+Platform\b/gi,
    replacement: "Kwakoko Business Operating System",
    reason: "Platform is Kwakoko Business Operating System.",
  },
  {
    regex: /\bKwakoPos\s+2\.0\s+POS\s+&\s+Enterprise\s+Business\s+Operating\s+System\b/gi,
    replacement: "Kwakoko Business Operating System (with KwakoPos POS Capability)",
    reason: "KwakoPos must not be represented as the umbrella enterprise operating system.",
  },
  {
    regex: /\bKwakoPos\s+Technologies\s+Ltd\b/gi,
    replacement: "Kwakoko Technologies Ltd",
    reason: "The legal technology company name is Kwakoko Technologies Ltd.",
  },
];

/**
 * Validates text or code against brand hierarchy rules.
 */
export function validateBrandIntegrity(content: string, filePath?: string): BrandValidationResult {
  const violations: BrandViolation[] = [];
  const lines = content.split(/\r?\n/);

  lines.forEach((line, idx) => {
    for (const rule of BRAND_GOVERNANCE_PATTERNS) {
      if (rule.regex.test(line)) {
        violations.push({
          file: filePath,
          line: idx + 1,
          snippet: line.trim(),
          prohibitedTerm: line.match(rule.regex)?.[0] || "Conflicting Master Brand Term",
          correction: rule.replacement,
          reason: rule.reason,
        });
        rule.regex.lastIndex = 0; // Reset stateful regex
      }
    }
  });

  return {
    valid: violations.length === 0,
    violations,
    totalViolations: violations.length,
  };
}

/**
 * Formats a canonical app header or document title following the brand hierarchy.
 */
export function formatBrandTitle(subcontext?: string): string {
  if (!subcontext || subcontext === "Kwakoko") {
    return "Kwakoko Business Operating System";
  }
  return `${subcontext} • Kwakoko Business Operating System`;
}

/**
 * Formats standard brand header for shell and UI components.
 */
export function getAuthoritativeBrandIdentity() {
  return {
    masterBrand: MASTER_BRAND_KWAKOKO.name,
    legalCompany: MASTER_BRAND_KWAKOKO.legalName,
    flagshipPlatform: FLAGSHIP_PLATFORM_KWAKOKO_BOS.name,
    platformShort: FLAGSHIP_PLATFORM_KWAKOKO_BOS.shortName,
    posCapability: POS_CAPABILITY_KWAKOPOS.name,
    tagline: MASTER_BRAND_KWAKOKO.tagline,
  };
}
