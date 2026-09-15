/**
 * KwakoPos v2 — Translation Completeness & Parity Validator
 *
 * Automated verification tool to guarantee 100% dictionary key parity
 * across English, French, and Kiswahili, and detect missing or empty translations.
 */

import { en } from "./locales/en/index.js";
import { fr } from "./locales/fr/index.js";
import { sw } from "./locales/sw/index.js";
import { type SupportedLocale, type TranslationDictionary } from "./types.js";

const DICTIONARY_MAP: Record<SupportedLocale, TranslationDictionary> = {
  en,
  fr,
  sw,
};

export interface ParityReport {
  locale: SupportedLocale;
  totalKeys: number;
  missingKeys: string[];
  emptyKeys: string[];
  isComplete: boolean;
}

export interface ValidationSummary {
  isValid: boolean;
  errors: string[];
  totalKeys: number;
  comparisons: Array<{
    targetLocale: SupportedLocale;
    missingInTarget: string[];
    extraInTarget: string[];
    emptyValues: string[];
  }>;
  byLocale: Record<SupportedLocale, ParityReport>;
}

export function getAllLeafKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  let keys: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys = keys.concat(getAllLeafKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }

  return keys;
}

export function getLeafKeys(obj: unknown, prefix = ""): Map<string, string> {
  const map = new Map<string, string>();

  if (!obj || typeof obj !== "object") return map;

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const subMap = getLeafKeys(value, fullKey);
      for (const [k, v] of subMap) {
        map.set(k, v);
      }
    } else {
      map.set(fullKey, String(value ?? ""));
    }
  }

  return map;
}

export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

export function compareLocales(
  baseLocale: SupportedLocale,
  targetLocale: SupportedLocale
): {
  baseLocale: SupportedLocale;
  targetLocale: SupportedLocale;
  missingInTarget: string[];
  extraInTarget: string[];
  emptyValues: string[];
  totalBaseKeys: number;
  totalTargetKeys: number;
} {
  const baseDict = DICTIONARY_MAP[baseLocale] || en;
  const targetDict = DICTIONARY_MAP[targetLocale] || en;

  const baseLeaves = getLeafKeys(baseDict);
  const targetLeaves = getLeafKeys(targetDict);

  const missingInTarget: string[] = [];
  const extraInTarget: string[] = [];
  const emptyValues: string[] = [];

  for (const [key] of baseLeaves) {
    if (!targetLeaves.has(key)) {
      missingInTarget.push(key);
    }
  }

  for (const [key, val] of targetLeaves) {
    if (!baseLeaves.has(key)) {
      extraInTarget.push(key);
    }
    if (typeof val === "string" && val.trim().length === 0) {
      emptyValues.push(key);
    }
  }

  return {
    baseLocale,
    targetLocale,
    missingInTarget,
    extraInTarget,
    emptyValues,
    totalBaseKeys: baseLeaves.size,
    totalTargetKeys: targetLeaves.size,
  };
}

export function validateLocaleParity(
  targetDict: TranslationDictionary,
  locale: SupportedLocale,
  canonicalDict: TranslationDictionary = en
): ParityReport {
  const canonicalKeys = getAllLeafKeys(canonicalDict as unknown as Record<string, unknown>);
  const missingKeys: string[] = [];
  const emptyKeys: string[] = [];

  for (const key of canonicalKeys) {
    const val = getNestedValue(targetDict as unknown as Record<string, unknown>, key);
    if (val === undefined || val === null) {
      missingKeys.push(key);
    } else if (typeof val === "string" && val.trim().length === 0) {
      emptyKeys.push(key);
    }
  }

  return {
    locale,
    totalKeys: canonicalKeys.length,
    missingKeys,
    emptyKeys,
    isComplete: missingKeys.length === 0 && emptyKeys.length === 0,
  };
}

export function validateAllLocales(): ValidationSummary {
  const enReport = validateLocaleParity(en, "en", en);
  const frReport = validateLocaleParity(fr, "fr", en);
  const swReport = validateLocaleParity(sw, "sw", en);

  const frComp = compareLocales("en", "fr");
  const swComp = compareLocales("en", "sw");

  const errors: string[] = [];

  if (!frReport.isComplete) {
    errors.push(`French dictionary has ${frReport.missingKeys.length} missing and ${frReport.emptyKeys.length} empty keys.`);
  }
  if (!swReport.isComplete) {
    errors.push(`Kiswahili dictionary has ${swReport.missingKeys.length} missing and ${swReport.emptyKeys.length} empty keys.`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    totalKeys: enReport.totalKeys,
    comparisons: [
      {
        targetLocale: "fr",
        missingInTarget: frComp.missingInTarget,
        extraInTarget: frComp.extraInTarget,
        emptyValues: frComp.emptyValues,
      },
      {
        targetLocale: "sw",
        missingInTarget: swComp.missingInTarget,
        extraInTarget: swComp.extraInTarget,
        emptyValues: swComp.emptyValues,
      },
    ],
    byLocale: {
      en: enReport,
      fr: frReport,
      sw: swReport,
    },
  };
}
