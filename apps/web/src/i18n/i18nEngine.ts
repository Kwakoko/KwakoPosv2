/**
 * KwakoPos v2 — i18n Core Engine
 *
 * Provides typed key resolution, dot-notation path traversal, parameter
 * interpolation (e.g. {{param}}), pluralization, and missing-key fallback tracking.
 */

import { type SupportedLocale, type TranslationDictionary, type InterpolationParams } from "./types.js";
import { en } from "./locales/en/index.js";
import { fr } from "./locales/fr/index.js";
import { sw } from "./locales/sw/index.js";

export const DICTIONARIES: Record<SupportedLocale, TranslationDictionary> = {
  en,
  fr,
  sw,
};

export class I18nEngine {
  private activeLocale: SupportedLocale = "en";
  private missingKeys: Set<string> = new Set();

  constructor(initialLocale: SupportedLocale = "en") {
    this.setLocale(initialLocale);
  }

  public getLocale(): SupportedLocale {
    return this.activeLocale;
  }

  public setLocale(locale: SupportedLocale): void {
    if (DICTIONARIES[locale]) {
      this.activeLocale = locale;
    } else {
      this.activeLocale = "en";
    }
  }

  /**
   * Resolves a nested translation key using dot notation (e.g., "nav.dashboard", "auth.signInButton").
   * Supports variable interpolation {{name}} and fallback to English.
   */
  public t(key: string, params?: InterpolationParams): string {
    const raw = this.resolveKey(this.activeLocale, key) ?? this.resolveKey("en", key);

    if (raw === undefined || raw === null) {
      this.missingKeys.add(`${this.activeLocale}:${key}`);
      return key; // return key as ultimate fallback
    }

    if (!params || typeof raw !== "string") {
      return String(raw);
    }

    return this.interpolate(raw, params);
  }

  /**
   * Translates pluralized strings based on count.
   */
  public plural(singularKey: string, pluralKey: string, count: number, params?: InterpolationParams): string {
    const key = Math.abs(count) === 1 ? singularKey : pluralKey;
    return this.t(key, { count, ...params });
  }

  /**
   * Returns list of missing keys detected during runtime execution.
   */
  public getMissingKeys(): string[] {
    return Array.from(this.missingKeys);
  }

  public clearMissingKeys(): void {
    this.missingKeys.clear();
  }

  private resolveKey(locale: SupportedLocale, key: string): string | undefined {
    const dict = DICTIONARIES[locale];
    if (!dict) return undefined;

    const parts = key.split(".");
    let current: unknown = dict;

    for (const part of parts) {
      if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return typeof current === "string" ? current : undefined;
  }

  public static interpolate(text: string, params: InterpolationParams): string {
    return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, varName) => {
      if (varName in params) {
        const val = params[varName];
        return val !== null && val !== undefined ? String(val) : "";
      }
      return `{{${varName}}}`;
    });
  }

  private interpolate(text: string, params: InterpolationParams): string {
    return I18nEngine.interpolate(text, params);
  }

  // Static API delegates to default singleton instance
  public static translate(key: string, params?: InterpolationParams): string {
    return defaultI18nEngine.t(key, params);
  }

  public static t(key: string, params?: InterpolationParams): string {
    return defaultI18nEngine.t(key, params);
  }

  public static setLocale(locale: SupportedLocale): void {
    defaultI18nEngine.setLocale(locale);
  }

  public static getLocale(): SupportedLocale {
    return defaultI18nEngine.getLocale();
  }

  public static plural(count: number, singular: string, plural: string): string {
    return Math.abs(count) === 1 ? singular : plural;
  }

  public static getMissingKeys(): string[] {
    return defaultI18nEngine.getMissingKeys();
  }

  public static clearMissingKeysLog(): void {
    defaultI18nEngine.clearMissingKeys();
  }
}

// Global default instance
export const defaultI18nEngine = new I18nEngine("en");
