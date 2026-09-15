import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { KOKO_AMBASSADOR, getKokoProductMessage, validateKokoAmbassador } from "../../packages/config/src/kokoAmbassador.js";

describe("Koko product integration governance", () => {
  it("uses the canonical Koko ambassador definition", () => {
    expect(validateKokoAmbassador().id).toBe("koko");
    expect(KOKO_AMBASSADOR.species).toBe("African Elephant");
  });

  it("keeps product messages contextual and professional", () => {
    expect(getKokoProductMessage("onboarding")).toMatch(/Welcome/);
    expect(getKokoProductMessage("sync-status")).toMatch(/synchronized/);
    expect(getKokoProductMessage("inventory-intelligence")).toMatch(/inventory/);
  });

  it("ships one shared Koko component instead of feature-specific mascot variants", () => {
    const root = path.resolve(process.cwd(), "apps/web/src/components/KokoCompanion.tsx");
    expect(fs.existsSync(root)).toBe(true);
    const source = fs.readFileSync(root, "utf8");
    expect(source).toContain("KOKO");
    expect(source).toContain("KokoMark");
  });

  it("integrates Koko into the authenticated entry experience", () => {
    const login = fs.readFileSync(path.resolve(process.cwd(), "apps/web/src/pages/LoginPage.tsx"), "utf8");
    expect(login).toContain("KokoCompanion");
    expect(login).toContain('context="onboarding"');
  });
});
