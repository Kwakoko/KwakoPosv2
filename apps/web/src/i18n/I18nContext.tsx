/**
 * KwakoPos v2 — React I18n Context & Custom Hooks
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { type SupportedLocale, type InterpolationParams, SUPPORTED_LOCALES, type LocaleInfo } from "./types.js";
import { I18nEngine, defaultI18nEngine } from "./i18nEngine.js";
import { resolveInitialLocale, persistLocalePreference } from "./languageResolver.js";
import {
  formatNumber as fmtNum,
  formatCurrency as fmtCurr,
  formatMoneyCompact as fmtMoneyCompact,
  formatDate as fmtDate,
  formatTime as fmtTime,
  formatRelativeTime as fmtRelTime,
} from "./formatters.js";

export interface I18nContextType {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  localeInfo: LocaleInfo;
  availableLocales: LocaleInfo[];
  t: (key: string, params?: InterpolationParams) => string;
  plural: (singularKey: string, pluralKey: string, count: number, params?: InterpolationParams) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatCurrency: (value: number, currency?: string, symbol?: string) => string;
  formatMoneyCompact: (value: number, symbol?: string) => string;
  formatDate: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatTime: (date: Date | string | number) => string;
  formatRelativeTime: (value: number, unit: Intl.RelativeTimeFormatUnit) => string;
}

export const I18nContext = createContext<I18nContextType>({
  locale: "en",
  setLocale: () => undefined,
  localeInfo: SUPPORTED_LOCALES.en,
  availableLocales: Object.values(SUPPORTED_LOCALES),
  t: (k) => k,
  plural: (s, p, c) => (Math.abs(c) === 1 ? s : p),
  formatNumber: (v) => String(v),
  formatCurrency: (v) => `Tsh ${v}`,
  formatMoneyCompact: (v) => `Tsh ${v}`,
  formatDate: () => "",
  formatTime: () => "",
  formatRelativeTime: (v, u) => `${v} ${u}`,
});

export interface I18nProviderProps {
  children: React.ReactNode;
  userLocale?: string | null;
  tenantLocale?: string | null;
}

export const I18nProvider: React.FC<I18nProviderProps> = ({
  children,
  userLocale,
  tenantLocale,
}) => {
  const [locale, setLocaleState] = useState<SupportedLocale>(() =>
    resolveInitialLocale({ userLocale, tenantLocale })
  );

  const engine = useMemo(() => new I18nEngine(locale), [locale]);

  const setLocale = useCallback((newLocale: SupportedLocale) => {
    setLocaleState(newLocale);
    persistLocalePreference(newLocale);
    if (typeof document !== "undefined") {
      document.documentElement.lang = newLocale;
    }
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const t = useCallback(
    (key: string, params?: InterpolationParams) => engine.t(key, params),
    [engine]
  );

  const plural = useCallback(
    (singularKey: string, pluralKey: string, count: number, params?: InterpolationParams) =>
      engine.plural(singularKey, pluralKey, count, params),
    [engine]
  );

  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) => fmtNum(value, locale, options),
    [locale]
  );

  const formatCurrency = useCallback(
    (value: number, currency: string = "TZS", symbol?: string) =>
      fmtCurr(value, locale, currency, symbol),
    [locale]
  );

  const formatMoneyCompact = useCallback(
    (value: number, symbol: string = "Tsh") => fmtMoneyCompact(value, locale, symbol),
    [locale]
  );

  const formatDate = useCallback(
    (date: Date | string | number, options?: Intl.DateTimeFormatOptions) =>
      fmtDate(date, locale, options),
    [locale]
  );

  const formatTime = useCallback(
    (date: Date | string | number) => fmtTime(date, locale),
    [locale]
  );

  const formatRelativeTime = useCallback(
    (value: number, unit: Intl.RelativeTimeFormatUnit) =>
      fmtRelTime(value, unit, locale),
    [locale]
  );

  const contextValue: I18nContextType = useMemo(
    () => ({
      locale,
      setLocale,
      localeInfo: SUPPORTED_LOCALES[locale] || SUPPORTED_LOCALES.en,
      availableLocales: Object.values(SUPPORTED_LOCALES),
      t,
      plural,
      formatNumber,
      formatCurrency,
      formatMoneyCompact,
      formatDate,
      formatTime,
      formatRelativeTime,
    }),
    [
      locale,
      setLocale,
      t,
      plural,
      formatNumber,
      formatCurrency,
      formatMoneyCompact,
      formatDate,
      formatTime,
      formatRelativeTime,
    ]
  );

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>;
};

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useTranslation must be used within an I18nProvider");
  }
  return context;
}

export function useLocale() {
  const { locale, setLocale, localeInfo, availableLocales } = useTranslation();
  return { locale, setLocale, localeInfo, availableLocales };
}

export function useFormatters() {
  const {
    formatNumber,
    formatCurrency,
    formatMoneyCompact,
    formatDate,
    formatTime,
    formatRelativeTime,
  } = useTranslation();
  return {
    formatNumber,
    formatCurrency,
    formatMoneyCompact,
    formatDate,
    formatTime,
    formatRelativeTime,
  };
}
