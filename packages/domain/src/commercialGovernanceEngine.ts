import {
  PortfolioTier,
  CommercialDecisionAction,
  CommercialReadinessGates,
  PortfolioPriorityScoreInput,
  PortfolioPriorityScoreOutput,
  VerticalCommercialProfile,
  IndustryOnboardingTemplate,
  UnitEconomics,
} from "@kwakopos2/contracts";


export class CommercialGovernanceEngine {
  /**
   * Calculates Portfolio Priority Score based on 10 dimensions:
   * Score = (Demand + Evidence + Product + Reliability + Viability + Position + Revenue)
   *       - (ImplementationCost + SupportCost + ComplianceRisk)
   */
  public calculatePortfolioPriorityScore(input: PortfolioPriorityScoreInput): PortfolioPriorityScoreOutput {
    const positiveScore =
      input.marketDemandScore +
      input.customerEvidenceScore +
      input.productReadinessScore +
      input.reliabilityScore +
      input.commercialViabilityScore +
      input.competitivePositionScore +
      input.revenuePotentialScore; // max 70

    const negativePenalty =
      input.implementationCostScore + input.supportCostScore + input.complianceRiskScore; // max 30

    const rawScore = positiveScore - negativePenalty; // range: -30 to +70
    // Normalize to 0-100 scale: (rawScore + 30) / 100 * 100
    const normalizedScore = Math.min(100, Math.max(0, Math.round(((rawScore + 30) / 100) * 100)));

    let tierAssignment: PortfolioTier = "TIER_3_SPECIALIZED";
    let actionRecommendation: CommercialDecisionAction = "MAINTAIN";

    if (normalizedScore >= 75) {
      tierAssignment = "TIER_1_FLAGSHIP";
      actionRecommendation = normalizedScore >= 88 ? "INVEST" : "GROW";
    } else if (normalizedScore >= 50) {
      tierAssignment = "TIER_2_STRATEGIC";
      actionRecommendation = normalizedScore >= 62 ? "MAINTAIN" : "PILOT";
    } else {
      tierAssignment = "TIER_3_SPECIALIZED";
      actionRecommendation = normalizedScore < 30 ? "RETIRE" : "PAUSE";
    }


    return {
      verticalId: input.verticalId,
      rawScore,
      normalizedScore,
      tierAssignment,
      actionRecommendation,
      evaluatedAt: new Date().toISOString(),
    };
  }

  /**
   * Evaluates Gates A, B, C, D for General Availability (GA) eligibility.
   */
  public evaluateReadinessGates(
    gateA_Product: boolean,
    gateB_Engineering: boolean,
    gateC_Commercial: boolean,
    gateD_Market: boolean
  ): CommercialReadinessGates {
    const overallGA_Eligible = gateA_Product && gateB_Engineering && gateC_Commercial && gateD_Market;
    return {
      gateA_ProductReadiness: gateA_Product ? "PASSED" : "FAILED",
      gateB_EngineeringReadiness: gateB_Engineering ? "PASSED" : "FAILED",
      gateC_CommercialReadiness: gateC_Commercial ? "PASSED" : "FAILED",
      gateD_MarketReadiness: gateD_Market ? "PASSED" : "FAILED",
      overallGA_Eligible,
    };
  }

  /**
   * Generates Industry-Aware Initial Onboarding Environment Template
   */
  public generateIndustryOnboardingTemplate(verticalId: string): IndustryOnboardingTemplate {
    switch (verticalId.toLowerCase()) {
      case "sacco":
      case "saccovicoba":
        return {
          verticalId: "saccovicoba",
          industryName: "SACCO / VICOBA",
          defaultRoleNames: ["SACCO Manager", "Credit Officer", "Treasury Officer", "Auditor"],
          defaultNavigationItems: ["Members", "Savings", "Share Capital", "Loans", "Guarantors", "Meetings", "Dividends", "Reports"],
          defaultWorkflows: ["Member Onboarding KYC", "Loan Application & Credit Scoring", "Disbursement Matrix", "Dividend Calculation"],
          defaultReports: ["Portfolio at Risk (PAR)", "Member Savings Ledger", "Loan Amortization", "AGM Financial Summary"],
          terminologyMap: { Customer: "Member", Product: "Loan Product", Account: "Savings Account" },
          featureFlags: { enableGroupCycles: true, enableGuarantorPledges: true, enableShareDividends: true },
          onboardingTasks: ["Import Member Master", "Setup Savings Products", "Define Interest Calculation Formulas", "First Share Purchase"],
        };

      case "lawfirm":
      case "legal":
        return {
          verticalId: "lawfirm",
          industryName: "Law Firm",
          defaultRoleNames: ["Managing Partner", "Senior Advocate", "Legal Assistant", "Billing Clerk"],
          defaultNavigationItems: ["Clients", "Matters", "Hearings", "Documents", "Time Tracking", "Retainers", "Billing", "Reports"],
          defaultWorkflows: ["Case Conflict Check", "Hearing Calendar Schedule", "Billable Time Entry", "Client Retainer Deduction"],
          defaultReports: ["Matter Profitability", "Advocate Billable Hours", "Trust Account Reconciliation", "Unbilled Disbursable Expenses"],
          terminologyMap: { Customer: "Client", Project: "Matter", Service: "Legal Counsel" },
          featureFlags: { enableTrustAccounting: true, enableTimeTracker: true, enableCourtCalendarSync: true },
          onboardingTasks: ["Import Client List", "Configure Advocate Rates", "Create Active Matter Categories", "First Time Slip Entry"],
        };

      case "vehiclefleet":
      case "fleet":
        return {
          verticalId: "vehiclefleet",
          industryName: "Vehicle & Fleet Management",
          defaultRoleNames: ["Fleet Manager", "Dispatcher", "Maintenance Supervisor", "Driver"],
          defaultNavigationItems: ["Vehicles", "Drivers", "Trips", "Fuel Logs", "Maintenance", "Tyre Ledger", "Compliance", "Reports"],
          defaultWorkflows: ["Trip Dispatch & GPS Tracking", "Fuel Log Fraud Inspection", "Preventive Maintenance Schedule", "Licensing Renewal Alert"],
          defaultReports: ["Fleet Utilization Rate", "Cost Per Kilometer", "Fuel Consumption Variance", "Driver Performance Scorecard"],
          terminologyMap: { Asset: "Vehicle", Employee: "Driver", Service: "Maintenance Job" },
          featureFlags: { enableGPSTelematics: true, enableFuelAnomalyDetection: true, enableTyreTracking: true },
          onboardingTasks: ["Register Fleet Vehicles", "Add Driver Profiles", "Setup Fuel Cards", "Record First Vehicle Inspection"],
        };

      case "restaurant":
        return {
          verticalId: "restaurant",
          industryName: "Restaurant",
          defaultRoleNames: ["Floor Manager", "Head Chef", "Waiter/Waitress", "Cashier"],
          defaultNavigationItems: ["Tables", "Menu & Recipes", "POS Billing", "Kitchen Display (KDS)", "Staff Orders", "Stock", "Reports"],
          defaultWorkflows: ["Table Ordering", "Kitchen Ticket Dispatch", "Split Bill Payment", "Daily Food-Cost Variance"],
          defaultReports: ["Hourly Cover Count", "Table Utilization Rate", "Food Cost Ratio", "Menu Item Profitability"],
          terminologyMap: { Customer: "Diner", Product: "Dish/Menu Item", Order: "Ticket" },
          featureFlags: { enableKDS: true, enableTableMap: true, enableRecipeBOM: true },
          onboardingTasks: ["Design Dining Table Floor Plan", "Import Menu & Modifiers", "Connect Kitchen Display Printers", "First Order Sale"],
        };

      default:
        return {
          verticalId,
          industryName: verticalId.toUpperCase(),
          defaultRoleNames: ["Store Manager", "Sales Operator", "Inventory Officer", "Cashier"],
          defaultNavigationItems: ["POS", "Products", "Inventory", "Customers", "Suppliers", "Sales", "Reports"],
          defaultWorkflows: ["POS Checkout", "Stock Adjustment", "Purchase Order Receiving"],
          defaultReports: ["Daily Sales Summary", "Inventory Valuation", "Gross Profit Report"],
          terminologyMap: { Customer: "Customer", Product: "Product" },
          featureFlags: { enableOfflineMode: true, enableBarcodeScan: true },
          onboardingTasks: ["Set Store Profile", "Import Inventory Catalog", "Open Cash Session", "Process First Sale"],
        };
    }
  }

  /**
   * Evaluates "Do Not Commercialize" rules to protect engineering resources & cross-industry stability.
   */
  public enforceDoNotCommercializePolicy(profile: VerticalCommercialProfile): {
    canCommercialize: boolean;
    rejectionReason?: string;
  } {
    if (!profile.readinessGates.overallGA_Eligible) {
      return {
        canCommercialize: false,
        rejectionReason: "REJECTED: All four Commercial Readiness Gates (Gates A, B, C, D) must pass before commercial launch.",
      };
    }

    if (profile.designPartnersActiveCount < 1) {
      return {
        canCommercialize: false,
        rejectionReason: "REJECTED: Vertical must have at least 1 active design partner with empirical product-market-fit feedback.",
      };
    }

    if (!profile.demoEnvironmentReady) {
      return {
        canCommercialize: false,
        rejectionReason: "REJECTED: Isolated demo environment must be operational before commercial sales enablement.",
      };
    }

    return { canCommercialize: true };
  }
}

export const globalCommercialGovernanceEngine = new CommercialGovernanceEngine();
