/**
 * KwakoPosv2 Module Registry
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for all industry module manifests.
 *
 * Resolution pipeline:
 *   Module Registry → Tenant Entitlement → Subscription → Feature Flag → RBAC
 *   → Module Availability → Navigation → Route → Workspace
 *
 * RULES:
 *  - Dexie is NEVER the authority for entitlement/auth decisions.
 *  - Unknown modules default to NOT authorized (fail-closed).
 *  - Modules register here; they do not hard-code themselves into the shell.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type IndustryModule =
  | "Retail"
  | "Restaurant"
  | "SACCO"
  | "Workforce"
  | "Telecom"
  | "Pharmacy"
  | "Hardware"
  | "Construction"
  | "Law"
  | "RealEstate"
  | "Microfinance"
  | "Agriculture"
  | "Electronics"
  | "Garage"
  | "FuelStation"
  | "School"
  | "Bookshop"
  | "Security"
  | "Water"
  | "Transport"
  | "FleetManagement"
  | "Waste"
  | "Wholesale"
  | "Fashion"
  | "Service"
  | "Cosmetics"
  | "Salon"
  | "Hotel"
  | "Poultry"
  | "Bar"
  | "BusinessConsultant"
  | "TechnicalCompany";

export type ModuleSector =
  | "Retail & Commerce"
  | "Food & Hospitality"
  | "Finance & Lending"
  | "Healthcare"
  | "Professional Services"
  | "Agriculture & Livestock"
  | "Industry & Technology"
  | "Education & Community"
  | "Transport & Logistics"
  | "Enterprise & Workforce";

export interface NestedSidebarItem {
  name: string;
  subItems?: string[];
}

export type SidebarItem = string | NestedSidebarItem;

export interface ModuleManifest {
  name: string;
  icon: string;
  sector: ModuleSector;
  sidebar: SidebarItem[];
  bottomNav: Array<{ label: string; tab: string; icon: string }>;
  widgets: string[];
  description: string;
  /** Permission key required in V2 RBAC to access this module. */
  requiredPermission?: string;
  /** Whether this module is available to all tenants by default or requires subscription. */
  requiresSubscription?: boolean;
  /** Version tag shown in the module selector UI */
  version?: string;
}

// ─── Sector Metadata ────────────────────────────────────────────────────────

export const MODULE_SECTORS: Record<ModuleSector, { icon: string; color: string }> = {
  "Retail & Commerce": { icon: "ShoppingBag", color: "#3b82f6" },
  "Food & Hospitality": { icon: "Utensils", color: "#f59e0b" },
  "Finance & Lending": { icon: "Coins", color: "#10b981" },
  "Healthcare": { icon: "Activity", color: "#ef4444" },
  "Professional Services": { icon: "Briefcase", color: "#8b5cf6" },
  "Agriculture & Livestock": { icon: "Sprout", color: "#22c55e" },
  "Industry & Technology": { icon: "Cpu", color: "#06b6d4" },
  "Education & Community": { icon: "GraduationCap", color: "#f97316" },
  "Transport & Logistics": { icon: "Truck", color: "#64748b" },
  "Enterprise & Workforce": { icon: "Users", color: "#6366f1" },
};

// ─── Module Manifests ────────────────────────────────────────────────────────

export const MODULE_MANIFESTS: Record<IndustryModule, ModuleManifest> = {

  Retail: {
    name: "Retail Shop / General Store",
    icon: "Store",
    sector: "Retail & Commerce",
    sidebar: [
      "Dashboard",
      { name: "POS", subItems: ["New Sale", "Sales History", "Returns"] },
      { name: "Cash Drawer", subItems: ["Shift & Active Register", "Cash Movement Ledger", "Reconciliation & Variances", "Safe & Bank Deposits", "No Sale & Event Logs", "15 Financial Reports", "Security & RBAC Rules", "AI Cash Advisor"] },
      { name: "Inventory", subItems: ["Inventory Overview", "Products", "Categories & Brands", "Stock Adjustment", "Stock Transfer", "Stock Alerts", "Stock Sync Engine", "Product Bundles & Kits", "Stock Count", "Ledger Drilldown", "Inventory Reports"] },
      { name: "Receipts", subItems: ["Receipt History", "Receipt Viewer", "Receipt Templates", "Receipt Analytics", "Receipt Verification", "Receipt Archive"] },
      "Customers",
      { name: "Purchasing", subItems: ["Suppliers", "Purchase Orders", "Goods Received", "Supplier Ledgers", "Warehouses"] },
      "Expenses",
      { name: "Reports", subItems: ["Sales", "Profit", "Inventory Valuation", "Tax", "Customers Report", "Expenses Report", "Payment Methods", "Stock Movement", "Purchasing Report", "Discounts", "Returns & Refunds", "Branch Comparison", "Cashier Performance", "Receivables Aging"] },
      "Employees",
      { name: "AI Insights Engine", subItems: ["Business Health Score", "Sales Intelligence", "Inventory Intelligence", "Profit & Pricing", "Customer CLV", "Cash Flow & Burn", "Fraud & Security", "Branch Comparison", "Demand Forecast"] },
      { name: "Settings", subItems: ["Business Profile & Identity", "POS Configurations", "Inventory Rules", "Tax & Billing", "Security Policies", "Terminals & Sessions", "Trash Can & Recovery", "Subscriptions & Billing", "Developer Options", "Help & Manuals", "Change Log"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Dashboard", icon: "LayoutDashboard" },
      { label: "POS", tab: "POS", icon: "ScanBarcode" },
      { label: "Stock", tab: "Inventory", icon: "Boxes" },
      { label: "CRM", tab: "Customers", icon: "ContactRound" },
      { label: "Reports", tab: "Reports", icon: "BarChart3" },
    ],
    widgets: ["SalesToday", "ProfitToday", "InventoryValue", "LowStock"],
    description: "Retail inventory count, sales, receipts, and client reward points.",
    version: "v2.5",
  },

  Restaurant: {
    name: "Restaurant / Cafe",
    icon: "Utensils",
    sector: "Food & Hospitality",
    sidebar: [
      "Dashboard",
      "POS",
      "Tables",
      "Kitchen Display",
      { name: "Orders", subItems: ["Open Orders", "Completed Orders", "Cancelled Orders"] },
      { name: "Menu Management", subItems: ["Food Items", "Categories", "Recipes"] },
      { name: "Receipts", subItems: ["Receipt History", "Receipt Templates", "Receipt Analytics", "Receipt Verification", "Receipt Archive"] },
      "Inventory",
      "Ingredients",
      "Suppliers",
      "Reservations",
      "Employees",
      "Reports",
      { name: "Settings", subItems: ["General Settings", "Users & Roles"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Dashboard", icon: "Home" },
      { label: "POS", tab: "POS", icon: "ShoppingCart" },
      { label: "Tables", tab: "Tables", icon: "Layers" },
      { label: "Kitchen", tab: "Kitchen Display", icon: "ChefHat" },
      { label: "Orders", tab: "Orders", icon: "ClipboardList" },
    ],
    widgets: ["SalesToday", "OpenTables", "PendingOrders", "KitchenStatus"],
    description: "Table dining coordinates, kitchen ticket flows, and recipe costs.",
    version: "v2.5",
  },

  SACCO: {
    name: "SACCO / VICOBA",
    icon: "Coins",
    sector: "Finance & Lending",
    sidebar: [
      "Dashboard",
      "Members",
      "Groups",
      { name: "Savings", subItems: ["Deposits", "Withdrawals", "Statements"] },
      { name: "Loans", subItems: ["Loan Applications", "Approval", "Repayments", "Loan Reports"] },
      "Shares",
      "Meetings",
      "Fines",
      "Reports",
      { name: "Settings", subItems: ["General Settings", "Users & Roles"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Dashboard", icon: "Home" },
      { label: "Members", tab: "Members", icon: "Users" },
      { label: "Savings", tab: "Savings", icon: "PiggyBank" },
      { label: "Loans", tab: "Loans", icon: "Banknote" },
      { label: "Reports", tab: "Reports", icon: "BarChart2" },
    ],
    widgets: ["TotalSavings", "LoanDisbursements", "OutstandingRepayments", "MembersJoined"],
    description: "Cooperative member capital, savings programs, and lending terms.",
    requiresSubscription: true,
    version: "v2.5",
  },

  Workforce: {
    name: "Workforce Tracking & Time Management",
    icon: "Users",
    sector: "Enterprise & Workforce",
    sidebar: [
      "Dashboard",
      "Clock In / Out",
      "Employees",
      "Live Workforce",
      "Shifts & Rosters",
      "Timesheets",
      "Overtime",
      "Leave Management",
      "Tasks",
      "Field Workforce",
      "Geofences",
      "Payroll Prep",
      "Reports",
      { name: "Settings", subItems: ["General Settings", "Users & Roles"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Dashboard", icon: "Home" },
      { label: "Clock", tab: "Clock In / Out", icon: "Clock" },
      { label: "Staff", tab: "Employees", icon: "Users" },
      { label: "Live", tab: "Live Workforce", icon: "Radio" },
      { label: "Payroll", tab: "Payroll Prep", icon: "Banknote" },
    ],
    widgets: ["PresentToday", "LateArrivals", "OnLeave", "ActiveFieldVisits", "TotalHoursWorked", "OvertimeHours", "PendingApprovals"],
    description: "Attendance clocking, overnight shifts, GPS geofencing, multi-tier leave approval, timesheets, and payroll preparation.",
    requiresSubscription: true,
    version: "v2.5",
  },

  Telecom: {
    name: "Telecom Installations: RAN & Microwave",
    icon: "Radio",
    sector: "Industry & Technology",
    sidebar: [
      "Dashboard",
      "GIS & Planning",
      "Telecom Sites",
      "Telecom Projects",
      "RAN Installations",
      "Microwave Links",
      "Work Orders",
      "Telecom Assets",
      "Checklists",
      "Defects & Snags",
      "Site Acceptance",
      "Reports",
      { name: "Settings", subItems: ["General Settings", "Users & Roles"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Dashboard", icon: "Home" },
      { label: "Sites", tab: "Telecom Sites", icon: "MapPin" },
      { label: "Projects", tab: "Telecom Projects", icon: "FolderOpen" },
      { label: "Work", tab: "Work Orders", icon: "ClipboardList" },
      { label: "Reports", tab: "Reports", icon: "BarChart2" },
    ],
    widgets: ["TotalSites", "ActiveRollouts", "AlignedLinks", "OpenWorkOrders", "ActiveDefects", "SLAComplianceRate"],
    description: "RAN 2G/3G/4G/5G rollouts, microwave transmission backhaul, cell tower readiness, VSWR sweep tests, and site acceptance.",
    requiresSubscription: true,
    version: "v2.5",
  },

  Pharmacy: {
    name: "Pharmacy / Chemist / Dispensary",
    icon: "Pill",
    sector: "Healthcare",
    sidebar: [
      "Pharmacy Dashboard",
      "Pharmacy POS",
      "Patients",
      { name: "Medicines", subItems: ["Medicines Master", "Medicine Categories", "Price Lists", "Barcode & Labels"] },
      { name: "Batch & Expiry", subItems: ["Batch Management", "Expiry Tracking", "Near Expiry", "Batch Recalls", "Expired Disposal"] },
      "Prescriptions",
      "Doctors",
      "Drug Safety",
      { name: "Pharmacy Inventory", subItems: ["Stock Overview", "Stock Transfer", "Stock Count", "Dead Stock", "Auto-Reorder"] },
      { name: "Receipts", subItems: ["Receipt History", "Receipt Templates", "Receipt Analytics", "Receipt Verification", "Receipt Archive"] },
      { name: "Purchasing", subItems: ["Suppliers", "Purchase Orders", "Goods Received", "Supplier Ledgers", "Warehouses"] },
      { name: "Insurance & NHIF", subItems: ["Insurance Providers", "Claims Management", "NHIF Claims", "Corporate Accounts", "Claim Reports"] },
      "Controlled Drugs",
      { name: "Pharmacy Reports", subItems: ["Sales Report", "Prescription Report", "Expiry Report", "Batch History", "Insurance Claims Report", "Controlled Drugs Report", "Supplier Performance", "Patient History Report"] },
      { name: "Settings", subItems: ["General Settings", "Users & Roles"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Pharmacy Dashboard", icon: "Home" },
      { label: "POS", tab: "Pharmacy POS", icon: "ShoppingCart" },
      { label: "Patients", tab: "Patients", icon: "UserHeart" },
      { label: "Rx", tab: "Prescriptions", icon: "ClipboardList" },
      { label: "Stock", tab: "Pharmacy Inventory", icon: "Package" },
    ],
    widgets: ["SalesToday", "PrescriptionsPending", "ExpiryAlerts", "LowStock", "NHIFClaims", "OTCSales"],
    description: "Full-stack pharmacy management: prescriptions, batch/expiry FEFO, patient CRM, drug safety engine, NHIF/insurance billing, and controlled drug register.",
    requiresSubscription: true,
    version: "v2.5",
  },

  Hardware: {
    name: "Hardware & Building Materials",
    icon: "Hammer",
    sector: "Retail & Commerce",
    sidebar: [
      "Dashboard",
      "POS",
      "Products",
      "Inventory",
      "Categories",
      { name: "Measurement Units", subItems: ["Pieces", "Bags", "Meters", "Tons"] },
      { name: "Receipts", subItems: ["Receipt History", "Receipt Templates", "Receipt Analytics", "Receipt Verification", "Receipt Archive"] },
      { name: "Purchasing", subItems: ["Suppliers", "Purchase Orders", "Goods Received", "Supplier Ledgers", "Warehouses"] },
      "Customers",
      "Quotations",
      "Reports",
      { name: "Settings", subItems: ["General Settings", "Users & Roles"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Dashboard", icon: "Home" },
      { label: "POS", tab: "POS", icon: "ShoppingCart" },
      { label: "Stock", tab: "Inventory", icon: "Package" },
      { label: "Quotes", tab: "Quotations", icon: "FileText" },
      { label: "Reports", tab: "Reports", icon: "BarChart2" },
    ],
    widgets: ["SalesToday", "QuotationsPending", "InventoryValue", "LowStock"],
    description: "Bulk material measurements, custom quotes, and supplier invoices.",
    version: "v2.5",
  },

  Construction: {
    name: "Construction Company",
    icon: "HardHat",
    sector: "Industry & Technology",
    sidebar: [
      "Dashboard",
      "Projects",
      "Sites",
      "Employees",
      "Equipment",
      "Materials",
      "Expenses",
      "Invoices",
      "Contracts",
      "Clients",
      "Reports",
      { name: "Settings", subItems: ["General Settings", "Users & Roles"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Dashboard", icon: "Home" },
      { label: "Projects", tab: "Projects", icon: "FolderOpen" },
      { label: "Sites", tab: "Sites", icon: "MapPin" },
      { label: "Equipment", tab: "Equipment", icon: "Truck" },
      { label: "Reports", tab: "Reports", icon: "BarChart2" },
    ],
    widgets: ["ActiveProjects", "SiteExpenses", "EquipmentUtilization", "InvoiceCollections"],
    description: "Project sheets, machinery utilization logs, and site materials.",
    requiresSubscription: true,
    version: "v2.5",
  },

  Law: {
    name: "Law Firm / Legal Practice",
    icon: "Scale",
    sector: "Professional Services",
    sidebar: [
      "Legal Dashboard",
      "Clients",
      "Cases",
      "Court Calendar",
      "Legal Documents",
      "Legal Tasks",
      "Billing & Retainers",
      "Legal Reports",
      { name: "Legal Settings", subItems: ["General Settings", "Users & Roles"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Legal Dashboard", icon: "Home" },
      { label: "Cases", tab: "Cases", icon: "Briefcase" },
      { label: "Clients", tab: "Clients", icon: "Users" },
      { label: "Calendar", tab: "Court Calendar", icon: "Calendar" },
      { label: "Billing", tab: "Billing & Retainers", icon: "DollarSign" },
    ],
    widgets: ["ActiveCases", "NewClients", "UpcomingHearings", "OverdueDeadlines", "PendingTasks", "OutstandingLegalFees", "RetainerBalances", "RecentCaseActivity"],
    description: "Multi-tenant legal practice management platform for law firms, advocates, legal consultants, and lawyers.",
    requiresSubscription: true,
    version: "v2.5",
  },

  RealEstate: {
    name: "Real Estate / Property Management",
    icon: "Home",
    sector: "Professional Services",
    sidebar: [
      "Dashboard",
      "Properties",
      "Units",
      "Tenants",
      "Rent Collection",
      "Maintenance",
      "Contracts",
      "Expenses",
      "Payments",
      "Reports",
      { name: "Settings", subItems: ["General Settings", "Users & Roles"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Dashboard", icon: "Home" },
      { label: "Properties", tab: "Properties", icon: "Building" },
      { label: "Tenants", tab: "Tenants", icon: "Users" },
      { label: "Rent", tab: "Rent Collection", icon: "Banknote" },
      { label: "Reports", tab: "Reports", icon: "BarChart2" },
    ],
    widgets: ["TotalOccupancyRate", "RentCollected", "PendingMaintenance", "OperatingExpenses"],
    description: "Apartment listings, tenant rent collections, and work orders.",
    requiresSubscription: true,
    version: "v2.5",
  },

  Microfinance: {
    name: "Microfinance & Lending",
    icon: "TrendingUp",
    sector: "Finance & Lending",
    sidebar: [
      "Dashboard",
      "Customers",
      "Loans",
      "Loan Applications",
      "Approval",
      "Repayments",
      "Interest Calculator",
      "Collections",
      "Reports",
      { name: "Settings", subItems: ["General Settings", "Users & Roles"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Dashboard", icon: "Home" },
      { label: "Loans", tab: "Loans", icon: "Banknote" },
      { label: "Applications", tab: "Loan Applications", icon: "FileText" },
      { label: "Repayments", tab: "Repayments", icon: "RefreshCw" },
      { label: "Reports", tab: "Reports", icon: "BarChart2" },
    ],
    widgets: ["LoanBookValue", "RepaymentsRate", "DisbursalsToday", "ParRatio"],
    description: "Lending risk audits, interest calculations, and collections.",
    requiresSubscription: true,
    version: "v2.5",
  },

  Agriculture: {
    name: "Agriculture / Farm Business",
    icon: "Sprout",
    sector: "Agriculture & Livestock",
    sidebar: [
      "Dashboard",
      "Farms",
      "Crops",
      "Livestock",
      "Inventory",
      "Seeds",
      "Fertilizer",
      "Harvest",
      "Expenses",
      "Workers",
      "Reports",
      { name: "Settings", subItems: ["General Settings", "Users & Roles"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Dashboard", icon: "Home" },
      { label: "Farms", tab: "Farms", icon: "MapPin" },
      { label: "Crops", tab: "Crops", icon: "Sprout" },
      { label: "Harvest", tab: "Harvest", icon: "Package" },
      { label: "Reports", tab: "Reports", icon: "BarChart2" },
    ],
    widgets: ["HarvestYield", "LivestockCount", "FertilizerStock", "FarmOperatingExpenses"],
    description: "Crop yields tracking, feed inventories, and workforce hours.",
    requiresSubscription: true,
    version: "v2.5",
  },

  Electronics: {
    name: "Electronics Store",
    icon: "Tv",
    sector: "Retail & Commerce",
    sidebar: [
      "Dashboard",
      "POS",
      "Products",
      "Serial Numbers",
      "Warranty",
      "Inventory",
      { name: "Receipts", subItems: ["Receipt History", "Receipt Templates", "Receipt Analytics", "Receipt Verification", "Receipt Archive"] },
      "Repairs",
      { name: "Purchasing", subItems: ["Suppliers", "Purchase Orders", "Goods Received", "Supplier Ledgers", "Warehouses"] },
      "Customers",
      "Reports",
      { name: "Settings", subItems: ["General Settings", "Users & Roles"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Dashboard", icon: "Home" },
      { label: "POS", tab: "POS", icon: "ShoppingCart" },
      { label: "Serials", tab: "Serial Numbers", icon: "Hash" },
      { label: "Repairs", tab: "Repairs", icon: "Wrench" },
      { label: "Reports", tab: "Reports", icon: "BarChart2" },
    ],
    widgets: ["SalesToday", "SerialAudited", "RepairsCompleted", "WarrantyClaims"],
    description: "Warranty logs, repair status trackers, and serial barcodes.",
    version: "v2.5",
  },

  Garage: {
    name: "Garage / Vehicle Workshop",
    icon: "Wrench",
    sector: "Industry & Technology",
    sidebar: [
      "Dashboard",
      "Vehicles",
      "Customers",
      "Repair Orders",
      "Mechanics",
      "Parts Inventory",
      "Service History",
      "Invoices",
      "Reports",
      { name: "Settings", subItems: ["General Settings", "Users & Roles"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Dashboard", icon: "Home" },
      { label: "Vehicles", tab: "Vehicles", icon: "Car" },
      { label: "Repairs", tab: "Repair Orders", icon: "Wrench" },
      { label: "Parts", tab: "Parts Inventory", icon: "Package" },
      { label: "Reports", tab: "Reports", icon: "BarChart2" },
    ],
    widgets: ["ActiveRepairOrders", "MechanicLoad", "ServiceRevenues", "PartsUsed"],
    description: "Vehicle diagnostics logs, mechanic assignments, and repair invoicing.",
    version: "v2.5",
  },

  FuelStation: {
    name: "Fuel Station",
    icon: "Fuel",
    sector: "Retail & Commerce",
    sidebar: [
      "Dashboard",
      "Fuel Pump",
      "Fuel Inventory",
      "Tank Monitoring",
      "Price Management",
      "Sales",
      "Attendants",
      "Shift Management",
      "Expenses",
      "Reports",
      { name: "Settings", subItems: ["General Settings", "Users & Roles"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Dashboard", icon: "Home" },
      { label: "Pumps", tab: "Fuel Pump", icon: "Fuel" },
      { label: "Tanks", tab: "Tank Monitoring", icon: "Gauge" },
      { label: "Sales", tab: "Sales", icon: "ShoppingCart" },
      { label: "Reports", tab: "Reports", icon: "BarChart2" },
    ],
    widgets: ["SalesToday", "TankLitresRemaining", "PricePerLitre", "ShiftProfit"],
    description: "Pump volume readings, digital tank monitors, and price sets.",
    version: "v2.5",
  },

  School: {
    name: "School Management Lite",
    icon: "GraduationCap",
    sector: "Education & Community",
    sidebar: [
      "Dashboard",
      "Students",
      "Classes",
      "Attendance",
      "Fees",
      "Exams",
      "Teachers",
      "Parents",
      "Reports",
      { name: "Settings", subItems: ["General Settings", "Users & Roles"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Dashboard", icon: "Home" },
      { label: "Students", tab: "Students", icon: "Users" },
      { label: "Attendance", tab: "Attendance", icon: "CheckSquare" },
      { label: "Fees", tab: "Fees", icon: "Banknote" },
      { label: "Reports", tab: "Reports", icon: "BarChart2" },
    ],
    widgets: ["EnrolledStudents", "DailyAttendance", "FeesCollectedYTD", "ExamAverages"],
    description: "Student catalogs, classroom attendances, and tuition statements.",
    requiresSubscription: true,
    version: "v2.5",
  },

  Bookshop: {
    name: "Bookshop / Stationery",
    icon: "BookOpen",
    sector: "Retail & Commerce",
    sidebar: [
      "Dashboard",
      "POS",
      "Books",
      "Stationery",
      "Inventory",
      { name: "Receipts", subItems: ["Receipt History", "Receipt Templates", "Receipt Analytics", "Receipt Verification", "Receipt Archive"] },
      { name: "Purchasing", subItems: ["Suppliers", "Purchase Orders", "Goods Received", "Supplier Ledgers", "Warehouses"] },
      "Customers",
      "Reports",
      { name: "Settings", subItems: ["General Settings", "Users & Roles"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Dashboard", icon: "Home" },
      { label: "POS", tab: "POS", icon: "ShoppingCart" },
      { label: "Books", tab: "Books", icon: "BookOpen" },
      { label: "Stock", tab: "Inventory", icon: "Package" },
      { label: "Reports", tab: "Reports", icon: "BarChart2" },
    ],
    widgets: ["SalesToday", "BooksValuation", "SuppliersCount", "LowStock"],
    description: "Book inventories, school stationeries POS, and supplier orders.",
    version: "v2.5",
  },

  Security: {
    name: "Security Company Management",
    icon: "Shield",
    sector: "Enterprise & Workforce",
    sidebar: [
      "Dashboard",
      "Guards",
      "Clients",
      "Sites",
      "Schedules",
      "Attendance",
      "Payroll",
      "Incidents",
      "Reports",
      { name: "Settings", subItems: ["General Settings", "Users & Roles"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Dashboard", icon: "Home" },
      { label: "Guards", tab: "Guards", icon: "Shield" },
      { label: "Sites", tab: "Sites", icon: "MapPin" },
      { label: "Incidents", tab: "Incidents", icon: "AlertTriangle" },
      { label: "Reports", tab: "Reports", icon: "BarChart2" },
    ],
    widgets: ["GuardsDeployed", "PatrolledSites", "ReportedIncidents", "PayrollTotal"],
    description: "Guard rosters, client patrol routes, and incident logs.",
    requiresSubscription: true,
    version: "v2.5",
  },

  Water: {
    name: "Water Supply Management",
    icon: "Droplets",
    sector: "Industry & Technology",
    sidebar: [
      "Dashboard",
      "Customers",
      "Meters",
      "Billing",
      "Payments",
      "Routes",
      "Water Usage",
      "Complaints",
      "Reports",
      { name: "Settings", subItems: ["General Settings", "Users & Roles"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Dashboard", icon: "Home" },
      { label: "Meters", tab: "Meters", icon: "Gauge" },
      { label: "Billing", tab: "Billing", icon: "FileText" },
      { label: "Complaints", tab: "Complaints", icon: "AlertCircle" },
      { label: "Reports", tab: "Reports", icon: "BarChart2" },
    ],
    widgets: ["TotalWaterUsage", "BilledAmount", "OutstandingPayments", "ResolvedComplaints"],
    description: "Water meter consumption, utility billings, and repair routes.",
    requiresSubscription: true,
    version: "v2.5",
  },

  Transport: {
    name: "Vehicle & Fleet Management",
    icon: "Truck",
    sector: "Transport & Logistics",
    sidebar: [
      { name: "Dashboard", subItems: ["Fleet Overview", "Fleet Health", "Alerts & Expiring Documents", "Utilization Overview", "Fuel & Cost Summary"] },
      { name: "Vehicles", subItems: ["All Vehicles", "Add Vehicle", "Vehicle Groups", "Vehicle Types", "Vehicle Documents", "Vehicle Inspection", "Vehicle Status"] },
      { name: "Fleet Operations", subItems: ["Trip Management", "Dispatch", "Assign Vehicle", "Assign Driver", "Trip History", "Route Management", "Mileage / Odometer"] },
      { name: "Drivers", subItems: ["All Drivers", "Add Driver", "Driver Profiles", "Driver Assignments", "Driver Licenses", "Driver Performance", "Driver Incidents"] },
      { name: "Fuel Management", subItems: ["Fuel Dashboard", "Fuel Transactions", "Fuel Stations / Suppliers", "Fuel Consumption", "Fuel Efficiency", "Fuel Cost Analysis"] },
      { name: "Maintenance", subItems: ["Maintenance Dashboard", "Maintenance Schedule", "Service Records", "Repair Orders", "Preventive Maintenance", "Parts & Materials", "Maintenance Costs", "Workshop"] },
      { name: "Expenses", subItems: ["Fleet Expenses", "Vehicle Expenses", "Driver Expenses", "Tolls & Parking", "Insurance Costs", "Registration Costs", "Other Expenses"] },
      { name: "Compliance", subItems: ["Vehicle Registration", "Insurance", "Road License", "Inspection Certificates", "Driver Licenses", "Compliance Calendar", "Expiring Documents"] },
      { name: "Incidents", subItems: ["Accidents", "Traffic Violations", "Damage Reports", "Claims", "Incident History"] },
      { name: "Tracking", subItems: ["Live Fleet Tracking", "Vehicle Location", "Trip Tracking", "Geofencing", "Mileage Tracking", "GPS History"] },
      { name: "Reports", subItems: ["Fleet Report", "Vehicle Utilization", "Fuel Consumption", "Fuel Cost", "Maintenance", "Vehicle Profitability", "Driver Performance", "Trip Report", "Expense Report", "Compliance Report", "Cost per Kilometer"] },
      { name: "Settings", subItems: ["Fleet Settings", "Vehicle Types", "Fuel Types", "Maintenance Categories", "Expense Categories", "Document Types", "Trip Settings", "Tracking Settings", "Users & Roles"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Dashboard", icon: "Home" },
      { label: "Vehicles", tab: "Vehicles", icon: "Truck" },
      { label: "Trips", tab: "Fleet Operations", icon: "Map" },
      { label: "Fuel", tab: "Fuel Management", icon: "Fuel" },
      { label: "Track", tab: "Tracking", icon: "MapPin" },
    ],
    widgets: ["TotalVehicles", "ActiveTrips", "FuelEfficiency", "MaintenanceAlerts", "FleetProfitability"],
    description: "Complete vehicle lifecycle, driver management, dispatch, fuel anomalies, maintenance stock integration, telematics, and profitability analytics.",
    requiresSubscription: true,
    version: "v2.5",
  },

  FleetManagement: {
    name: "Vehicle & Fleet Management (Full)",
    icon: "Truck",
    sector: "Transport & Logistics",
    sidebar: [
      { name: "Dashboard", subItems: ["Fleet Overview", "Fleet Health", "Alerts & Expiring Documents", "Utilization Overview", "Fuel & Cost Summary"] },
      { name: "Vehicles", subItems: ["All Vehicles", "Add Vehicle", "Vehicle Groups", "Vehicle Types", "Vehicle Documents", "Vehicle Inspection", "Vehicle Status"] },
      { name: "Fleet Operations", subItems: ["Trip Management", "Dispatch", "Assign Vehicle", "Assign Driver", "Trip History", "Route Management", "Mileage / Odometer"] },
      { name: "Drivers", subItems: ["All Drivers", "Add Driver", "Driver Profiles", "Driver Assignments", "Driver Licenses", "Driver Performance", "Driver Incidents"] },
      { name: "Fuel Management", subItems: ["Fuel Dashboard", "Fuel Transactions", "Fuel Stations / Suppliers", "Fuel Consumption", "Fuel Efficiency", "Fuel Cost Analysis"] },
      { name: "Maintenance", subItems: ["Maintenance Dashboard", "Maintenance Schedule", "Service Records", "Repair Orders", "Preventive Maintenance", "Parts & Materials", "Maintenance Costs", "Workshop"] },
      { name: "Compliance", subItems: ["Vehicle Registration", "Insurance", "Road License", "Inspection Certificates", "Driver Licenses", "Compliance Calendar", "Expiring Documents"] },
      { name: "Incidents", subItems: ["Accidents", "Traffic Violations", "Damage Reports", "Claims", "Incident History"] },
      { name: "Tracking", subItems: ["Live Fleet Tracking", "Vehicle Location", "Trip Tracking", "Geofencing", "GPS History"] },
      { name: "Reports", subItems: ["Fleet Report", "Vehicle Utilization", "Fuel Consumption", "Maintenance", "Vehicle Profitability", "Driver Performance", "Compliance Report", "Cost per Kilometer"] },
      { name: "Settings", subItems: ["Fleet Settings", "Vehicle Types", "Fuel Types", "Maintenance Categories", "Expense Categories", "Document Types", "Users & Roles"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Dashboard", icon: "Home" },
      { label: "Vehicles", tab: "Vehicles", icon: "Truck" },
      { label: "Trips", tab: "Fleet Operations", icon: "Map" },
      { label: "Fuel", tab: "Fuel Management", icon: "Fuel" },
      { label: "Track", tab: "Tracking", icon: "MapPin" },
    ],
    widgets: ["TotalVehicles", "ActiveTrips", "FuelEfficiency", "MaintenanceAlerts", "FleetProfitability"],
    description: "Complete vehicle lifecycle, driver management, dispatch, fuel anomalies, maintenance, telematics, and profitability analytics.",
    requiresSubscription: true,
    version: "v2.5",
  },

  Waste: {
    name: "Waste Management",
    icon: "Trash2",
    sector: "Industry & Technology",
    sidebar: [
      "Dashboard",
      "Customers",
      "Collection Routes",
      "Vehicles",
      "Workers",
      "Invoices",
      "Payments",
      "Reports",
      { name: "Settings", subItems: ["General Settings", "Users & Roles"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Dashboard", icon: "Home" },
      { label: "Routes", tab: "Collection Routes", icon: "Map" },
      { label: "Vehicles", tab: "Vehicles", icon: "Truck" },
      { label: "Invoices", tab: "Invoices", icon: "FileText" },
      { label: "Reports", tab: "Reports", icon: "BarChart2" },
    ],
    widgets: ["SubscribedCustomers", "ActiveRoutes", "CollectionTonnage", "InvoicedBalances"],
    description: "Garbage disposal routes, customer invoice billings, and work shifts.",
    requiresSubscription: true,
    version: "v2.5",
  },

  Wholesale: {
    name: "Wholesale Business",
    icon: "Boxes",
    sector: "Retail & Commerce",
    sidebar: [
      "Dashboard",
      "POS",
      "Bulk Orders",
      "Inventory",
      "Warehouses",
      { name: "Receipts", subItems: ["Receipt History", "Receipt Templates", "Receipt Analytics", "Receipt Verification", "Receipt Archive"] },
      "Customers",
      "Suppliers",
      "Pricing",
      "Credit Sales",
      "Reports",
      { name: "Settings", subItems: ["General Settings", "Users & Roles"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Dashboard", icon: "Home" },
      { label: "POS", tab: "POS", icon: "ShoppingCart" },
      { label: "Bulk", tab: "Bulk Orders", icon: "Boxes" },
      { label: "Stock", tab: "Inventory", icon: "Package" },
      { label: "Credit", tab: "Credit Sales", icon: "CreditCard" },
    ],
    widgets: ["SalesToday", "BulkOrderBacklog", "WarehouseInventoryValue", "CreditSalesOutstanding"],
    description: "Bulk product pricing, warehouse splits, and credit lines.",
    version: "v2.5",
  },

  Fashion: {
    name: "Fashion / Clothing Store",
    icon: "Shirt",
    sector: "Retail & Commerce",
    sidebar: [
      "Dashboard",
      "POS",
      "Products",
      "Sizes",
      "Colors",
      "Variants",
      "Inventory",
      { name: "Receipts", subItems: ["Receipt History", "Receipt Templates", "Receipt Analytics", "Receipt Verification", "Receipt Archive"] },
      "Customers",
      "Suppliers",
      "Promotions",
      "Reports",
      { name: "Settings", subItems: ["General Settings", "Users & Roles"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Dashboard", icon: "Home" },
      { label: "POS", tab: "POS", icon: "ShoppingCart" },
      { label: "Products", tab: "Products", icon: "Shirt" },
      { label: "Promos", tab: "Promotions", icon: "Tag" },
      { label: "Reports", tab: "Reports", icon: "BarChart2" },
    ],
    widgets: ["SalesToday", "VariantsStocked", "PromotionsApplied", "CustomersCount"],
    description: "Clothing size/color variants matrices and promotional codes.",
    version: "v2.5",
  },

  Service: {
    name: "Service Business",
    icon: "Briefcase",
    sector: "Professional Services",
    sidebar: [
      "Dashboard",
      "Services",
      "Appointments",
      "Customers",
      "Staff",
      "Invoices",
      "Payments",
      "Expenses",
      "Reports",
      { name: "Settings", subItems: ["General Settings", "Users & Roles"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Dashboard", icon: "Home" },
      { label: "Bookings", tab: "Appointments", icon: "Calendar" },
      { label: "Customers", tab: "Customers", icon: "Users" },
      { label: "Invoices", tab: "Invoices", icon: "FileText" },
      { label: "Reports", tab: "Reports", icon: "BarChart2" },
    ],
    widgets: ["BookedAppointments", "ServiceSales", "StaffHours", "ClientRetentionRate"],
    description: "Appointment schedules, staff timesheets, and service invoicing.",
    version: "v2.5",
  },

  Cosmetics: {
    name: "Beauty & Cosmetics Shop",
    icon: "Sparkles",
    sector: "Retail & Commerce",
    sidebar: [
      "Dashboard",
      "POS",
      "Products",
      "Inventory",
      "Customers",
      { name: "Receipts", subItems: ["Receipt History", "Receipt Templates", "Receipt Analytics", "Receipt Verification", "Receipt Archive"] },
      "Suppliers",
      "Promotions",
      "Sales",
      "Reports",
      { name: "Settings", subItems: ["General Settings", "Users & Roles"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Dashboard", icon: "Home" },
      { label: "POS", tab: "POS", icon: "ShoppingCart" },
      { label: "Products", tab: "Products", icon: "Package" },
      { label: "Promos", tab: "Promotions", icon: "Tag" },
      { label: "Reports", tab: "Reports", icon: "BarChart2" },
    ],
    widgets: ["SalesToday", "InventoryValue", "CustomersLoyalty", "PromotionsCount"],
    description: "Cosmetics POS sales, batch stock tracker, and rewards.",
    version: "v2.5",
  },

  Salon: {
    name: "Salon & Barber Shop",
    icon: "Scissors",
    sector: "Professional Services",
    sidebar: [
      "Dashboard",
      "Appointments",
      "Customers",
      "Services",
      "Staff",
      "POS",
      { name: "Receipts", subItems: ["Receipt History", "Receipt Templates", "Receipt Analytics", "Receipt Verification", "Receipt Archive"] },
      "Commission",
      "Inventory",
      "Reports",
      { name: "Settings", subItems: ["General Settings", "Users & Roles"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Dashboard", icon: "Home" },
      { label: "Bookings", tab: "Appointments", icon: "Calendar" },
      { label: "POS", tab: "POS", icon: "ShoppingCart" },
      { label: "Staff", tab: "Staff", icon: "Users" },
      { label: "Reports", tab: "Reports", icon: "BarChart2" },
    ],
    widgets: ["DailyAppointments", "POSSalesToday", "StaffCommissionEarned", "RepeatClients"],
    description: "Stylists schedules, checkout POS, and commission payouts.",
    version: "v2.5",
  },

  Hotel: {
    name: "Guest House / Hotel",
    icon: "BedDouble",
    sector: "Food & Hospitality",
    sidebar: [
      "Dashboard",
      "Rooms",
      "Reservations",
      "Guests",
      "Check In",
      "Check Out",
      "Housekeeping",
      "Restaurant",
      "Payments",
      "Reports",
      { name: "Settings", subItems: ["General Settings", "Users & Roles"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Dashboard", icon: "Home" },
      { label: "Rooms", tab: "Rooms", icon: "BedDouble" },
      { label: "Guests", tab: "Guests", icon: "Users" },
      { label: "Check-In", tab: "Check In", icon: "LogIn" },
      { label: "Reports", tab: "Reports", icon: "BarChart2" },
    ],
    widgets: ["OccupiedRooms", "PendingReservations", "HousekeepingQueues", "DailyHotelRevenue"],
    description: "Room guest reservations, check-ins, and housekeeping schedules.",
    requiresSubscription: true,
    version: "v2.5",
  },

  Poultry: {
    name: "Poultry & Livestock Management",
    icon: "Egg",
    sector: "Agriculture & Livestock",
    sidebar: [
      "Poultry Dashboard",
      "Farm Management",
      { name: "Poultry Flocks", subItems: ["Batch Management", "Flock Timeline", "Mortality & Culling", "FCR Analytics"] },
      { name: "Livestock Registry", subItems: ["Animal Register", "Tagging & QR", "Genealogy Tree", "Weight ADG Curves"] },
      { name: "Feed & Water", subItems: ["Feed Inventory", "Recipe Formulation", "Water Meter Logs", "Feed Cost Analysis"] },
      { name: "Health & Veterinary", subItems: ["Vaccination Schedule", "Disease Diagnosis", "Vet Portal", "Quarantine Records"] },
      { name: "Breeding & Hatchery", subItems: ["Mating & AI", "Pregnancy Check", "Incubator Settings", "Hatch Cycles"] },
      { name: "Production Ledger", subItems: ["Daily Egg Collection", "Milk Sessions", "Weight Gain Logs", "Production Trends"] },
      "Farm Tasks",
      { name: "Sales & Checkout", subItems: ["Livestock POS", "Live Animal Sales", "Egg & Milk Invoices", "Fertilizer Sales"] },
      { name: "Purchasing", subItems: ["Feed Suppliers", "Purchase Orders", "Goods Received", "Supplier Ledgers"] },
      { name: "Reports", subItems: ["Production Report", "Mortality Report", "FCR Efficiency", "Cost per Unit", "Farm Profit & Loss"] },
      { name: "Poultry Settings", subItems: ["Farm Setup", "Users & Roles"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Poultry Dashboard", icon: "Home" },
      { label: "Flocks", tab: "Poultry Flocks", icon: "Egg" },
      { label: "Livestock", tab: "Livestock Registry", icon: "PawPrint" },
      { label: "Production", tab: "Production Ledger", icon: "TrendingUp" },
      { label: "Health", tab: "Health & Veterinary", icon: "Activity" },
    ],
    widgets: ["TotalAnimals", "ActiveFlocks", "EggProduction", "MilkYield", "FeedConsumption", "MortalityRate", "VaccinationDue", "LowFeedStock", "FarmProfit"],
    description: "Complete commercial livestock & poultry suite: flock lifecycle, FCR feed formulation, hatchery incubators, dairy milking sessions, vet lab reports, and POS integration.",
    requiresSubscription: true,
    version: "v2.5",
  },

  Bar: {
    name: "Bar & Beverage Lounge",
    icon: "Wine",
    sector: "Food & Hospitality",
    sidebar: [
      "Dashboard",
      { name: "Counter POS", subItems: ["Active Tables", "Bar Counter POS", "Open Tabs & Bills", "Order History", "Complimentary / Spoils"] },
      { name: "Beverage Inventory", subItems: ["Stock Register", "Liquid Volume Tracking", "Empty Bottle Return", "Stock Adjustments", "Low Stock Alerts"] },
      { name: "Recipe & Pour Control", subItems: ["Cocktail Recipes", "Cost-Per-Pour Mapping", "Batch Mixing", "Spillage Logs"] },
      { name: "Purchasing & Supplies", subItems: ["Distributors & Suppliers", "Purchase Orders", "Crate/Case Received", "Supplier Ledgers"] },
      { name: "Receipts", subItems: ["Receipt History", "Receipt Templates", "Receipt Analytics", "Receipt Verification", "Receipt Archive"] },
      { name: "Shift & Counter Management", subItems: ["Cashier Shifts", "Counter Handover", "Float Management", "Audit & Variance Logs"] },
      { name: "Staff & Commissions", subItems: ["Bartenders & Waiters", "Attendance Register", "Waiter Sales Tracking", "Tips & Commissions"] },
      { name: "Expenses", subItems: ["Licensing & Permits", "Operational Costs", "Damaged/Broken Stock"] },
      { name: "Reports & Analytics", subItems: ["Daily Sales Summary", "Fast-Moving Drinks", "Pour Variance Report", "Profit Margin Analysis", "Tax & Excise Duty"] },
      { name: "Settings", subItems: ["Bar Setup & Tables", "Measurement Units (Pours/Bottles)", "Happy Hour Rules", "Role Permissions"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Dashboard", icon: "Home" },
      { label: "POS", tab: "Counter POS", icon: "ShoppingCart" },
      { label: "Tabs", tab: "Counter POS", icon: "Receipt" },
      { label: "Stock", tab: "Beverage Inventory", icon: "Wine" },
      { label: "Reports", tab: "Reports & Analytics", icon: "BarChart2" },
    ],
    widgets: ["SalesToday", "ActiveOpenTabs", "EstimatedLiquidVariance", "TopSellingBeverage", "HappyHourStatus"],
    description: "Counter POS with open-tab billing, pour tracking, cocktail recipe costs, and excise duty reporting for bars, pubs, and nightclubs.",
    requiresSubscription: true,
    version: "v2.5",
  },

  BusinessConsultant: {
    name: "Business Consultant / Firm",
    icon: "Briefcase",
    sector: "Professional Services",
    sidebar: [
      { name: "Dashboard", subItems: ["Executive Dashboard", "KPI Overview", "Revenue Analytics", "Client Health Score", "Upcoming Deadlines", "Recent Activities"] },
      { name: "Clients", subItems: ["Client Directory", "Organizations", "Individual Clients", "Contact Persons", "Client Notes", "Client Documents", "Client Portal Access"] },
      { name: "Engagements", subItems: ["Active Projects", "Consulting Engagements", "Business Assessments", "Strategy Sessions", "Advisory Plans", "Deliverables", "Project Timeline"] },
      { name: "Proposals", subItems: ["Create Proposal", "Proposal Templates", "Sent Proposals", "Accepted", "Rejected", "Proposal Analytics"] },
      { name: "Contracts", subItems: ["Contracts", "Digital Signatures", "Renewals", "Contract Templates", "Expiring Contracts"] },
      { name: "Services", subItems: ["Service Catalog", "Pricing Packages", "Retainer Plans", "Hourly Services", "Custom Services", "Service Categories"] },
      { name: "Time Tracking", subItems: ["Timesheets", "Billable Hours", "Team Time Logs", "Productivity Report", "Approval Queue"] },
      { name: "Meetings", subItems: ["Calendar", "Client Meetings", "Online Meetings", "Follow-ups", "Agenda", "Meeting Minutes"] },
      { name: "Assessments", subItems: ["SWOT Analysis", "Business Health Check", "Risk Assessment", "Compliance Review", "Financial Analysis", "Assessment Templates"] },
      { name: "Invoicing", subItems: ["Quotes", "Invoices", "Payments", "Outstanding", "Recurring Billing", "Expenses"] },
      { name: "Team", subItems: ["Consultants", "Skills Matrix", "Certifications", "Capacity Planning", "Performance", "Leave Calendar"] },
      { name: "AI Consultant", subItems: ["Business Insights", "SWOT Generator", "Proposal Generator", "Business Plan Generator", "Financial Recommendations", "Meeting Summary", "AI Chat"] },
      { name: "Reports", subItems: ["Client Reports", "Project Reports", "Financial Reports", "Consultant Utilization", "Revenue Reports", "Profitability", "Export Center"] },
      { name: "Settings", subItems: ["Business Profile", "Branches", "Tax Settings", "Users & Roles", "Workflow Automation", "Integrations", "Audit Logs"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Dashboard", icon: "Home" },
      { label: "Clients", tab: "Clients", icon: "Users" },
      { label: "Projects", tab: "Engagements", icon: "FolderOpen" },
      { label: "Time", tab: "Time Tracking", icon: "Clock" },
      { label: "AI", tab: "AI Consultant", icon: "Sparkles" },
    ],
    widgets: ["TotalClients", "ActiveEngagements", "MonthlyRevenue", "ConsultantUtilization", "BillableHours", "ProposalConversionRate", "UpcomingMeetings", "ExpiringContracts"],
    description: "Automatic client portals, proposals, contracts, project deliverables, timesheets, and AI business analysis.",
    requiresSubscription: true,
    version: "v2.5",
  },

  TechnicalCompany: {
    name: "Technical & Engineering Company",
    icon: "Cpu",
    sector: "Industry & Technology",
    sidebar: [
      { name: "Dashboard", subItems: ["Business Overview", "Revenue Analytics", "Active Projects", "Pending Jobs", "Team Productivity", "KPI Dashboard"] },
      { name: "Customers", subItems: ["Customer Directory", "Corporate Clients", "Individual Clients", "Customer Contracts", "Service History", "Customer Communication"] },
      { name: "Sales & Quotations", subItems: ["Quotations", "Estimates", "Proforma Invoices", "Sales Orders", "Contracts", "Invoices", "Payments", "Credit Notes"] },
      { name: "Projects", subItems: ["Project List", "Active Projects", "Completed Projects", "Milestones", "Tasks", "Project Calendar", "Resource Allocation", "Budget Tracking", "Project Documents"] },
      { name: "Field Service", subItems: ["Service Requests", "Work Orders", "Site Visits", "Maintenance Jobs", "Installation Jobs", "Emergency Calls", "Technician Schedule", "Job Completion Reports"] },
      { name: "Technical Services", subItems: ["Repairs", "Installations", "Preventive Maintenance", "Equipment Inspection", "Testing & Commissioning", "Calibration", "Troubleshooting", "Service Checklists"] },
      { name: "Assets & Equipment", subItems: ["Company Equipment", "Customer Equipment", "Asset Register", "Equipment Maintenance", "Warranty Tracking", "Serial Numbers", "Asset History"] },
      { name: "Inventory", subItems: ["Products", "Spare Parts", "Consumables", "Stock Movement", "Purchase Orders", "Suppliers", "Goods Received", "Stock Transfers", "Stock Adjustment"] },
      { name: "Workforce", subItems: ["Employees", "Technicians", "Engineers", "Teams", "Attendance", "Timesheets", "Leave Management", "Payroll Integration"] },
      { name: "Finance", subItems: ["Income", "Expenses", "Project Costing", "Profit Analysis", "Cash Flow", "Accounts Receivable", "Accounts Payable", "General Ledger"] },
      { name: "Reports", subItems: ["Sales Report", "Project Report", "Technician Performance", "Equipment Report", "Inventory Report", "Financial Report", "Job Completion Report", "Profitability Report"] },
      { name: "AI Insights", subItems: ["Revenue Forecast", "Predictive Maintenance", "Inventory Forecast", "Customer Insights", "Technician Performance", "Project Risk Analysis", "Smart Recommendations", "AI Assistant"] },
      { name: "Settings", subItems: ["Business Profile", "Branches", "Tax Settings", "Departments", "Service Categories", "Job Types", "User Roles", "Workflow Automation", "Integrations", "Feature Flags"] },
    ],
    bottomNav: [
      { label: "Home", tab: "Dashboard", icon: "Home" },
      { label: "Jobs", tab: "Field Service", icon: "Wrench" },
      { label: "Projects", tab: "Projects", icon: "FolderOpen" },
      { label: "Assets", tab: "Assets & Equipment", icon: "Cpu" },
      { label: "AI", tab: "AI Insights", icon: "Sparkles" },
    ],
    widgets: ["Revenue", "Active Projects", "Today's Jobs", "Technician Availability", "Outstanding Quotations", "Inventory Status", "Equipment Health", "AI Insights"],
    description: "Project management, field service work orders, equipment tracking, technician scheduling, and AI predictive maintenance.",
    requiresSubscription: true,
    version: "v2.5",
  },
};

// ─── Sector Groupings ────────────────────────────────────────────────────────

export const ALL_MODULE_KEYS = Object.keys(MODULE_MANIFESTS) as IndustryModule[];

export function getModulesBySector(): Record<ModuleSector, IndustryModule[]> {
  const result = {} as Record<ModuleSector, IndustryModule[]>;
  for (const [key, manifest] of Object.entries(MODULE_MANIFESTS)) {
    const sector = manifest.sector;
    if (!result[sector]) result[sector] = [];
    result[sector].push(key as IndustryModule);
  }
  return result;
}

export function searchModules(query: string): IndustryModule[] {
  if (!query.trim()) return ALL_MODULE_KEYS;
  const q = query.toLowerCase();
  return ALL_MODULE_KEYS.filter((key) => {
    const m = MODULE_MANIFESTS[key];
    return (
      m.name.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      m.sector.toLowerCase().includes(q) ||
      key.toLowerCase().includes(q)
    );
  });
}

export function getDefaultTab(module: IndustryModule): string {
  const manifest = MODULE_MANIFESTS[module];
  if (!manifest) return "Dashboard";
  const first = manifest.sidebar[0];
  if (!first) return "Dashboard";
  if (typeof first === "string") return first;
  return first.name;
}
