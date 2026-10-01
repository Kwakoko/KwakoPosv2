import { describe, it, expect } from "vitest";
import {
  isUuid,
  formatShortId,
  formatTenantCode,
  formatBranchCode,
  formatRoleName,
  formatUserCode,
  truncateMiddle,
} from "../../apps/web/src/utils/idFormatters.js";

describe("idFormatters Utility Suite", () => {
  const SAMPLE_USER_ID = "c0b5a903-a0a1-4bec-a4d3-7a377ed61dd6";
  const SAMPLE_TENANT_ID = "33b96a4b-8b7e-4066-b858-92b0ee0ee62c";
  const SAMPLE_BRANCH_ID = "42fa35ca-deca-416f-bbd4-d324157d89b5";
  const SAMPLE_ROLE_ID = "34900b74-ab25-4865-849b-4207ce14585b";

  describe("isUuid", () => {
    it("correctly identifies valid standard UUIDs", () => {
      expect(isUuid(SAMPLE_USER_ID)).toBe(true);
      expect(isUuid(SAMPLE_TENANT_ID)).toBe(true);
      expect(isUuid(SAMPLE_BRANCH_ID)).toBe(true);
    });

    it("correctly returns false for non-UUID strings and symbols", () => {
      expect(isUuid("bravados-pub")).toBe(false);
      expect(isUuid("BP-MAINBR")).toBe(false);
      expect(isUuid("USR-C0B5A9")).toBe(false);
      expect(isUuid("")).toBe(false);
      expect(isUuid(null)).toBe(false);
      expect(isUuid(undefined)).toBe(false);
      expect(isUuid(12345)).toBe(false);
    });
  });

  describe("formatShortId", () => {
    it("formats UUID with prefix", () => {
      expect(formatShortId(SAMPLE_USER_ID, "USR")).toBe("USR-C0B5A9");
      expect(formatShortId(SAMPLE_TENANT_ID, "TNT")).toBe("TNT-33B96A");
      expect(formatShortId(SAMPLE_BRANCH_ID, "BR")).toBe("BR-42FA35");
      expect(formatShortId(SAMPLE_ROLE_ID, "ROL")).toBe("ROL-34900B");
    });

    it("formats UUID without prefix", () => {
      expect(formatShortId(SAMPLE_USER_ID)).toBe("C0B5A9");
    });

    it("preserves already friendly identifiers", () => {
      expect(formatShortId("bravados-pub", "TNT")).toBe("bravados-pub");
      expect(formatShortId("BP-MAINBR", "BR")).toBe("BP-MAINBR");
      expect(formatShortId("EMP-007", "USR")).toBe("EMP-007");
    });

    it("handles null and undefined gracefully", () => {
      expect(formatShortId(null, "USR")).toBe("—");
      expect(formatShortId(undefined, "USR")).toBe("—");
      expect(formatShortId("", "USR")).toBe("—");
    });
  });

  describe("formatTenantCode", () => {
    it("prefers tenant slug when available", () => {
      expect(
        formatTenantCode({
          id: SAMPLE_TENANT_ID,
          slug: "bravados-pub",
          name: "Bravados Pub",
        })
      ).toBe("bravados-pub");
    });

    it("falls back to TNT-XXXXXX when slug is absent", () => {
      expect(
        formatTenantCode({
          id: SAMPLE_TENANT_ID,
          name: "Bravados Pub",
        })
      ).toBe("TNT-33B96A");
    });

    it("handles raw string inputs", () => {
      expect(formatTenantCode(SAMPLE_TENANT_ID)).toBe("TNT-33B96A");
      expect(formatTenantCode("bravados-pub")).toBe("bravados-pub");
    });
  });

  describe("formatBranchCode", () => {
    it("prefers branch code when available", () => {
      expect(
        formatBranchCode({
          id: SAMPLE_BRANCH_ID,
          code: "BP-MAINBR",
          name: "Main Branch - Kidimu",
        })
      ).toBe("BP-MAINBR");
    });

    it("falls back to BR-XXXXXX when code is absent", () => {
      expect(
        formatBranchCode({
          id: SAMPLE_BRANCH_ID,
          name: "Main Branch - Kidimu",
        })
      ).toBe("BR-42FA35");
    });

    it("handles raw string inputs", () => {
      expect(formatBranchCode(SAMPLE_BRANCH_ID)).toBe("BR-42FA35");
      expect(formatBranchCode("BP-MAINBR")).toBe("BP-MAINBR");
    });
  });

  describe("formatRoleName", () => {
    it("returns uppercase role name", () => {
      expect(formatRoleName("admin")).toBe("ADMIN");
      expect(formatRoleName({ name: "cashier" })).toBe("CASHIER");
      expect(formatRoleName({ name: "OWNER" })).toBe("OWNER");
    });

    it("formats role UUID into ROL-XXXXXX if accidentally passed", () => {
      expect(formatRoleName(SAMPLE_ROLE_ID)).toBe("ROL-34900B");
    });

    it("defaults to USER when null/empty", () => {
      expect(formatRoleName(null)).toBe("USER");
      expect(formatRoleName(undefined)).toBe("USER");
    });
  });

  describe("formatUserCode", () => {
    it("prefers employeeNumber if defined", () => {
      expect(
        formatUserCode({
          id: SAMPLE_USER_ID,
          employeeNumber: "EMP-042",
        })
      ).toBe("EMP-042");
    });

    it("falls back to USR-XXXXXX if employeeNumber absent", () => {
      expect(
        formatUserCode({
          id: SAMPLE_USER_ID,
        })
      ).toBe("USR-C0B5A9");
    });

    it("formats raw user UUID string", () => {
      expect(formatUserCode(SAMPLE_USER_ID)).toBe("USR-C0B5A9");
    });
  });

  describe("truncateMiddle", () => {
    it("truncates long strings with ellipsis", () => {
      const longText = "1234567890abcdefghijklmnopqrstuvwxyz";
      const truncated = truncateMiddle(longText, 20);
      expect(truncated.length).toBeLessThanOrEqual(20);
      expect(truncated).toContain("...");
    });

    it("leaves short strings untruncated", () => {
      expect(truncateMiddle("short", 20)).toBe("short");
    });
  });
});
