import { describe, expect, it } from "vitest";
import { KWAKOKO_BRAND_VOICE, getCanonicalBrandVoice } from "../../packages/config/src/brandVoice.js";
import { BrandVoiceCopyRequestSchema, BrandVoiceValidationResultSchema } from "../../packages/contracts/src/brandVoiceContracts.js";

describe("Kwakoko voice and tone governance", () => {
  it("defines the canonical professional voice", () => {
    expect(KWAKOKO_BRAND_VOICE.voice.core).toEqual(
      expect.arrayContaining(["clear", "confident", "calm", "helpful", "professional"]),
    );
    expect(KWAKOKO_BRAND_VOICE.voice.character).toMatch(/intelligent operating partner/i);
  });

  it("defines every approved tone mode", () => {
    expect(Object.keys(KWAKOKO_BRAND_VOICE.toneModes)).toEqual(
      expect.arrayContaining(["operational", "guidance", "alert", "executive", "marketing", "koko"]),
    );
  });

  it("governs English, Kiswahili and French localization", () => {
    expect(KWAKOKO_BRAND_VOICE.localization.sourceLanguage).toBe("en");
    expect(KWAKOKO_BRAND_VOICE.localization.supportedLanguages).toEqual(["en", "sw", "fr"]);
    expect(KWAKOKO_BRAND_VOICE.localization.principles).toEqual(
      expect.arrayContaining([expect.stringMatching(/Translate meaning, not word order/i)]),
    );
  });

  it("protects canonical terminology and brand names", () => {
    expect(KWAKOKO_BRAND_VOICE.terminology.preferred.platform).toBe("Kwakoko Business Operating System");
    expect(KWAKOKO_BRAND_VOICE.terminology.preferred.pos).toBe("KwakoPos");
    expect(KWAKOKO_BRAND_VOICE.terminology.avoidAsCustomerFacingDefaults).toContain("user error");
  });

  it("enforces no-overclaim and no-blame governance", () => {
    expect(KWAKOKO_BRAND_VOICE.governance.noOverclaimRule).toMatch(/verified capabilities/i);
    expect(KWAKOKO_BRAND_VOICE.governance.noBlameRule).toMatch(/must not shame/i);
    expect(KWAKOKO_BRAND_VOICE.prohibitedClaims).toContain("100% secure");
  });

  it("keeps Koko subordinate to professional product communication", () => {
    expect(KWAKOKO_BRAND_VOICE.toneModes.koko.rules).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/professional/i),
        expect.stringMatching(/never interrupts critical transactions/i),
      ]),
    );
  });

  it("exposes browser-safe copy contracts", () => {
    expect(BrandVoiceCopyRequestSchema.parse({
      language: "sw",
      toneMode: "guidance",
      text: "Endelea na usawazishaji.",
      context: "sync-status",
      containsKoko: true,
    }).language).toBe("sw");
    expect(BrandVoiceValidationResultSchema.parse({ valid: true, issues: [] }).valid).toBe(true);
  });

  it("returns the authoritative voice object", () => {
    expect(getCanonicalBrandVoice()).toBe(KWAKOKO_BRAND_VOICE);
  });
});
