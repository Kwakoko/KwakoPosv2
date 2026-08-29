import {
  VerticalCommercialProfile,
  PortfolioPriorityScoreInput,
  PortfolioPriorityScoreOutput,
  CommercialReadinessGates,
  IndustryOnboardingTemplate,
} from "@kwakopos2/contracts";
import { globalCommercialGovernanceEngine } from "@kwakopos2/domain";

export class CommercialReadinessService {
  private flagshipProfiles: VerticalCommercialProfile[] = [
    {
      verticalId: "retail",
      displayName: "Retail Operating System",
      tier: "TIER1_FLAGSHIP",
      targetCustomer: "Supermarkets, Boutiques, Multi-branch Retail Chains",
      valueProposition: "Simple, reliable retail operations across one or many branches.",
      primaryPromise: "Complete POS, multi-branch stock balance, supplier reordering, and cash management.",
      activationEvent: "First completed sale with inventory reconciliation",
      keyMetrics: ["sales/day", "average basket size", "inventory turnover", "repeat customer rate"],
      pricingPackages: [
        { packageName: "Starter", priceMonthlyUsd: 29, featuresIncluded: ["Single Branch POS", "1,000 Products", "Basic Sales Reports"] },
        { packageName: "Professional", priceMonthlyUsd: 79, featuresIncluded: ["5 Branches", "Unlimited Products", "Advanced Inventory", "Supplier Portal"] },
        { packageName: "Enterprise", priceMonthlyUsd: 199, featuresIncluded: ["Unlimited Branches", "Custom AI Analytics", "Dedicated Success Manager"] },
      ],
      readinessGates: { gateA_ProductReadiness: "PASSED", gateB_EngineeringReadiness: "PASSED", gateC_CommercialReadiness: "PASSED", gateD_MarketReadiness: "PASSED", overallGA_Eligible: true },
      unitEconomics: { cacUsd: 120, arpuUsd: 85, grossMarginPct: 82, supportCostUsd: 12, ltvUsd: 2550, ltvToCacRatio: 21.25 },
      demoEnvironmentReady: true,
      designPartnersActiveCount: 8,
      actionRecommendation: "INVEST",
    },
    {
      verticalId: "restaurant",
      displayName: "Restaurant Operating System",
      tier: "TIER1_FLAGSHIP",
      targetCustomer: "Restaurants, Cafes, Bars, Quick-Service Food Chains",
      valueProposition: "Run front-of-house, kitchen, stock, and finance from one system.",
      primaryPromise: "Table management, Kitchen Display (KDS), split billing, and recipe cost control.",
      activationEvent: "First completed order through kitchen workflow",
      keyMetrics: ["covers/day", "average ticket size", "table utilization", "order prep time", "food cost ratio"],
      pricingPackages: [
        { packageName: "Starter", priceMonthlyUsd: 39, featuresIncluded: ["Table Layout", "POS Order Entry", "Receipt Printer Sync"] },
        { packageName: "Professional", priceMonthlyUsd: 99, featuresIncluded: ["KDS Integration", "Recipe BOM Inventory", "Staff Commission Engine"] },
        { packageName: "Enterprise", priceMonthlyUsd: 249, featuresIncluded: ["Multi-location Kitchen Sync", "Custom QR Ordering", "Enterprise ERP Sync"] },
      ],
      readinessGates: { gateA_ProductReadiness: "PASSED", gateB_EngineeringReadiness: "PASSED", gateC_CommercialReadiness: "PASSED", gateD_MarketReadiness: "PASSED", overallGA_Eligible: true },
      unitEconomics: { cacUsd: 180, arpuUsd: 110, grossMarginPct: 80, supportCostUsd: 18, ltvUsd: 3300, ltvToCacRatio: 18.33 },
      demoEnvironmentReady: true,
      designPartnersActiveCount: 6,
      actionRecommendation: "INVEST",
    },
    {
      verticalId: "pharmacy",
      displayName: "Pharmacy Management OS",
      tier: "TIER1_FLAGSHIP",
      targetCustomer: "Retail Pharmacies, Chemist Chains, Hospital Dispensaries",
      valueProposition: "Controlled, traceable pharmacy operations with strong stock and dispensing governance.",
      primaryPromise: "Batch expiry tracking, controlled substance dispensing, prescription auditability.",
      activationEvent: "First controlled dispensing transaction",
      keyMetrics: ["prescriptions/day", "dispensing volume", "stock turnover", "expiring inventory %"],
      pricingPackages: [
        { packageName: "Starter", priceMonthlyUsd: 49, featuresIncluded: ["Prescription Entry", "Batch Expiry Alerts", "Basic Compliance Reports"] },
        { packageName: "Professional", priceMonthlyUsd: 119, featuresIncluded: ["Controlled Drug Vault", "Insurance Claims", "Supplier Auto-Restock"] },
        { packageName: "Enterprise", priceMonthlyUsd: 299, featuresIncluded: ["Hospital EMR Integration", "Multi-chain Dispensing Ledger"] },
      ],
      readinessGates: { gateA_ProductReadiness: "PASSED", gateB_EngineeringReadiness: "PASSED", gateC_CommercialReadiness: "PASSED", gateD_MarketReadiness: "PASSED", overallGA_Eligible: true },
      unitEconomics: { cacUsd: 210, arpuUsd: 135, grossMarginPct: 85, supportCostUsd: 15, ltvUsd: 4050, ltvToCacRatio: 19.28 },
      demoEnvironmentReady: true,
      designPartnersActiveCount: 5,
      actionRecommendation: "INVEST",
    },
    {
      verticalId: "lawfirm",
      displayName: "Law Firm Management OS",
      tier: "TIER1_FLAGSHIP",
      targetCustomer: "Law Firms, Legal Advocates, Corporate Legal Departments",
      valueProposition: "Manage legal matters, documents, time, billing, and client operations in one workspace.",
      primaryPromise: "Case matter lifecycle, advocate billable hours, hearing calendar, trust accounting.",
      activationEvent: "First active matter with billing activity",
      keyMetrics: ["active matters", "billable hours", "realization rate", "collections", "matter profitability"],
      pricingPackages: [
        { packageName: "Solo Advocate", priceMonthlyUsd: 59, featuresIncluded: ["10 Active Matters", "Time Tracker", "PDF Invoice Generator"] },
        { packageName: "Firm Partner", priceMonthlyUsd: 149, featuresIncluded: ["Unlimited Matters", "Trust Accounting", "Hearing Calendar Sync"] },
        { packageName: "Enterprise Legal", priceMonthlyUsd: 399, featuresIncluded: ["Custom Document Vault", "Client Portal", "Audit Compliance"] },
      ],
      readinessGates: { gateA_ProductReadiness: "PASSED", gateB_EngineeringReadiness: "PASSED", gateC_CommercialReadiness: "PASSED", gateD_MarketReadiness: "PASSED", overallGA_Eligible: true },
      unitEconomics: { cacUsd: 320, arpuUsd: 180, grossMarginPct: 88, supportCostUsd: 20, ltvUsd: 5400, ltvToCacRatio: 16.87 },
      demoEnvironmentReady: true,
      designPartnersActiveCount: 4,
      actionRecommendation: "GROW",
    },
    {
      verticalId: "saccovicoba",
      displayName: "SACCO / VICOBA Operating System",
      tier: "TIER1_FLAGSHIP",
      targetCustomer: "Savings & Credit Co-ops, VICOBA Groups, Community Finance Organizations",
      valueProposition: "Digitize member-based savings, lending, governance, and financial operations.",
      primaryPromise: "Member shares, compulsory savings, loan amortization schedules, dividend payouts.",
      activationEvent: "First member contribution and financial posting",
      keyMetrics: ["active members", "total savings", "loan portfolio outstanding", "PAR 30/60/90", "repayment rate"],
      pricingPackages: [
        { packageName: "Community VICOBA", priceMonthlyUsd: 35, featuresIncluded: ["Up to 100 Members", "Meeting Collection Mobile App"] },
        { packageName: "Growth SACCO", priceMonthlyUsd: 129, featuresIncluded: ["Up to 1,000 Members", "Automated Interest Calculations", "AGM Reports"] },
        { packageName: "Apex SACCO Federation", priceMonthlyUsd: 349, featuresIncluded: ["Unlimited Members", "Core Banking API", "Regulator Compliance Reports"] },
      ],
      readinessGates: { gateA_ProductReadiness: "PASSED", gateB_EngineeringReadiness: "PASSED", gateC_CommercialReadiness: "PASSED", gateD_MarketReadiness: "PASSED", overallGA_Eligible: true },
      unitEconomics: { cacUsd: 250, arpuUsd: 145, grossMarginPct: 83, supportCostUsd: 18, ltvUsd: 4350, ltvToCacRatio: 17.4 },
      demoEnvironmentReady: true,
      designPartnersActiveCount: 7,
      actionRecommendation: "INVEST",
    },
    {
      verticalId: "microfinance",
      displayName: "Microfinance & Lending OS",
      tier: "TIER1_FLAGSHIP",
      targetCustomer: "Microfinance Institutions (MFIs), Credit Providers, SME Lenders",
      valueProposition: "Control the complete lending lifecycle with transparent portfolio management.",
      primaryPromise: "Borrower 360, automated credit scoring, collateral vault, IFRS 9 ECL provisioning.",
      activationEvent: "First loan disbursement with repayment schedule",
      keyMetrics: ["portfolio outstanding", "PAR 30/60/90", "collection rate", "average loan size", "repeat borrowers"],
      pricingPackages: [
        { packageName: "MFI Starter", priceMonthlyUsd: 79, featuresIncluded: ["500 Active Loans", "Reducing Balance Calculator", "SMS Reminders"] },
        { packageName: "MFI Professional", priceMonthlyUsd: 199, featuresIncluded: ["5,000 Active Loans", "Collateral Vault", "Field Collector PWA"] },
        { packageName: "Enterprise MFI", priceMonthlyUsd: 499, featuresIncluded: ["Unlimited Loans", "IFRS 9 Provisioning", "Credit Bureau Integration"] },
      ],
      readinessGates: { gateA_ProductReadiness: "PASSED", gateB_EngineeringReadiness: "PASSED", gateC_CommercialReadiness: "PASSED", gateD_MarketReadiness: "PASSED", overallGA_Eligible: true },
      unitEconomics: { cacUsd: 350, arpuUsd: 210, grossMarginPct: 86, supportCostUsd: 22, ltvUsd: 6300, ltvToCacRatio: 18.0 },
      demoEnvironmentReady: true,
      designPartnersActiveCount: 6,
      actionRecommendation: "INVEST",
    },
    {
      verticalId: "poultrylivestock",
      displayName: "Poultry & Livestock Operating System",
      tier: "TIER1_FLAGSHIP",
      targetCustomer: "Commercial Farms, Smallholder Cooperatives, Hatcheries, Livestock Producers",
      valueProposition: "Manage livestock and poultry operations from farm activity to profitability.",
      primaryPromise: "Flock/herd lifecycle, daily lay rate %, Feed Conversion Ratio (FCR), vet logs.",
      activationEvent: "First farm production cycle recorded",
      keyMetrics: ["daily lay rate %", "mortality rate %", "Feed Conversion Ratio (FCR)", "farm gross margin"],
      pricingPackages: [
        { packageName: "Smallholder Farm", priceMonthlyUsd: 29, featuresIncluded: ["Single Flock/Herd", "Daily Egg & Milk Log", "Basic Feed Calculator"] },
        { packageName: "Commercial Farm", priceMonthlyUsd: 89, featuresIncluded: ["Multi-House Farm", "Automated FCR Engine", "Vaccination Alerts"] },
        { packageName: "Agri-Enterprise", priceMonthlyUsd: 229, featuresIncluded: ["Multi-Farm Network", "Hatchery Traceability", "Export Compliance"] },
      ],
      readinessGates: { gateA_ProductReadiness: "PASSED", gateB_EngineeringReadiness: "PASSED", gateC_CommercialReadiness: "PASSED", gateD_MarketReadiness: "PASSED", overallGA_Eligible: true },
      unitEconomics: { cacUsd: 140, arpuUsd: 75, grossMarginPct: 79, supportCostUsd: 10, ltvUsd: 2250, ltvToCacRatio: 16.07 },
      demoEnvironmentReady: true,
      designPartnersActiveCount: 5,
      actionRecommendation: "GROW",
    },
    {
      verticalId: "vehiclefleet",
      displayName: "Vehicle & Fleet Management OS",
      tier: "TIER1_FLAGSHIP",
      targetCustomer: "Transport Companies, Delivery Fleets, Logistics Operators, Car Rentals",
      valueProposition: "Control fleet utilization, costs, maintenance, compliance, and driver operations.",
      primaryPromise: "Vehicle dispatch, GPS telematics, fuel log fraud detection, maintenance cost/km.",
      activationEvent: "First vehicle with trip/fuel/maintenance activity",
      keyMetrics: ["vehicle utilization %", "fuel efficiency (km/L)", "maintenance cost/km", "fleet downtime"],
      pricingPackages: [
        { packageName: "Fleet Starter", priceMonthlyUsd: 49, featuresIncluded: ["Up to 10 Vehicles", "Fuel Log Entry", "Driver Inspection PWA"] },
        { packageName: "Fleet Pro", priceMonthlyUsd: 149, featuresIncluded: ["Up to 50 Vehicles", "GPS Telematics", "Preventive Maintenance Engine"] },
        { packageName: "Enterprise Logistics", priceMonthlyUsd: 399, featuresIncluded: ["Unlimited Vehicles", "Tyre Lifecycle Tracking", "Custom Fuel Anomaly AI"] },
      ],
      readinessGates: { gateA_ProductReadiness: "PASSED", gateB_EngineeringReadiness: "PASSED", gateC_CommercialReadiness: "PASSED", gateD_MarketReadiness: "PASSED", overallGA_Eligible: true },
      unitEconomics: { cacUsd: 280, arpuUsd: 160, grossMarginPct: 84, supportCostUsd: 19, ltvUsd: 4800, ltvToCacRatio: 17.14 },
      demoEnvironmentReady: true,
      designPartnersActiveCount: 6,
      actionRecommendation: "INVEST",
    },
    {
      verticalId: "hardware",
      displayName: "Hardware & Building Materials OS",
      tier: "TIER1_FLAGSHIP",
      targetCustomer: "Hardware Stores, Building Material Suppliers, Timber Yards",
      valueProposition: "Run hardware and building-material operations with quantity-aware pricing and inventory control.",
      primaryPromise: "Multi-unit conversion (packs/pieces), contractor credit pricing, cut-to-length services.",
      activationEvent: "First contractor transaction using quantity-aware pricing",
      keyMetrics: ["sales volume", "contractor accounts", "inventory turnover", "gross margin %", "reorder frequency"],
      pricingPackages: [
        { packageName: "Hardware Basic", priceMonthlyUsd: 39, featuresIncluded: ["Single Store POS", "Pack/Piece Converter", "Cash Checkout"] },
        { packageName: "Hardware Pro", priceMonthlyUsd: 109, featuresIncluded: ["Contractor Accounts", "Quotation Engine", "Warehouse Delivery Notes"] },
        { packageName: "Supply Yard Enterprise", priceMonthlyUsd: 279, featuresIncluded: ["Multi-Warehouse Sync", "Custom Contractor Tariffs"] },
      ],
      readinessGates: { gateA_ProductReadiness: "PASSED", gateB_EngineeringReadiness: "PASSED", gateC_CommercialReadiness: "PASSED", gateD_MarketReadiness: "PASSED", overallGA_Eligible: true },
      unitEconomics: { cacUsd: 190, arpuUsd: 115, grossMarginPct: 81, supportCostUsd: 14, ltvUsd: 3450, ltvToCacRatio: 18.15 },
      demoEnvironmentReady: true,
      designPartnersActiveCount: 7,
      actionRecommendation: "INVEST",
    },
    {
      verticalId: "electronics",
      displayName: "Advanced Electronics & Device Lifecycle OS",
      tier: "TIER1_FLAGSHIP",
      targetCustomer: "Electronics Retailers, Phone Stores, Device Repair Shops, Refurbishers",
      valueProposition: "Track every device from stock to sale, warranty, and after-sales service.",
      primaryPromise: "Serial/IMEI tracking, warranty registration, repair work orders, trade-in valuation.",
      activationEvent: "First serialised device sale with warranty registration",
      keyMetrics: ["device sales", "serial capture rate %", "warranty activations", "RMA rate %", "accessory attachment rate"],
      pricingPackages: [
        { packageName: "Store Starter", priceMonthlyUsd: 45, featuresIncluded: ["Serial/IMEI Capture", "Warranty Receipt Generator"] },
        { packageName: "Store Pro", priceMonthlyUsd: 125, featuresIncluded: ["Repair Work Order Management", "Trade-In Estimator", "RMA Portal"] },
        { packageName: "Refurbish Enterprise", priceMonthlyUsd: 299, featuresIncluded: ["Multi-Store IMEI Ledger", "Grade A-F Refurbishment Pipeline"] },
      ],
      readinessGates: { gateA_ProductReadiness: "PASSED", gateB_EngineeringReadiness: "PASSED", gateC_CommercialReadiness: "PASSED", gateD_MarketReadiness: "PASSED", overallGA_Eligible: true },
      unitEconomics: { cacUsd: 200, arpuUsd: 125, grossMarginPct: 83, supportCostUsd: 16, ltvUsd: 3750, ltvToCacRatio: 18.75 },
      demoEnvironmentReady: true,
      designPartnersActiveCount: 6,
      actionRecommendation: "INVEST",
    },
    {
      verticalId: "wholesale",
      displayName: "Wholesale & Distribution Business Management OS",
      tier: "TIER1_FLAGSHIP",
      targetCustomer: "Wholesale Depots, B2B Distributors, Dealer Networks",
      valueProposition: "Complete wholesale order-to-delivery, B2B credit terms, and multi-warehouse stock.",
      primaryPromise: "Wholesale pricing tiers, customer credit limits, van sales dispatch, and delivery tracking.",
      activationEvent: "First B2B sales order dispatch with credit validation",
      keyMetrics: ["order volume", "average order value (AOV)", "DSO / credit collection days", "warehouse picking accuracy"],
      pricingPackages: [
        { packageName: "Wholesale Starter", priceMonthlyUsd: 79, featuresIncluded: ["Single Warehouse", "B2B Customer Credit", "Bulk Pricing Tiers"] },
        { packageName: "Distributor Pro", priceMonthlyUsd: 199, featuresIncluded: ["Multi-Branch Warehouses", "Van Sales App", "Delivery Tracking"] },
        { packageName: "Enterprise Supply Chain", priceMonthlyUsd: 499, featuresIncluded: ["Unlimited Warehouses", "B2B Dealer Portal", "ERP Integration"] },
      ],
      readinessGates: { gateA_ProductReadiness: "PASSED", gateB_EngineeringReadiness: "PASSED", gateC_CommercialReadiness: "PASSED", gateD_MarketReadiness: "PASSED", overallGA_Eligible: true },
      unitEconomics: { cacUsd: 380, arpuUsd: 220, grossMarginPct: 87, supportCostUsd: 25, ltvUsd: 6600, ltvToCacRatio: 17.37 },
      demoEnvironmentReady: true,
      designPartnersActiveCount: 8,
      actionRecommendation: "INVEST",
    },
    {
      verticalId: "construction",
      displayName: "Construction Business & Project Management OS",
      tier: "TIER1_FLAGSHIP",
      targetCustomer: "Building Contractors, Civil Engineers, Site Managers",
      valueProposition: "Project controls, BOQ cost budgeting, site materials, equipment, and progress certification.",
      primaryPromise: "Complete site operations, BOQ tracking, subcontractor valuation, and project margin control.",
      activationEvent: "First BOQ project created with material dispatch",
      keyMetrics: ["active project budget", "BOQ cost variance", "certified progress billing", "equipment utilization"],
      pricingPackages: [
        { packageName: "Contractor Basic", priceMonthlyUsd: 99, featuresIncluded: ["BOQ Import", "Site Stock Requisition", "Basic Cost Tracking"] },
        { packageName: "Project Manager Pro", priceMonthlyUsd: 249, featuresIncluded: ["Subcontractor Valuations", "Equipment Mileage Log", "Certified Progress Billing"] },
        { packageName: "Enterprise Construction", priceMonthlyUsd: 599, featuresIncluded: ["Multi-Site ERP", "Custom Variation Order AI", "Audit Reports"] },
      ],
      readinessGates: { gateA_ProductReadiness: "PASSED", gateB_EngineeringReadiness: "PASSED", gateC_CommercialReadiness: "PASSED", gateD_MarketReadiness: "PASSED", overallGA_Eligible: true },
      unitEconomics: { cacUsd: 450, arpuUsd: 280, grossMarginPct: 88, supportCostUsd: 30, ltvUsd: 8400, ltvToCacRatio: 18.66 },
      demoEnvironmentReady: true,
      designPartnersActiveCount: 6,
      actionRecommendation: "INVEST",
    },
    {
      verticalId: "realestate",
      displayName: "Real Estate & Property Management OS",
      tier: "TIER1_FLAGSHIP",
      targetCustomer: "Property Managers, Landlords, Commercial Estate Agencies",
      valueProposition: "Property portfolio management, tenant leases, automated rent billing, and security deposit accounting.",
      primaryPromise: "Automated rent invoicing, immutable lease addendums, maintenance work orders, and NOI analytics.",
      activationEvent: "First rent collection invoice processed with deposit reconciliation",
      keyMetrics: ["portfolio occupancy %", "rental collection rate", "overdue rent arrears", "Net Operating Income (NOI)"],
      pricingPackages: [
        { packageName: "Landlord Starter", priceMonthlyUsd: 69, featuresIncluded: ["Up to 50 Units", "Automated Rent Invoices", "Tenant Portal"] },
        { packageName: "Property Manager Pro", priceMonthlyUsd: 179, featuresIncluded: ["Up to 300 Units", "Deposit Liability Vault", "Maintenance Work Orders"] },
        { packageName: "Commercial Estate Enterprise", priceMonthlyUsd: 449, featuresIncluded: ["Unlimited Units", "CAM Expense Recovery", "Property NOI Analytics"] },
      ],
      readinessGates: { gateA_ProductReadiness: "PASSED", gateB_EngineeringReadiness: "PASSED", gateC_CommercialReadiness: "PASSED", gateD_MarketReadiness: "PASSED", overallGA_Eligible: true },
      unitEconomics: { cacUsd: 340, arpuUsd: 195, grossMarginPct: 86, supportCostUsd: 22, ltvUsd: 5850, ltvToCacRatio: 17.2 },
      demoEnvironmentReady: true,
      designPartnersActiveCount: 7,
      actionRecommendation: "INVEST",
    },
    {
      verticalId: "barlounge",
      displayName: "Bar, Pub & Lounge Management OS",
      tier: "TIER1_FLAGSHIP",
      targetCustomer: "Bars, Nightclubs, Rooftop Lounges, Hospitality Venues",
      valueProposition: "Fast tab management, cocktail recipe stock deduction, split billing, and shift cash reconciliation.",
      primaryPromise: "Eliminate beverage stock variance and control fast bar tabs and shift float reconciliation.",
      activationEvent: "First bar tab closed with recipe stock ledger deduction",
      keyMetrics: ["beverage revenue", "beverage gross margin %", "spoilage/wastage cost", "shift float variance"],
      pricingPackages: [
        { packageName: "Bar Starter", priceMonthlyUsd: 49, featuresIncluded: ["Fast POS Tab System", "Floor Table Map", "Receipt Printer"] },
        { packageName: "Lounge Pro", priceMonthlyUsd: 119, featuresIncluded: ["Cocktail Recipe BOM", "Split Bill Engine", "Shift Float Reconciler"] },
        { packageName: "Nightclub Enterprise", priceMonthlyUsd: 289, featuresIncluded: ["Multi-Station Bar Sync", "VIP Table Reservations", "Variance Analytics"] },
      ],
      readinessGates: { gateA_ProductReadiness: "PASSED", gateB_EngineeringReadiness: "PASSED", gateC_CommercialReadiness: "PASSED", gateD_MarketReadiness: "PASSED", overallGA_Eligible: true },
      unitEconomics: { cacUsd: 220, arpuUsd: 130, grossMarginPct: 84, supportCostUsd: 16, ltvUsd: 3900, ltvToCacRatio: 17.72 },
      demoEnvironmentReady: true,
      designPartnersActiveCount: 6,
      actionRecommendation: "INVEST",
    },
    {
      verticalId: "telecom",
      displayName: "Telecom & Technical Services Management OS",
      tier: "TIER1_FLAGSHIP",
      targetCustomer: "Telecom Contractors, ISP Operations, Fiber Deployers, Field Service Firms",
      valueProposition: "Cell tower & fiber POP sites, serialized asset tracking, microwave link physics, and customer SAT acceptance.",
      primaryPromise: "Complete field work orders, OTDR test verification, SLA breach prevention, and technical asset management.",
      activationEvent: "First site SAT acceptance record with digital customer signoff",
      keyMetrics: ["site uptime %", "OTDR test pass rate %", "SLA compliance %", "field service gross margin %"],
      pricingPackages: [
        { packageName: "Field Tech Basic", priceMonthlyUsd: 99, featuresIncluded: ["Up to 20 Sites", "Serialized Asset Vault", "Work Orders"] },
        { packageName: "Telecom Ops Pro", priceMonthlyUsd: 249, featuresIncluded: ["Microwave Link Budget Physics", "KML/KMZ Import", "OTDR Test Verifier"] },
        { packageName: "Enterprise Infrastructure", priceMonthlyUsd: 599, featuresIncluded: ["Unlimited Sites", "Digital SAT Customer Signoff", "SLA Breach AI"] },
      ],
      readinessGates: { gateA_ProductReadiness: "PASSED", gateB_EngineeringReadiness: "PASSED", gateC_CommercialReadiness: "PASSED", gateD_MarketReadiness: "PASSED", overallGA_Eligible: true },
      unitEconomics: { cacUsd: 480, arpuUsd: 290, grossMarginPct: 89, supportCostUsd: 32, ltvUsd: 8700, ltvToCacRatio: 18.12 },
      demoEnvironmentReady: true,
      designPartnersActiveCount: 8,
      actionRecommendation: "INVEST",
    },
  ];

  public getCommercialPortfolioSummary(): {
    totalVerticallyManagedCount: number;
    tier1Count: number;
    tier2Count: number;
    tier3Count: number;
    flagshipProfiles: VerticalCommercialProfile[];
    tier2Verticals: string[];
    tier3StatusNote: string;
  } {
    const tier2List = [
      "Garage & Auto Service",
      "Workforce Tracking & Time Management",
    ];

    return {
      totalVerticallyManagedCount: this.flagshipProfiles.length + tier2List.length + 4,
      tier1Count: this.flagshipProfiles.length,
      tier2Count: tier2List.length,
      tier3Count: 4,
      flagshipProfiles: this.flagshipProfiles,
      tier2Verticals: tier2List,
      tier3StatusNote: "Specialized Ecosystem Verticals remain technically maintained and promoted based on empirical market demand evidence.",
    };
  }


  public evaluateVerticalPriorityScore(input: PortfolioPriorityScoreInput): PortfolioPriorityScoreOutput {
    return globalCommercialGovernanceEngine.calculatePortfolioPriorityScore(input);
  }

  public getVerticalReadinessGates(verticalId: string): CommercialReadinessGates {
    const profile = this.flagshipProfiles.find((p) => p.verticalId.toLowerCase() === verticalId.toLowerCase());
    if (profile) return profile.readinessGates;
    return globalCommercialGovernanceEngine.evaluateReadinessGates(true, true, false, false);
  }

  public getVerticalPackageDetails(verticalId: string): VerticalCommercialProfile | undefined {
    return this.flagshipProfiles.find((p) => p.verticalId.toLowerCase() === verticalId.toLowerCase());
  }

  public generateOnboardingTemplate(verticalId: string): IndustryOnboardingTemplate {
    return globalCommercialGovernanceEngine.generateIndustryOnboardingTemplate(verticalId);
  }
}

export const globalCommercialReadinessService = new CommercialReadinessService();
