/**
 * KwakoPos v2 — Language Preference Resolver
 *
 * Implements priority-based resolution:
 * 1. User's explicit selection stored in localStorage ('kwakopos:v2:locale')
 * 2. User account profile preference
 * 3. Tenant organization configuration
 * 4. Browser / Device language (navigator.language)
 * 5. Platform Default ('en')
 */

import { type SupportedLocale } from "./types.js";

const STORAGE_KEY = "kwakopos:v2:locale";

export function isSupportedLocale(val: unknown): val is SupportedLocale {
  return val === "en" || val === "fr" || val === "sw";
}

export function normalizeBrowserLanguage(langString?: string | null): SupportedLocale | null {
  if (!langString) return null;
  const lower = langString.toLowerCase().trim();

  if (lower.startsWith("fr")) return "fr";
  if (lower.startsWith("sw")) return "sw";
  if (lower.startsWith("en")) return "en";

  return null;
}

export function resolveInitialLocale(options?: {
  userLocale?: string | null;
  tenantLocale?: string | null;
}): SupportedLocale {
  // 1. Check localStorage
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isSupportedLocale(stored)) {
        return stored;
      }
    } catch {
      // localStorage may fail in restricted sandboxes
    }
  }

  // 2. Check User profile preference
  if (isSupportedLocale(options?.userLocale)) {
    return options.userLocale;
  }

  // 3. Check Tenant organization preference
  if (isSupportedLocale(options?.tenantLocale)) {
    return options.tenantLocale;
  }

  // 4. Check Browser navigator.languages / navigator.language
  if (typeof navigator !== "undefined") {
    if (Array.isArray(navigator.languages)) {
      for (const lang of navigator.languages) {
        const matched = normalizeBrowserLanguage(lang);
        if (matched) return matched;
      }
    }
    const singleMatch = normalizeBrowserLanguage(navigator.language);
    if (singleMatch) return singleMatch;
  }

  // 5. Global Default Fallback
  return "en";
}

export function persistLocalePreference(locale: SupportedLocale): void {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // ignore in environments without localStorage
    }
  }
}
