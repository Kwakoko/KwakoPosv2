import { describe, it, expect } from "vitest";
import {
  BrandLevel,
  BrandHierarchySchema,
} from "../../packages/contracts/src/brandHierarchyContracts.js";
import {
  AUTHORITATIVE_BRAND_HIERARCHY,
  MASTER_BRAND_KWAKOKO,
  FLAGSHIP_PLATFORM_KWAKOKO_BOS,
  POS_CAPABILITY_KWAKOPOS,
  validateBrandIntegrity,
  formatBrandTitle,
  getAuthoritativeBrandIdentity,
} from "../../packages/config/src/brandHierarchy.js";
import { runBrandIntegrityVerification } from "../../scripts/release/verify-brand-integrity.js";

describe("Kwakoko Brand Architecture & Governance Test Suite", () => {
  describe("1. Authoritative Machine-Readable Hierarchy Conformance", () => {
    it("validates hierarchy against BrandHierarchySchema without errors", () => {
      const parsed = BrandHierarchySchema.safeParse(AUTHORITATIVE_BRAND_HIERARCHY);
      expect(parsed.success).toBe(true);
    });

    it("certifies Kwakoko as Level 1 Authoritative Master Brand", () => {
      expect(MASTER_BRAND_KWAKOKO.id).toBe("kwakoko");
      expect(MASTER_BRAND_KWAKOKO.name).toBe("Kwakoko");
      expect(MASTER_BRAND_KWAKOKO.level).toBe(BrandLevel.MASTER_BRAND);
      expect(MASTER_BRAND_KWAKOKO.isMasterBrand).toBe(true);
      expect(MASTER_BRAND_KWAKOKO.legalName).toBe("Kwakoko Technologies Ltd");
      expect(MASTER_BRAND_KWAKOKO.officialDomains).toContain("kwakoko.com");
      expect(MASTER_BRAND_KWAKOKO.officialDomains).toContain("kwakoko.co.tz");
    });

    it("certifies Kwakoko Business Operating System as Level 2 Flagship Platform", () => {
      expect(FLAGSHIP_PLATFORM_KWAKOKO_BOS.id).toBe("kwakoko-bos");
      expect(FLAGSHIP_PLATFORM_KWAKOKO_BOS.name).toBe("Kwakoko Business Operating System");
      expect(FLAGSHIP_PLATFORM_KWAKOKO_BOS.shortName).toBe("Kwakoko BOS");
      expect(FLAGSHIP_PLATFORM_KWAKOKO_BOS.level).toBe(BrandLevel.FLAGSHIP_PLATFORM);
      expect(FLAGSHIP_PLATFORM_KWAKOKO_BOS.parentBrandId).toBe("kwakoko");
      expect(FLAGSHIP_PLATFORM_KWAKOKO_BOS.isPlatform).toBe(true);
      expect(FLAGSHIP_PLATFORM_KWAKOKO_BOS.isParentIdentity).toBe(false);
    });

    it("certifies KwakoPos strictly as Level 4 POS Capability and NOT parent brand", () => {
      expect(POS_CAPABILITY_KWAKOPOS.id).toBe("kwakopos");
      expect(POS_CAPABILITY_KWAKOPOS.name).toBe("KwakoPos");
      expect(POS_CAPABILITY_KWAKOPOS.level).toBe(BrandLevel.CAPABILITY);
      expect(POS_CAPABILITY_KWAKOPOS.parentPlatformId).toBe("kwakoko-bos");
      expect(POS_CAPABILITY_KWAKOPOS.masterBrandId).toBe("kwakoko");
      expect(POS_CAPABILITY_KWAKOPOS.isMasterBrand).toBe(false);
      expect(POS_CAPABILITY_KWAKOPOS.isPlatform).toBe(false);
      expect(POS_CAPABILITY_KWAKOPOS.isCapability).toBe(true);
    });

    it("certifies industry modules operate beneath Kwakoko Business Operating System", () => {
      const modules = Object.values(AUTHORITATIVE_BRAND_HIERARCHY.industryModules);
      expect(modules.length).toBeGreaterThanOrEqual(8);

      for (const mod of modules) {
        expect(mod.level).toBe(BrandLevel.INDUSTRY_MODULE);
        expect(mod.parentPlatformId).toBe("kwakoko-bos");
        expect(mod.canonicalName).toMatch(/^Kwakoko\s+/);
      }
    });

    it("exports authoritative brand identity for components", () => {
      const brand = getAuthoritativeBrandIdentity();
      expect(brand.masterBrand).toBe("Kwakoko");
      expect(brand.flagshipPlatform).toBe("Kwakoko Business Operating System");
      expect(brand.posCapability).toBe("KwakoPos");
      expect(brand.platformShort).toBe("Kwakoko BOS");
      expect(brand.legalCompany).toBe("Kwakoko Technologies Ltd");
    });

    it("formats titles according to brand hierarchy conventions", () => {
      expect(formatBrandTitle()).toBe("Kwakoko Business Operating System");
      expect(formatBrandTitle("Retail Workspace")).toBe("Retail Workspace • Kwakoko Business Operating System");
    });
  });

  describe("2. Conflict Prevention & Brand Integrity Linter", () => {
    it("flags obsolete conflicting term 'KwakoPos Business Operating System'", () => {
      const sample = "Welcome to KwakoPos Business Operating System v2.0";
      const res = validateBrandIntegrity(sample);
      expect(res.valid).toBe(false);
      expect(res.violations.length).toBe(1);
      expect(res.violations[0].prohibitedTerm).toBe("KwakoPos Business Operating System");
      expect(res.violations[0].correction).toBe("Kwakoko Business Operating System");
    });

    it("flags obsolete corporate term 'KwakoPos Technologies Ltd'", () => {
      const sample = "Operated by KwakoPos Technologies Ltd in East Africa";
      const res = validateBrandIntegrity(sample);
      expect(res.valid).toBe(false);
      expect(res.violations.length).toBe(1);
      expect(res.violations[0].prohibitedTerm).toBe("KwakoPos Technologies Ltd");
      expect(res.violations[0].correction).toBe("Kwakoko Technologies Ltd");
    });

    it("flags obsolete platform term 'KwakoPos Universal Platform'", () => {
      const sample = "Terms for KwakoPos Universal Platform users";
      const res = validateBrandIntegrity(sample);
      expect(res.valid).toBe(false);
      expect(res.violations.length).toBe(1);
      expect(res.violations[0].prohibitedTerm).toBe("KwakoPos Universal Platform");
    });

    it("passes compliant text referencing Kwakoko as parent and KwakoPos as POS capability", () => {
      const compliantSample = `
        Kwakoko is the parent technology brand.
        Kwakoko Business Operating System is our flagship enterprise platform.
        KwakoPos provides zero-latency offline-first point-of-sale checkout.
        Operating under Kwakoko Technologies Ltd.
      `;
      const res = validateBrandIntegrity(compliantSample);
      expect(res.valid).toBe(true);
      expect(res.violations.length).toBe(0);
    });
  });

  describe("3. Repository-Wide Brand Integrity Gate", () => {
    it("verifies all critical repository files pass the brand integrity scanner", () => {
      const verification = runBrandIntegrityVerification();
      expect(verification.passed).toBe(true);
      expect(verification.violationsFound).toBe(0);
      expect(verification.filesWithViolations).toHaveLength(0);
      expect(verification.totalFilesScanned).toBeGreaterThanOrEqual(10);
    });
  });
});
