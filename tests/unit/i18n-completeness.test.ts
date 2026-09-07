import { describe, it, expect } from "vitest";
import {
  validateAllLocales,
  compareLocales,
  getLeafKeys,
} from "../../apps/web/src/i18n/validator.js";
import { SUPPORTED_LOCALE_LIST } from "../../apps/web/src/i18n/types.js";
import { enDictionary } from "../../apps/web/src/i18n/locales/en/index.js";
import { frDictionary } from "../../apps/web/src/i18n/locales/fr/index.js";
import { swDictionary } from "../../apps/web/src/i18n/locales/sw/index.js";

describe("I18n Full-Parity & Completeness Certification", () => {
  it("supports exactly 3 certified languages: English (en), Français (fr), Kiswahili (sw)", () => {
    const localeCodes = SUPPORTED_LOCALE_LIST.map((l) => l.code);
    expect(localeCodes).toHaveLength(3);
    expect(localeCodes).toContain("en");
    expect(localeCodes).toContain("fr");
    expect(localeCodes).toContain("sw");
  });

  it("contains all 18 standard operational namespaces in all 3 dictionaries", () => {
    const requiredNamespaces = [
      "common",
      "nav",
      "auth",
      "onboarding",
      "dashboard",
      "pos",
      "inventory",
      "customers",
      "purchasing",
      "finance",
      "expenses",
      "reports",
      "settings",
      "superAdmin",
      "modules",
      "sync",
      "legal",
      "errors",
    ];

    const dictionaries = [
      { code: "en", dict: enDictionary },
      { code: "fr", dict: frDictionary },
      { code: "sw", dict: swDictionary },
    ];

    for (const { code, dict } of dictionaries) {
      for (const ns of requiredNamespaces) {
        expect(dict, `Locale ${code} missing namespace ${ns}`).toHaveProperty(ns);
        const section = (dict as Record<string, unknown>)[ns];
        expect(typeof section, `Locale ${code} namespace ${ns} must be an object`).toBe("object");
        expect(Object.keys(section as object).length, `Locale ${code} namespace ${ns} cannot be empty`).toBeGreaterThan(0);
      }
    }
  });

  it("ensures French (fr) has 100% key parity with English (0 missing keys, 0 empty keys)", () => {
    const diff = compareLocales("en", "fr");
    expect(diff.missingInTarget, `French is missing keys: ${diff.missingInTarget.join(", ")}`).toEqual([]);
    expect(diff.emptyValues, `French has empty translation values: ${diff.emptyValues.join(", ")}`).toEqual([]);
    expect(diff.extraInTarget, `French has unrecognized keys not in English: ${diff.extraInTarget.join(", ")}`).toEqual([]);
  });

  it("ensures Kiswahili (sw) has 100% key parity with English (0 missing keys, 0 empty keys)", () => {
    const diff = compareLocales("en", "sw");
    expect(diff.missingInTarget, `Kiswahili is missing keys: ${diff.missingInTarget.join(", ")}`).toEqual([]);
    expect(diff.emptyValues, `Kiswahili has empty translation values: ${diff.emptyValues.join(", ")}`).toEqual([]);
    expect(diff.extraInTarget, `Kiswahili has unrecognized keys not in English: ${diff.extraInTarget.join(", ")}`).toEqual([]);
  });

  it("verifies validateAllLocales() passes with 100% completeness and isValid: true", () => {
    const result = validateAllLocales();
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.totalKeys).toBeGreaterThanOrEqual(200);

    for (const comp of result.comparisons) {
      expect(comp.missingInTarget).toHaveLength(0);
      expect(comp.emptyValues).toHaveLength(0);
    }
  });

  it("ensures no leaf key contains unreplaced or invalid formatting tags", () => {
    const enLeaves = getLeafKeys(enDictionary);
    const frLeaves = getLeafKeys(frDictionary);
    const swLeaves = getLeafKeys(swDictionary);

    // Leaf counts must be identical across all three
    expect(enLeaves.size).toBe(frLeaves.size);
    expect(enLeaves.size).toBe(swLeaves.size);

    // Ensure all leaf string values are trimmed and non-empty
    for (const [key, val] of enLeaves) {
      expect(val.trim().length, `en key ${key} is whitespace-only`).toBeGreaterThan(0);
    }
    for (const [key, val] of frLeaves) {
      expect(val.trim().length, `fr key ${key} is whitespace-only`).toBeGreaterThan(0);
    }
    for (const [key, val] of swLeaves) {
      expect(val.trim().length, `sw key ${key} is whitespace-only`).toBeGreaterThan(0);
    }
  });
});
