import { describe, expect, it } from "vitest";
import { KWAKOKO_DESIGN_SYSTEM, getCanonicalDesignSystem } from "../../packages/config/src/designSystem.js";

describe("Kwakoko design system governance", () => {
  it("has a canonical version and typography", () => {
    expect(KWAKOKO_DESIGN_SYSTEM.version).toBe("1.0.0");
    expect(KWAKOKO_DESIGN_SYSTEM.foundations.primaryFont).toBe("Inter");
    expect(KWAKOKO_DESIGN_SYSTEM.foundations.technicalFont).toBe("JetBrains Mono");
  });

  it("uses semantic brand tokens", () => {
    expect(KWAKOKO_DESIGN_SYSTEM.semanticTokens.brand.primary).toBe("var(--kwakoko-forest)");
    expect(KWAKOKO_DESIGN_SYSTEM.semanticTokens.brand.accent).toBe("var(--koko-gold)");
  });

  it("defines the minimum governed component set", () => {
    expect(KWAKOKO_DESIGN_SYSTEM.components.required).toEqual(
      expect.arrayContaining(["Button", "Input", "Card", "Modal", "Table", "EmptyState"]),
    );
  });

  it("enforces interaction and accessibility baselines", () => {
    expect(KWAKOKO_DESIGN_SYSTEM.components.rules.buttonsUseMinHeightPx).toBe(44);
    expect(KWAKOKO_DESIGN_SYSTEM.components.rules.iconButtonsRequireAccessibleLabel).toBe(true);
    expect(KWAKOKO_DESIGN_SYSTEM.accessibility.keyboardFocusRequired).toBe(true);
    expect(KWAKOKO_DESIGN_SYSTEM.accessibility.reducedMotionRequired).toBe(true);
    expect(KWAKOKO_DESIGN_SYSTEM.accessibility.statusMustNotRelyOnColorOnly).toBe(true);
  });

  it("defines responsive foundations", () => {
    expect(KWAKOKO_DESIGN_SYSTEM.responsive.mobileFirst).toBe(true);
    expect(KWAKOKO_DESIGN_SYSTEM.responsive.breakpoints.md).toBe(768);
  });

  it("makes the design system the source of truth", () => {
    expect(KWAKOKO_DESIGN_SYSTEM.governance.designSystemIsSourceOfTruth).toBe(true);
    expect(getCanonicalDesignSystem()).toBe(KWAKOKO_DESIGN_SYSTEM);
  });
});
