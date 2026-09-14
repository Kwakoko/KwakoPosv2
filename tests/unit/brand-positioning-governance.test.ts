import { describe, expect, it } from "vitest";
import {
  KWAKOKO_BRAND_POSITIONING,
  getCanonicalPositioning,
} from "../../packages/config/src/brandPositioning.js";

describe("Kwakoko brand positioning governance", () => {
  it("defines Kwakoko as the master brand and BOS as the platform", () => {
    expect(KWAKOKO_BRAND_POSITIONING.masterBrand).toBe("Kwakoko");
    expect(KWAKOKO_BRAND_POSITIONING.platform).toBe("Kwakoko Business Operating System");
  });

  it("positions the platform as a business operating system", () => {
    expect(KWAKOKO_BRAND_POSITIONING.category).toBe("Business Operating System");
    expect(KWAKOKO_BRAND_POSITIONING.promise).toBe(
      "Run your business as one connected operation.",
    );
  });

  it("contains strategic differentiators", () => {
    expect(KWAKOKO_BRAND_POSITIONING.strategicDifferentiators.length).toBeGreaterThanOrEqual(5);
    expect(KWAKOKO_BRAND_POSITIONING.strategicDifferentiators).toContain(
      "Offline-first operation for imperfect connectivity conditions",
    );
  });

  it("prohibits reduction of the master platform to only POS", () => {
    expect(KWAKOKO_BRAND_POSITIONING.categoryLanguage.avoidAsPrimaryPositioning).toContain("just a POS");
  });

  it("enforces a no-overclaim positioning rule", () => {
    expect(KWAKOKO_BRAND_POSITIONING.governance.noOverclaimRule).toMatch(/do not imply/i);
  });

  it("returns the authoritative positioning object", () => {
    expect(getCanonicalPositioning()).toBe(KWAKOKO_BRAND_POSITIONING);
  });
});
