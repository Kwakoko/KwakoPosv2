import { describe, expect, it } from "vitest";
import { KWAKOKO_VISUAL_IDENTITY } from "../../packages/config/src/visualIdentity.js";

describe("Kwakoko visual identity governance", () => {
  it("uses the canonical master palette", () => {
    expect(KWAKOKO_VISUAL_IDENTITY.masterBrandColor).toBe("#0B5D4A");
    expect(KWAKOKO_VISUAL_IDENTITY.accentColor).toBe("#D4A72C");
  });

  it("keeps Koko as the canonical ambassador", () => {
    expect(KWAKOKO_VISUAL_IDENTITY.mascot).toBe("Koko");
  });

  it("uses approved product typography", () => {
    expect(KWAKOKO_VISUAL_IDENTITY.typography.primary).toBe("Inter");
  });
});
