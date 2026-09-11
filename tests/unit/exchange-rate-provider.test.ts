import { describe, it, expect, beforeEach } from "vitest";
import { ExchangeRateProvider } from "@kwakopos2/domain";

describe("H-014: Multi-Currency ExchangeRateProvider Suite", () => {
  let provider: ExchangeRateProvider;

  beforeEach(() => {
    ExchangeRateProvider.resetInstance();
    provider = ExchangeRateProvider.getInstance();
  });

  it("should provide default seeded rates with TZS base", () => {
    const usdToTzs = provider.getRate("USD", "TZS");
    expect(usdToTzs).toBeGreaterThan(2000);

    const eurToTzs = provider.getRate("EUR", "TZS");
    expect(eurToTzs).toBeGreaterThan(usdToTzs);

    // Identity rate
    expect(provider.getRate("USD", "USD")).toBe(1.0);
    expect(provider.getRate("TZS", "TZS")).toBe(1.0);
  });

  it("should calculate inverse rates and cross-currency conversions accurately", () => {
    // Record explicit rate
    provider.recordRate({
      fromCurrency: "USD",
      toCurrency: "TZS",
      rate: 2600.0,
      source: "CENTRAL_BANK_BOT",
      effectiveDate: "2026-09-11",
    });

    // Inverse rate: TZS to USD
    const tzsToUsd = provider.getRate("TZS", "USD", "2026-09-11");
    expect(Math.round(tzsToUsd * 2600)).toBe(1);

    // Conversion
    const conversion = provider.convert(100, "USD", "TZS", "2026-09-11");
    expect(conversion.convertedAmount).toBe(260000);
    expect(conversion.exchangeRate).toBe(2600.0);
  });

  it("should snapshot daily rates with source provenance", () => {
    const record = provider.recordRate({
      fromCurrency: "EUR",
      toCurrency: "TZS",
      rate: 2850.0,
      source: "OPEN_EXCHANGE_RATES",
      effectiveDate: "2026-09-11",
    });

    expect(record.id).toBeDefined();
    expect(record.source).toBe("OPEN_EXCHANGE_RATES");
    expect(record.rate).toBe(2850.0);

    const rates = provider.listRates("2026-09-11");
    expect(rates.some((r) => r.fromCurrency === "EUR" && r.rate === 2850.0)).toBe(true);
  });
});
