/**
 * KwakoPos v2 — Locale-Aware Formatters
 *
 * Implements standard Internationalization (Intl) APIs for Currency, Numbers,
 * Dates, Times, and Relative Times across English, French, and Kiswahili.
 */

import { type SupportedLocale } from "./types.js";

const LOCALE_TAG_MAP: Record<SupportedLocale, string> = {
  en: "en-US",
  fr: "fr-FR",
  sw: "sw-TZ",
};

/**
 * Formats a number with locale-appropriate thousand and decimal separators.
 */
export function formatNumber(
  value: number,
  locale: SupportedLocale = "en",
  options?: Intl.NumberFormatOptions
): string {
  if (typeof value !== "number" || isNaN(value)) return "0";
  const tag = LOCALE_TAG_MAP[locale] || "en-US";
  return new Intl.NumberFormat(tag, options).format(value);
}

/**
 * Formats currency amount preserving tenant currency code/symbol while using locale number grouping.
 */
export function formatCurrency(
  value: number,
  locale: SupportedLocale = "en",
  currency: string = "TZS",
  currencySymbol?: string
): string {
  if (typeof value !== "number" || isNaN(value)) value = 0;
  const tag = LOCALE_TAG_MAP[locale] || "en-US";

  // If a specific symbol is provided (e.g. "Tsh", "$", "KSh"), format number and prepend/append
  if (currencySymbol) {
    const formattedNum = new Intl.NumberFormat(tag, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);

    // In French, currency symbols are placed after the number
    if (locale === "fr") {
      return `${formattedNum} ${currencySymbol}`;
    }
    return `${currencySymbol} ${formattedNum}`;
  }

  // Standard ISO currency formatting
  try {
    return new Intl.NumberFormat(tag, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // Fallback if currency code is custom
    const num = new Intl.NumberFormat(tag, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
    return `${currency} ${num}`;
  }
}

/**
 * Formats large amounts compactly (e.g., Tsh 1.2M, Tsh 45K).
 */
export function formatMoneyCompact(
  value: number,
  locale: SupportedLocale = "en",
  symbol: string = "Tsh"
): string {
  if (typeof value !== "number" || isNaN(value)) return `${symbol} 0`;

  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (abs >= 1_000_000) {
    const val = (abs / 1_000_000).toFixed(1);
    return locale === "fr"
      ? `${sign}${val} M ${symbol}`
      : `${sign}${symbol} ${val}M`;
  }
  if (abs >= 1_000) {
    const val = (abs / 1_000).toFixed(0);
    return locale === "fr"
      ? `${sign}${val} k ${symbol}`
      : `${sign}${symbol} ${val}K`;
  }

  const formatted = formatNumber(abs, locale);
  return locale === "fr"
    ? `${sign}${formatted} ${symbol}`
    : `${sign}${symbol} ${formatted}`;
}

/**
 * Formats a Date according to the active locale.
 */
export function formatDate(
  dateInput: Date | string | number,
  locale: SupportedLocale = "en",
  options?: Intl.DateTimeFormatOptions
): string {
  if (!dateInput) return "";
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return "";

  const tag = LOCALE_TAG_MAP[locale] || "en-US";
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  };

  return new Intl.DateTimeFormat(tag, options || defaultOptions).format(date);
}

/**
 * Formats time according to the active locale.
 */
export function formatTime(
  dateInput: Date | string | number,
  locale: SupportedLocale = "en"
): string {
  if (!dateInput) return "";
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return "";

  const tag = LOCALE_TAG_MAP[locale] || "en-US";
  const isFrenchOrSwahili = locale === "fr" || locale === "sw";

  return new Intl.DateTimeFormat(tag, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: !isFrenchOrSwahili,
  }).format(date);
}

/**
 * Formats relative time (e.g., "3 minutes ago", "dans 2 heures", "dakika 5 zilizopita").
 */
export function formatRelativeTime(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  locale: SupportedLocale = "en"
): string {
  const tag = LOCALE_TAG_MAP[locale] || "en-US";
  try {
    const rtf = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });
    return rtf.format(value, unit);
  } catch {
    return `${value} ${unit}`;
  }
}
