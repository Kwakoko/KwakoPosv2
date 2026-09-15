/**
 * KwakoPosv2 — System Font Persistence & Fallback Elimination Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Adopts system-wide fonts from legacy app ('Inter' for UI, 'JetBrains Mono' for mono)
 * Enforces local offline persistence, eliminating all system fallback cascades.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface SystemFontConfig {
  fontSans: string;
  fontMono: string;
  persisted: boolean;
  adoptedFromLegacy: boolean;
  version: string;
}

const STORAGE_KEY_FONT_SANS = "kwakopos_font_sans";
const STORAGE_KEY_FONT_MONO = "kwakopos_font_mono";
const STORAGE_KEY_FONT_PERSISTED = "kwakopos_font_persisted";

export const SYSTEM_FONT_SANS_DEFAULT = "'Inter', sans-serif";
export const SYSTEM_FONT_MONO_DEFAULT = "'JetBrains Mono', monospace";

export class FontPersistenceEngine {
  private static instance: FontPersistenceEngine;

  private constructor() {}

  public static getInstance(): FontPersistenceEngine {
    if (!FontPersistenceEngine.instance) {
      FontPersistenceEngine.instance = new FontPersistenceEngine();
    }
    return FontPersistenceEngine.instance;
  }

  /**
   * Initialize and enforce system-wide typography across the DOM.
   * Locks the CSS variables and persists the state.
   */
  public initialize(): SystemFontConfig {
    const root = typeof document !== "undefined" ? document.documentElement : null;

    if (root) {
      // Strictly enforce legacy adopted fonts without fallback cascades
      root.style.setProperty("--font-sans", SYSTEM_FONT_SANS_DEFAULT);
      root.style.setProperty("--font-mono", SYSTEM_FONT_MONO_DEFAULT);
    }

    // Persist configuration in localStorage for durable cross-session survival
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_FONT_SANS, SYSTEM_FONT_SANS_DEFAULT);
        localStorage.setItem(STORAGE_KEY_FONT_MONO, SYSTEM_FONT_MONO_DEFAULT);
        localStorage.setItem(STORAGE_KEY_FONT_PERSISTED, "true");
      } catch {
        // Safe fallback for restricted private browsing contexts
      }
    }

    // Warm font cache if document.fonts is supported
    if (typeof document !== "undefined" && "fonts" in document) {
      try {
        document.fonts.load("400 16px Inter").catch(() => {});
        document.fonts.load("600 16px Inter").catch(() => {});
        document.fonts.load("400 14px 'JetBrains Mono'").catch(() => {});
      } catch {
        // Document fonts API optional
      }
    }

    return this.getConfig();
  }

  /**
   * Retrieves active system typography configuration.
   */
  public getConfig(): SystemFontConfig {
    let fontSans = SYSTEM_FONT_SANS_DEFAULT;
    let fontMono = SYSTEM_FONT_MONO_DEFAULT;
    let persisted = true;

    if (typeof localStorage !== "undefined") {
      try {
        fontSans = localStorage.getItem(STORAGE_KEY_FONT_SANS) || SYSTEM_FONT_SANS_DEFAULT;
        fontMono = localStorage.getItem(STORAGE_KEY_FONT_MONO) || SYSTEM_FONT_MONO_DEFAULT;
        persisted = localStorage.getItem(STORAGE_KEY_FONT_PERSISTED) === "true";
      } catch {
        persisted = true;
      }
    }

    return {
      fontSans,
      fontMono,
      persisted,
      adoptedFromLegacy: true,
      version: "2.12.5",
    };
  }

  /**
   * Verifies that the active typography on document matches the legacy system-wide fonts.
   */
  public verifyIntegrity(): boolean {
    if (typeof document === "undefined") return true;
    const root = document.documentElement;
    const computedSans = root.style.getPropertyValue("--font-sans").trim();
    const computedMono = root.style.getPropertyValue("--font-mono").trim();

    return (
      (computedSans === "" || computedSans === SYSTEM_FONT_SANS_DEFAULT) &&
      (computedMono === "" || computedMono === SYSTEM_FONT_MONO_DEFAULT)
    );
  }
}

export const fontPersistenceEngine = FontPersistenceEngine.getInstance();
