import {
  CountryPackManifest,
  MultiCurrencyTransactionRecord,
  CountryMarketReadinessGate,
  GlobalExpansionDashboardSummary,
} from "@kwakopos2/contracts";
import { globalGlobalExpansionEngine } from "@kwakopos2/domain";

export class GlobalExpansionService {
  public getCountryPack(countryCode: string): CountryPackManifest {
    return globalGlobalExpansionEngine.getCountryPack(countryCode);
  }

  public convertCurrency(input: {
    transactionId: string;
    tenantBaseCurrency: string;
    transactionCurrency: string;
    transactionAmount: number;
    exchangeRateUsed: number;
  }): MultiCurrencyTransactionRecord {
    return globalGlobalExpansionEngine.convertCurrency(input);
  }

  public calculateTax(input: {
    amount: number;
    countryCode: string;
    taxCategory: "STANDARD_VAT" | "REDUCED_VAT" | "ZERO_RATED" | "EXEMPT" | "WITHHOLDING";
  }): { netAmount: number; taxAmount: number; grossAmount: number; vatRatePct: number } {
    return globalGlobalExpansionEngine.calculateCountryTax(input);
  }

  public evaluateMarketReadiness(checklist: {
    legalReviewPassed: boolean;
    taxReviewPassed: boolean;
    paymentReadinessPassed: boolean;
    currencyReadinessPassed: boolean;
    languageReadinessPassed: boolean;
    privacyDataReviewPassed: boolean;
    hostingResidencyPassed: boolean;
    industryAssessmentPassed: boolean;
    securityAssessmentPassed: boolean;
    operationalReadinessPassed: boolean;
    supportReadinessPassed: boolean;
    partnerReadinessPassed: boolean;
    pilotValidationPassed: boolean;
    commercialValidationPassed: boolean;
    zeroCodeForkVerified: boolean;
  }): CountryMarketReadinessGate {
    return globalGlobalExpansionEngine.evaluateCountryMarketReadiness(checklist);
  }

  public getDashboardMetrics(): GlobalExpansionDashboardSummary {
    return globalGlobalExpansionEngine.getGlobalExpansionSummary();
  }
}

export const globalGlobalExpansionService = new GlobalExpansionService();
