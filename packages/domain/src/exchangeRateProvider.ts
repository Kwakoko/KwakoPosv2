import { randomUUID } from "crypto";

export type RateSource = "CENTRAL_BANK_BOT" | "FIXED_PARITY" | "OPEN_EXCHANGE_RATES" | "MANUAL";

export interface ExchangeRateRecord {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number; // e.g., 2600.0 TZS per 1 USD
  inverseRate: number; // e.g., 1 / 2600.0
  source: RateSource;
  effectiveDate: string; // YYYY-MM-DD
  fetchedAt: string; // ISO timestamp
}

export class ExchangeRateProvider {
  private static instance: ExchangeRateProvider | null = null;
  private rates = new Map<string, ExchangeRateRecord>(); // key: `${fromCurrency}:${toCurrency}:${effectiveDate}`

  // Standard pinned baseline rates (TZS reference base)
  private readonly defaultRates: Record<string, number> = {
    USD: 2615.5,
    EUR: 2845.2,
    GBP: 3340.8,
    KES: 20.25,
    UGX: 0.71,
    ZAR: 145.3,
    RWF: 1.95,
  };

  public static getInstance(): ExchangeRateProvider {
    if (!ExchangeRateProvider.instance) {
      ExchangeRateProvider.instance = new ExchangeRateProvider();
    }
    return ExchangeRateProvider.instance;
  }

  public static resetInstance(): void {
    ExchangeRateProvider.instance = new ExchangeRateProvider();
  }

  constructor() {
    this.seedDefaultRates();
  }

  private seedDefaultRates(): void {
    const today = new Date().toISOString().slice(0, 10);
    for (const [curr, rate] of Object.entries(this.defaultRates)) {
      this.recordRate({
        fromCurrency: curr,
        toCurrency: "TZS",
        rate,
        source: "CENTRAL_BANK_BOT",
        effectiveDate: today,
      });
    }
  }

  /**
   * Record or snapshot an exchange rate
   */
  public recordRate(params: {
    fromCurrency: string;
    toCurrency: string;
    rate: number;
    source: RateSource;
    effectiveDate?: string;
  }): ExchangeRateRecord {
    if (params.rate <= 0) {
      throw new Error("INVALID_EXCHANGE_RATE: Rate must be strictly positive.");
    }

    const from = params.fromCurrency.toUpperCase().trim();
    const to = params.toCurrency.toUpperCase().trim();
    const date = params.effectiveDate || new Date().toISOString().slice(0, 10);
    const key = `${from}:${to}:${date}`;

    const record: ExchangeRateRecord = {
      id: randomUUID(),
      fromCurrency: from,
      toCurrency: to,
      rate: params.rate,
      inverseRate: Math.round((1 / params.rate) * 1000000) / 1000000,
      source: params.source,
      effectiveDate: date,
      fetchedAt: new Date().toISOString(),
    };

    this.rates.set(key, record);
    return { ...record };
  }

  /**
   * Get effective exchange rate between two currencies
   */
  public getRate(fromCurrency: string, toCurrency: string, effectiveDate?: string): number {
    const from = fromCurrency.toUpperCase().trim();
    const to = toCurrency.toUpperCase().trim();

    if (from === to) return 1.0;

    const date = effectiveDate || new Date().toISOString().slice(0, 10);
    const directKey = `${from}:${to}:${date}`;
    if (this.rates.has(directKey)) {
      return this.rates.get(directKey)!.rate;
    }

    // Check inverse key
    const inverseKey = `${to}:${from}:${date}`;
    if (this.rates.has(inverseKey)) {
      return this.rates.get(inverseKey)!.inverseRate;
    }

    // Cross-rate via TZS
    if (from !== "TZS" && to !== "TZS") {
      const fromToTzs = this.getRate(from, "TZS", date);
      const toToTzs = this.getRate(to, "TZS", date);
      if (fromToTzs > 0 && toToTzs > 0) {
        return Math.round((fromToTzs / toToTzs) * 1000000) / 1000000;
      }
    }

    // Fallback to default rate if available
    if (to === "TZS" && this.defaultRates[from]) return this.defaultRates[from];
    if (from === "TZS" && this.defaultRates[to]) return 1 / this.defaultRates[to];

    throw new Error(`EXCHANGE_RATE_NOT_FOUND: No rate registered between ${from} and ${to} for date ${date}.`);
  }

  /**
   * Convert monetary amount between currencies
   */
  public convert(amount: number, fromCurrency: string, toCurrency: string, effectiveDate?: string): {
    originalAmount: number;
    convertedAmount: number;
    exchangeRate: number;
    fromCurrency: string;
    toCurrency: string;
  } {
    const rate = this.getRate(fromCurrency, toCurrency, effectiveDate);
    const converted = Math.round(amount * rate * 100) / 100;
    return {
      originalAmount: amount,
      convertedAmount: converted,
      exchangeRate: rate,
      fromCurrency: fromCurrency.toUpperCase().trim(),
      toCurrency: toCurrency.toUpperCase().trim(),
    };
  }

  /**
   * List all rates for an effective date
   */
  public listRates(effectiveDate?: string): ExchangeRateRecord[] {
    const date = effectiveDate || new Date().toISOString().slice(0, 10);
    return Array.from(this.rates.values()).filter((r) => r.effectiveDate === date);
  }
}

export const globalExchangeRateProvider = ExchangeRateProvider.getInstance();
