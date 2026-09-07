import { describe, it, expect, beforeEach } from "vitest";
import { I18nEngine } from "../../apps/web/src/i18n/i18nEngine.js";
import {
  formatCurrency,
  formatMoneyCompact,
  formatDate,
  formatTime,
  formatNumber,
} from "../../apps/web/src/i18n/formatters.js";
import {
  resolveInitialLocale,
  normalizeBrowserLanguage,
  isSupportedLocale,
} from "../../apps/web/src/i18n/languageResolver.js";

describe("I18nEngine — Core Translation and Parameter Interpolation", () => {
  beforeEach(() => {
    I18nEngine.clearMissingKeysLog();
    I18nEngine.setLocale("en");
  });

  it("translates top-level and nested dot-notated keys in English", () => {
    expect(I18nEngine.translate("common.save")).toBe("Save");
    expect(I18nEngine.translate("common.cancel")).toBe("Cancel");
    expect(I18nEngine.translate("pos.title")).toBe("Point of Sale Counter");
    expect(I18nEngine.translate("settings.title")).toBe("System Settings & Configuration");
  });

  it("switches active locale to French and translates seamlessly", () => {
    I18nEngine.setLocale("fr");
    expect(I18nEngine.getLocale()).toBe("fr");
    expect(I18nEngine.translate("common.save")).toBe("Enregistrer");
    expect(I18nEngine.translate("common.cancel")).toBe("Annuler");
    expect(I18nEngine.translate("pos.title")).toBe("Comptoir Point de Vente");
    expect(I18nEngine.translate("finance.title")).toBe("Finance & Grand Livre Comptable");
  });

  it("switches active locale to Kiswahili and translates commercial terminology correctly", () => {
    I18nEngine.setLocale("sw");
    expect(I18nEngine.getLocale()).toBe("sw");
    expect(I18nEngine.translate("common.save")).toBe("Hifadhi");
    expect(I18nEngine.translate("common.cancel")).toBe("Ghairi");
    expect(I18nEngine.translate("pos.title")).toBe("Kaunta ya Nukta ya Mauzo");
    expect(I18nEngine.translate("pos.checkoutTitle")).toBe("Kamilisha Muamala");
    expect(I18nEngine.translate("finance.title")).toBe("Fedha & Leja Kuu ya Biashara");
  });

  it("interpolates {{variables}} correctly within templates", () => {
    const template = "Welcome {{user}}, you have {{count}} items in cart.";
    const interpolated = I18nEngine.interpolate(template, { user: "Amani", count: 3 });
    expect(interpolated).toBe("Welcome Amani, you have 3 items in cart.");
  });

  it("handles plural rules across different counts", () => {
    expect(I18nEngine.plural(1, "item", "items")).toBe("item");
    expect(I18nEngine.plural(0, "item", "items")).toBe("items");
    expect(I18nEngine.plural(5, "item", "items")).toBe("items");
  });

  it("falls back gracefully and records missing key telemetry on unknown keys", () => {
    const unknownKey = "nonexistent.namespace.fakeKey";
    const result = I18nEngine.translate(unknownKey);
    expect(result).toBe(unknownKey);
    expect(I18nEngine.getMissingKeys()).toContain(`en:${unknownKey}`);
  });
});

describe("Formatters — Intl-based Currency, Numbers, Dates, and Times", () => {
  it("formats currencies accurately according to active locale", () => {
    const amount = 1500000;
    const enFormatted = formatCurrency(amount, "en", "TZS");
    const frFormatted = formatCurrency(amount, "fr", "TZS");
    const swFormatted = formatCurrency(amount, "sw", "TZS");

    expect(enFormatted).toBeTruthy();
    expect(frFormatted).toBeTruthy();
    expect(swFormatted).toBeTruthy();
    expect(enFormatted).toContain("TZS");
  });

  it("formats compact money figures (K, M, B) cleanly", () => {
    expect(formatMoneyCompact(12500000, "en", "TZS")).toBe("TZS 12.5M");
    expect(formatMoneyCompact(450000, "en", "TZS")).toBe("TZS 450K");
    expect(formatMoneyCompact(500, "en", "TZS")).toBe("TZS 500");
  });

  it("formats numbers with locale grouping", () => {
    const enNum = formatNumber(1234567.89, "en");
    const frNum = formatNumber(1234567.89, "fr");

    expect(enNum).toContain("1,234,567.89");
    expect(frNum).toBeTruthy();
  });

  it("formats dates and times properly across locales", () => {
    const date = new Date("2026-09-05T10:30:00Z");
    const enDate = formatDate(date, "en", "short");
    const frDate = formatDate(date, "fr", "short");

    expect(enDate).toBeTruthy();
    expect(frDate).toBeTruthy();

    const enTime = formatTime(date, "en", "short");
    expect(enTime).toBeTruthy();
  });
});

describe("LanguageResolver — Priority Chain Resolution", () => {
  it("identifies supported locales accurately", () => {
    expect(isSupportedLocale("en")).toBe(true);
    expect(isSupportedLocale("fr")).toBe(true);
    expect(isSupportedLocale("sw")).toBe(true);
    expect(isSupportedLocale("de")).toBe(false);
    expect(isSupportedLocale("es")).toBe(false);
    expect(isSupportedLocale(null)).toBe(false);
  });

  it("normalizes browser languages accurately", () => {
    expect(normalizeBrowserLanguage("en-US")).toBe("en");
    expect(normalizeBrowserLanguage("en-GB")).toBe("en");
    expect(normalizeBrowserLanguage("fr-FR")).toBe("fr");
    expect(normalizeBrowserLanguage("fr-CA")).toBe("fr");
    expect(normalizeBrowserLanguage("sw-TZ")).toBe("sw");
    expect(normalizeBrowserLanguage("sw-KE")).toBe("sw");
    expect(normalizeBrowserLanguage("de-DE")).toBe(null);
  });

  it("resolves by priority: user > tenant > default", () => {
    // When userLocale is provided, it wins over tenantLocale
    expect(resolveInitialLocale({ userLocale: "fr", tenantLocale: "sw" })).toBe("fr");

    // When userLocale is invalid or null, tenantLocale takes precedence
    expect(resolveInitialLocale({ userLocale: null, tenantLocale: "sw" })).toBe("sw");
    expect(resolveInitialLocale({ userLocale: "invalid", tenantLocale: "fr" })).toBe("fr");

    // When both are missing, falls back to default 'en'
    expect(resolveInitialLocale({})).toBe("en");
  });
});
