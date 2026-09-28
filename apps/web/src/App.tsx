import { lazy, Suspense, useEffect, useRef, useState } from "react";
const lazyPage = (loader: () => Promise<{ default: React.ComponentType<any> }>): React.ComponentType<any> =>
  lazy(loader) as React.ComponentType<any>;
import { KwakoPosProvider, useAuth, useModule } from "./context/KwakoPosContexts.js";
import { apiFetch, getStoredSession } from "./services/apiClient.js";
import { WindowManagerProvider } from "./context/WindowManagerContext.js";
import { ToastProvider } from "./components/UI/Toast.js";
import { ProductionErrorBoundary } from "./components/UI/ProductionErrorBoundary.js";
const LoginPage = lazyPage(() => import("./pages/LoginPage.js").then((m) => ({ default: m.LoginPage })));
const SystemAppShellLayout = lazyPage(() => import("./layouts/SystemAppShellLayout.js").then((m) => ({ default: m.SystemAppShellLayout })));
const TenantOnboardingPage = lazyPage(() => import("./pages/TenantOnboardingPage.js").then((m) => ({ default: m.TenantOnboardingPage })));
const SupportOperationsPage = lazyPage(() => import("./pages/SupportOperationsPage.js").then((m) => ({ default: m.SupportOperationsPage })));
const SuperAdminSupportControlTowerPage = lazyPage(() => import("./pages/SuperAdminSupportControlTowerPage.js").then((m) => ({ default: m.SuperAdminSupportControlTowerPage })));
const LegalCenterPage = lazyPage(() => import("./pages/LegalCenterPage.js").then((m) => ({ default: m.LegalCenterPage })));
const PrivacyCenterPage = lazyPage(() => import("./pages/PrivacyCenterPage.js").then((m) => ({ default: m.PrivacyCenterPage })));
const SuperAdminComplianceTowerPage = lazyPage(() => import("./pages/SuperAdminComplianceTowerPage.js").then((m) => ({ default: m.SuperAdminComplianceTowerPage })));
const SuperAdminRollbackCenterPage = lazyPage(() => import("./pages/SuperAdminRollbackCenterPage.js").then((m) => ({ default: m.SuperAdminRollbackCenterPage })));
import { LegalAcceptanceModal } from "./components/LegalAcceptanceModal.js";
import { WorkspaceLoadingScreen } from "./components/WorkspaceLoadingScreen.js";
import { SkeletonDashboard } from "./components/UI/Skeleton.js";

const lazyWorkspacePage = (key: string) => {
  switch (key) {
    case "DashboardPage": return lazyPage(() => import("./pages/DashboardPage.js").then((m) => ({ default: m.DashboardPage })));
    case "PosPage": return lazyPage(() => import("./pages/PosPage.js").then((m) => ({ default: m.PosPage })));
    case "InventoryPage": return lazyPage(() => import("./pages/InventoryPage.js").then((m) => ({ default: m.InventoryPage })));
    case "CustomersPage": return lazyPage(() => import("./pages/CustomersPage.js").then((m) => ({ default: m.CustomersPage })));
    case "PurchasingPage": return lazyPage(() => import("./pages/PurchasingPage.js").then((m) => ({ default: m.PurchasingPage })));
    case "ReportsPage": return lazyPage(() => import("./pages/ReportsPage.js").then((m) => ({ default: m.ReportsPage })));
    case "SettingsPage": return lazyPage(() => import("./pages/SettingsPage.js").then((m) => ({ default: m.SettingsPage })));
    case "SuperAdminPage": return lazyPage(() => import("./pages/SuperAdminPage.js").then((m) => ({ default: m.SuperAdminPage })));
    case "ExpensesPage": return lazyPage(() => import("./pages/ExpensesPage.js").then((m) => ({ default: m.ExpensesPage })));
    case "BusinessConsultingPage": return lazyPage(() => import("./pages/BusinessConsultingPage.js").then((m) => ({ default: m.BusinessConsultingPage })));
    case "LawFirmPage": return lazyPage(() => import("./pages/LawFirmPage.js").then((m) => ({ default: m.LawFirmPage })));
    case "PharmacyPage": return lazyPage(() => import("./pages/PharmacyPage.js").then((m) => ({ default: m.PharmacyPage })));
    case "CashDrawerPage": return lazyPage(() => import("./pages/CashDrawerPage.js").then((m) => ({ default: m.CashDrawerPage })));
    case "ReceiptsPage": return lazyPage(() => import("./pages/ReceiptsPage.js").then((m) => ({ default: m.ReceiptsPage })));
    case "TrashPage": return lazyPage(() => import("./pages/TrashPage.js").then((m) => ({ default: m.TrashPage })));
    case "PersistenceTestPage": return lazyPage(() => import("./pages/PersistenceTestPage.js").then((m) => ({ default: m.PersistenceTestPage })));
    case "HelpPage": return lazyPage(() => import("./pages/HelpPage.js").then((m) => ({ default: m.HelpPage })));
    case "VerticalCommandCenterPage": return lazyPage(() => import("./pages/VerticalCommandCenterPage.js").then((m) => ({ default: m.VerticalCommandCenterPage })));
    case "UsersPage":
    case "DiagnosticsPage":
    case "AiPage":
    case "FinancePage":
    case "PoultryLivestockPage":
    case "FleetPage":
    case "WorkforcePage":
    case "TelecomPage":
      return lazyPage(() => import("./pages/WorkspacePages.js").then((m: any) => ({ default: m[key] })));
    default: throw new Error(`Unknown workspace page: ${key}`);
  }
};

const DashboardPage = lazyWorkspacePage("DashboardPage");
const PosPage = lazyWorkspacePage("PosPage");
const InventoryPage = lazyWorkspacePage("InventoryPage");
const CustomersPage = lazyWorkspacePage("CustomersPage");
const PurchasingPage = lazyWorkspacePage("PurchasingPage");
const FinancePage = lazyWorkspacePage("FinancePage");
const ReportsPage = lazyWorkspacePage("ReportsPage");
const SettingsPage = lazyWorkspacePage("SettingsPage");
const UsersPage = lazyWorkspacePage("UsersPage");
const SuperAdminPage = lazyWorkspacePage("SuperAdminPage");
const DiagnosticsPage = lazyWorkspacePage("DiagnosticsPage");
const ExpensesPage = lazyWorkspacePage("ExpensesPage");
const AiPage = lazyWorkspacePage("AiPage");
const CashDrawerPage = lazyWorkspacePage("CashDrawerPage");
const ReceiptsPage = lazyWorkspacePage("ReceiptsPage");
const TrashPage = lazyWorkspacePage("TrashPage");
const PersistenceTestPage = lazyWorkspacePage("PersistenceTestPage");
const BusinessConsultingPage = lazyWorkspacePage("BusinessConsultingPage");
const LawFirmPage = lazyWorkspacePage("LawFirmPage");
const PharmacyPage = lazyWorkspacePage("PharmacyPage");
const PoultryLivestockPage = lazyWorkspacePage("PoultryLivestockPage");
const FleetPage = lazyWorkspacePage("FleetPage");
const WorkforcePage = lazyWorkspacePage("WorkforcePage");
const TelecomPage = lazyWorkspacePage("TelecomPage");
const HelpPage = lazyWorkspacePage("HelpPage");
const VerticalCommandCenterPage = lazyWorkspacePage("VerticalCommandCenterPage");
const CustomerDisplayPage = lazyPage(() => import("./pages/CustomerDisplayPage.js").then((m) => ({ default: m.CustomerDisplayPage })));

const TAB_TO_PATH: Record<string, string> = {
  Dashboard: "/",
  // POS
  POS: "/pos",
  "New Sale": "/pos",
  "Sales History": "/pos",
  Returns: "/pos",
  // Cash Drawer
  "Cash Drawer": "/cash-drawer",
  "Shift & Active Register": "/cash-drawer",
  "Cash Movement Ledger": "/cash-drawer",
  "Reconciliation & Variances": "/cash-drawer",
  "Safe & Bank Deposits": "/cash-drawer",
  "No Sale & Event Logs": "/cash-drawer",
  "15 Financial Reports": "/cash-drawer",
  "Security & RBAC Rules": "/cash-drawer",
  "AI Cash Advisor": "/cash-drawer",
  // Inventory
  Inventory: "/inventory",
  "Inventory Overview": "/inventory",
  Products: "/inventory",
  "Categories & Brands": "/inventory",
  "Stock Adjustment": "/inventory",
  "Stock Transfer": "/inventory",
  "Stock Alerts": "/inventory",
  "Stock Sync Engine": "/inventory",
  "Product Bundles & Kits": "/inventory",
  "Stock Count": "/inventory",
  "Ledger Drilldown": "/inventory",
  "Inventory Reports": "/inventory",
  // Receipts
  Receipts: "/receipts",
  "Receipt History": "/receipts",
  "Receipt Viewer": "/receipts",
  "Receipt Templates": "/receipts",
  "Receipt Analytics": "/receipts",
  "Receipt Verification": "/receipts",
  "Receipt Archive": "/receipts",
  // Customers
  Customers: "/customers",
  // Purchasing
  Purchasing: "/purchasing",
  Suppliers: "/purchasing",
  "Purchase Orders": "/purchasing",
  "Goods Received": "/purchasing",
  "Supplier Ledgers": "/purchasing",
  Warehouses: "/purchasing",
  // Expenses
  Expenses: "/expenses",
  // Reports
  Reports: "/reports",
  Sales: "/reports",
  Profit: "/reports",
  "Inventory Valuation": "/reports",
  Tax: "/reports",
  "Customers Report": "/reports",
  "Expenses Report": "/reports",
  "Payment Methods": "/reports",
  "Stock Movement": "/reports",
  "Purchasing Report": "/reports",
  Discounts: "/reports",
  "Returns & Refunds": "/reports",
  "Branch Comparison": "/reports",
  "Cashier Performance": "/reports",
  "Receivables Aging": "/reports",
  // Employees & Roles
  Employees: "/users",
  "Users & Roles": "/users",
  // AI Insights Engine
  "AI Insights Engine": "/ai",
  "AI Insights": "/ai",
  "Business Health Score": "/ai",
  "Sales Intelligence": "/ai",
  "Inventory Intelligence": "/ai",
  "Profit & Pricing": "/ai",
  "Customer CLV": "/ai",
  "Cash Flow & Burn": "/ai",
  "Fraud & Security": "/ai",
  "Demand Forecast": "/ai",
  // Settings
  Settings: "/settings",
  "General Settings": "/settings",
  "Business Profile & Identity": "/settings",
  "POS Configurations": "/settings",
  "Inventory Rules": "/settings",
  "Tax & Billing": "/settings",
  "Security Policies": "/settings",
  "Terminals & Sessions": "/settings",
  "Trash Can & Recovery": "/trash",
  "Subscriptions & Billing": "/settings",
  "Developer Options": "/settings",
  "Help & Manuals": "/help",
  "Change Log": "/settings",
  // Super Admin & Platform Towers
  Finance: "/finance",
  "Super Admin": "/super-admin",
  "Super Admin Certification": "/super-admin/certification",
  "Certification Studio": "/super-admin/certification",
  "KPCP Certification": "/super-admin/certification",
  "Support Control Tower": "/super-admin/support",
  "Compliance Tower": "/super-admin/compliance",
  "Rollback Center": "/super-admin/rollback",
  "Rollback Auth Center": "/super-admin/rollback",
  Diagnostics: "/diagnostics",
  Trash: "/trash",
  "Persistence Test": "/persistence-test",
  "Business Consulting": "/consulting",
  Consulting: "/consulting",
  "Law Firm": "/law-firm",
  Pharmacy: "/pharmacy",
  "Poultry & Livestock": "/poultry-livestock",
  "Fleet Management": "/fleet",
  Workforce: "/workforce",
  Telecom: "/telecom",
  Help: "/help",
  "Support & Operations": "/support",
  Legal: "/legal",
  Privacy: "/privacy",
  // Vertical Industry Hubs & Sub-items
  Restaurant: "/restaurant",
  Tables: "/restaurant",
  "Kitchen Display": "/restaurant",
  Orders: "/restaurant",
  "Open Orders": "/restaurant",
  "Completed Orders": "/restaurant",
  "Cancelled Orders": "/restaurant",
  "Menu Management": "/restaurant",
  "Food Items": "/restaurant",
  Recipes: "/restaurant",
  Ingredients: "/restaurant",
  Reservations: "/restaurant",
  Electronics: "/electronics",
  "Serial / IMEI": "/electronics",
  "Serial & IMEI Tracker": "/electronics",
  "Warranty Claims": "/electronics",
  "Device Repairs": "/electronics",
  "Trade-Ins": "/electronics",
  Hardware: "/hardware",
  "Dimensional Stock": "/hardware",
  "Cutting & Timber": "/hardware",
  "Contractor Accounts": "/hardware",
  "Paint Mixing": "/hardware",
  Microfinance: "/microfinance",
  "Loan Products": "/microfinance",
  Disbursements: "/microfinance",
  Repayments: "/microfinance",
  "PAR30 Risk": "/microfinance",
  Collateral: "/microfinance",
  SACCO: "/sacco",
  Members: "/sacco",
  Groups: "/sacco",
  Savings: "/sacco",
  Deposits: "/sacco",
  Withdrawals: "/sacco",
  Statements: "/sacco",
  Loans: "/sacco",
  "Loan Applications": "/sacco",
  Approval: "/sacco",
  "Loan Reports": "/sacco",
  Shares: "/sacco",
  Meetings: "/sacco",
  Fines: "/sacco",
  Garage: "/garage",
  "Job Cards": "/garage",
  "Repair Orders": "/garage",
  "Vehicle Directory": "/garage",
  Mechanics: "/garage",
  "Service History": "/garage",
  Construction: "/construction",
  Projects: "/construction",
  "Project Stages": "/construction",
  BOQ: "/construction",
  "Site Logs": "/construction",
  Subcontractors: "/construction",
  Wholesale: "/wholesale",
  "Bulk Orders": "/wholesale",
  "Break-Pack Units": "/wholesale",
  "Price Tiers": "/wholesale",
  "Pallet Management": "/wholesale",
  "Dispatch & Vans": "/wholesale",
  Bar: "/bar",
  "Bar & Lounge": "/bar",
  "Open Tabs": "/bar",
  "Bottle Matrix": "/bar",
  "Happy Hour": "/bar",
  "Wastage Variance": "/bar",
  "Real Estate": "/real-estate",
  Properties: "/real-estate",
  "Units & Leases": "/real-estate",
  "Rent Ledger": "/real-estate",
  "Service Charges": "/real-estate",
  "Tenant Arrears": "/real-estate",
};

const PATH_TO_CANONICAL_TAB: Record<string, string> = {
  "/": "Dashboard",
  "/dashboard": "Dashboard",
  "/pos": "POS",
  "/inventory": "Inventory",
  "/customers": "Customers",
  "/purchasing": "Purchasing",
  "/finance": "Finance",
  "/reports": "Reports",
  "/settings": "Settings",
  "/users": "Users & Roles",
  "/super-admin": "Super Admin",
  "/super-admin/certification": "Super Admin",
  "/super-admin/support": "Support Control Tower",
  "/super-admin/compliance": "Compliance Tower",
  "/super-admin/rollback": "Rollback Auth Center",
  "/diagnostics": "Diagnostics",
  "/expenses": "Expenses",
  "/ai": "AI Insights Engine",
  "/cash-drawer": "Cash Drawer",
  "/receipts": "Receipts",
  "/trash": "Trash",
  "/persistence-test": "Persistence Test",
  "/consulting": "Business Consulting",
  "/law-firm": "Law Firm",
  "/pharmacy": "Pharmacy",
  "/poultry-livestock": "Poultry & Livestock",
  "/fleet": "Fleet Management",
  "/workforce": "Workforce",
  "/telecom": "Telecom",
  "/help": "Help",
  "/support": "Support & Operations",
  "/legal": "Legal",
  "/privacy": "Privacy",
  "/restaurant": "Restaurant",
  "/electronics": "Electronics",
  "/hardware": "Hardware",
  "/microfinance": "Microfinance",
  "/sacco": "SACCO",
  "/garage": "Garage",
  "/construction": "Construction",
  "/wholesale": "Wholesale",
  "/bar": "Bar",
  "/real-estate": "Real Estate",
};

const STANDALONE_PATHS = new Set([
  "/tenant-onboarding",
  "/legal",
  "/privacy",
  "/super-admin",
  "/super-admin/certification",
  "/super-admin/support",
  "/super-admin/compliance",
  "/super-admin/rollback",
  "/law-firm",
  "/pharmacy",
  "/poultry-livestock",
  "/fleet",
  "/workforce",
  "/telecom",
  "/restaurant",
  "/electronics",
  "/hardware",
  "/microfinance",
  "/sacco",
  "/garage",
  "/construction",
  "/wholesale",
  "/bar",
  "/real-estate",
]);

const ALLOWED_SUPER_ADMIN_PATHS = new Set([
  "/super-admin",
  "/super-admin/certification",
  "/super-admin/support",
  "/super-admin/compliance",
  "/super-admin/rollback",
  "/diagnostics",
  "/tenant-onboarding",
  "/legal",
  "/privacy",
]);

const AuthenticatedApp: React.FC = () => {
  const { user, isAuthenticated, isInitializing, dismissLoading, impersonatedTenant } = useAuth();
  const { activeTab, setActiveTab } = useModule();
  const [currentPath, setCurrentPath] = useState(() =>
    typeof window !== "undefined" ? window.location.pathname : "/"
  );
  const initialRouteSyncRef = useRef(true);
  const [hasEnteredWorkspace, setHasEnteredWorkspace] = useState(() =>
    Boolean(getStoredSession()?.user)
  );
  const [legalGate, setLegalGate] = useState<"checking" | "pending" | "compliant" | "error">(() =>
    getStoredSession()?.user ? "checking" : "compliant"
  );
  const [legalGateNonce, setLegalGateNonce] = useState(0);

  const isSuperAdmin = Boolean(
    user && (user.role === "SUPER_ADMIN" || user.email === "admin@kwakoko.co.tz")
  );

  // Sync activeTab on initial mount if current pathname matches a canonical tab
  useEffect(() => {
    const initialPath = typeof window !== "undefined" ? window.location.pathname : "/";
    if (PATH_TO_CANONICAL_TAB[initialPath]) {
      setActiveTab(PATH_TO_CANONICAL_TAB[initialPath]);
    }
  }, [setActiveTab]);

  useEffect(() => {
    if (!(user && isAuthenticated)) {
      setLegalGate("compliant");
      return;
    }
    let cancelled = false;
    setLegalGate("checking");
    apiFetch<{ success: boolean; data: { isCompliant: boolean; requiredDocuments: unknown[] } }>("/api/legal/acceptance/status")
      .then((res) => {
        if (cancelled) return;
        if (!res.success || !res.data) return setLegalGate("error");
        setLegalGate(res.data.isCompliant ? "compliant" : "pending");
      })
      .catch(() => { if (!cancelled) setLegalGate("error"); });
    return () => { cancelled = true; };
  }, [user, isAuthenticated, legalGateNonce]);

  useEffect(() => {
    if ((user || isAuthenticated) && legalGate === "compliant") setHasEnteredWorkspace(true);
  }, [user, isAuthenticated, legalGate]);

  useEffect(() => {
    const onPop = () => {
      const path = window.location.pathname;
      setCurrentPath(path);
      if (PATH_TO_CANONICAL_TAB[path]) {
        setActiveTab(PATH_TO_CANONICAL_TAB[path]);
      } else if (!STANDALONE_PATHS.has(path)) {
        setActiveTab(user?.role === "SUPER_ADMIN" && !impersonatedTenant ? "Super Admin" : "Dashboard");
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [setActiveTab, user, impersonatedTenant]);

  useEffect(() => {
    if (STANDALONE_PATHS.has(currentPath)) {
      return;
    }
    // Preserve a directly opened canonical route only during the initial
    // path -> tab synchronization. Once the first render has settled, every
    // user-initiated activeTab change must be allowed to update the URL.
    const canonicalTab = PATH_TO_CANONICAL_TAB[currentPath];
    if (initialRouteSyncRef.current) {
      initialRouteSyncRef.current = false;
      if (canonicalTab && canonicalTab !== activeTab) return;
    }

    const defaultPath = isSuperAdmin && !impersonatedTenant ? "/super-admin" : "/";
    const path = TAB_TO_PATH[activeTab] || defaultPath;
    if (currentPath !== path) {
      setCurrentPath(path);
      if (typeof window !== "undefined" && window.location.pathname !== path) {
        window.history.pushState({}, "", path);
      }
    }
  }, [activeTab, isSuperAdmin, impersonatedTenant]);

  const handleNavigate = (path: string) => {
    setCurrentPath(path);
    if (typeof window !== "undefined" && window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
    if (PATH_TO_CANONICAL_TAB[path]) {
      setActiveTab(PATH_TO_CANONICAL_TAB[path]);
    }
  };

  // Multi-tenant & Super Admin Platform Isolation Guard
  useEffect(() => {
    if (!user) return;

    if (isSuperAdmin && !impersonatedTenant) {
      // Super Admin without active tenant impersonation is strictly locked to Platform Control Tower
      if (!ALLOWED_SUPER_ADMIN_PATHS.has(currentPath)) {
        handleNavigate("/super-admin");
      }
    } else if (!isSuperAdmin) {
      // Regular tenant users are strictly prohibited from Super Admin platform tower
      if (currentPath.startsWith("/super-admin") || currentPath === "/tenant-onboarding") {
        handleNavigate("/");
      }
    }
  }, [isSuperAdmin, impersonatedTenant, currentPath, user]);

  // Stay on WorkspaceLoadingScreen until user explicitly clicks Enter (only on first-time unauthenticated visit)
  if (!hasEnteredWorkspace && !user) {
    if (currentPath === "/legal") {
      return <LegalCenterPage onNavigate={handleNavigate} />;
    }
    if (currentPath === "/privacy") {
      return <PrivacyCenterPage onNavigate={handleNavigate} />;
    }
    if (isInitializing) {
      return (
        <WorkspaceLoadingScreen
          onForceContinue={() => {
            dismissLoading?.();
            setHasEnteredWorkspace(true);
          }}
        />
      );
    }
  }

  // Fail-closed statutory consent gate: never render the authenticated workspace before server verification.
  if (isAuthenticated && user && legalGate !== "compliant") {
    if (legalGate === "error") {
      return (
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem", background: "var(--surface-sunken, #f8fafc)" }}>
          <div className="v2-card" style={{ maxWidth: "560px", width: "100%", padding: "2rem", textAlign: "center" }}>
            <h2 className="v2-text-lg v2-font-black" style={{ marginTop: 0 }}>Statutory Consent Verification Required</h2>
            <p className="v2-text-sm v2-text-muted">KwakoPos cannot open your workspace until statutory consent status is verified. Service or network failure is treated as non-compliance.</p>
            <button className="v2-btn v2-btn-primary" type="button" onClick={() => setLegalGateNonce((n) => n + 1)}>Retry Verification</button>
          </div>
        </div>
      );
    }
    return <LegalAcceptanceModal isOpen={true} onAccepted={() => setLegalGate("compliant")} />;
  }

  // Standalone Customer-Facing Secondary Display Window (runs without admin shell)
  if (currentPath === "/customer-display") {
    return <CustomerDisplayPage />;
  }

  // Public Legal / Privacy routes viewable even without authentication
  if (!isAuthenticated || !user) {
    if (currentPath === "/legal") {
      return <LegalCenterPage onNavigate={handleNavigate} />;
    }
    if (currentPath === "/privacy") {
      return <PrivacyCenterPage onNavigate={handleNavigate} />;
    }

    return (
      <LoginPage
        provisioningRequested={currentPath === "/tenant-onboarding"}
        onAuthenticated={() => {
          setHasEnteredWorkspace(true);
          if (currentPath === "/tenant-onboarding") {
            setCurrentPath("/tenant-onboarding");
            if (typeof window !== "undefined" && window.location.pathname !== "/tenant-onboarding") {
              window.history.pushState({}, "", "/tenant-onboarding");
            }
          } else if (user?.role === "SUPER_ADMIN" || user?.email === "admin@kwakoko.co.tz") {
            handleNavigate("/super-admin");
          } else {
            setActiveTab("Dashboard");
          }
        }}
      />
    );
  }

  const renderView = () => {
    // Platform Isolation Guard: Super Admin without impersonation cannot render tenant store views
    if (isSuperAdmin && !impersonatedTenant && !ALLOWED_SUPER_ADMIN_PATHS.has(currentPath)) {
      return <SuperAdminPage onNavigate={handleNavigate} />;
    }
    // Tenant Isolation Guard: Regular tenant users cannot render super-admin platform views
    if (!isSuperAdmin && (currentPath.startsWith("/super-admin") || currentPath === "/tenant-onboarding")) {
      return <DashboardPage onNavigate={handleNavigate} />;
    }

    switch (currentPath) {
      case "/tenant-onboarding":
        return <TenantOnboardingPage />;
      case "/legal":
        return <LegalCenterPage onNavigate={handleNavigate} />;
      case "/privacy":
        return <PrivacyCenterPage onNavigate={handleNavigate} />;
      case "/super-admin/compliance":
        return <SuperAdminComplianceTowerPage onNavigate={handleNavigate} />;
      case "/super-admin/rollback":
        return <SuperAdminRollbackCenterPage />;
      case "/super-admin/certification":
        return <SuperAdminPage onNavigate={handleNavigate} initialTab="certification" />;
      case "/restaurant":
        return <VerticalCommandCenterPage moduleType="restaurant" onNavigate={handleNavigate} />;
      case "/electronics":
        return <VerticalCommandCenterPage moduleType="electronics" onNavigate={handleNavigate} />;
      case "/hardware":
        return <VerticalCommandCenterPage moduleType="hardware" onNavigate={handleNavigate} />;
      case "/microfinance":
        return <VerticalCommandCenterPage moduleType="microfinance" onNavigate={handleNavigate} />;
      case "/sacco":
        return <VerticalCommandCenterPage moduleType="sacco" onNavigate={handleNavigate} />;
      case "/garage":
        return <VerticalCommandCenterPage moduleType="garage" onNavigate={handleNavigate} />;
      case "/construction":
        return <VerticalCommandCenterPage moduleType="construction" onNavigate={handleNavigate} />;
      case "/wholesale":
        return <VerticalCommandCenterPage moduleType="wholesale" onNavigate={handleNavigate} />;
      case "/bar":
        return <VerticalCommandCenterPage moduleType="bar" onNavigate={handleNavigate} />;
      case "/real-estate":
        return <VerticalCommandCenterPage moduleType="real-estate" onNavigate={handleNavigate} />;
      case "/":
      case "/dashboard":
        return <DashboardPage onNavigate={handleNavigate} />;
      case "/pos":
        return <PosPage onNavigate={handleNavigate} activeTab={activeTab} />;
      case "/inventory":
        return <InventoryPage activeTab={activeTab} />;
      case "/customers":
        return <CustomersPage activeTab={activeTab} />;
      case "/purchasing":
        return <PurchasingPage activeTab={activeTab} />;
      case "/finance":
        return <FinancePage />;
      case "/reports":
        return <ReportsPage activeTab={activeTab} />;
      case "/settings":
        return <SettingsPage activeTab={activeTab} />;
      case "/users":
        return <UsersPage />;
      case "/super-admin":
        return <SuperAdminPage onNavigate={handleNavigate} />;
      case "/super-admin/support":
        return <SuperAdminSupportControlTowerPage />;
      case "/diagnostics":
        return <DiagnosticsPage />;
      case "/expenses":
        return <ExpensesPage activeTab={activeTab} />;
      case "/ai":
        return <AiPage activeTab={activeTab} />;
      case "/cash-drawer":
        return <CashDrawerPage activeTab={activeTab} />;
      case "/receipts":
        return <ReceiptsPage activeTab={activeTab} />;
      case "/trash":
        return <TrashPage />;
      case "/persistence-test":
        return <PersistenceTestPage />;
      case "/consulting":
        return <BusinessConsultingPage />;
      case "/law-firm":
        return <LawFirmPage />;
      case "/pharmacy":
        return <PharmacyPage />;
      case "/poultry-livestock":
        return <PoultryLivestockPage />;
      case "/fleet":
        return <FleetPage />;
      case "/workforce":
        return <WorkforcePage />;
      case "/telecom":
        return <TelecomPage />;
      case "/help":
        return <HelpPage />;
      case "/support":
        return <SupportOperationsPage />;
      default:
        return <DashboardPage onNavigate={handleNavigate} />;
    }
  };

  return (
    <>
      <Suspense
        fallback={
          <div style={{ padding: "1.5rem", width: "100%", maxWidth: "1600px", margin: "0 auto" }}>
            <SkeletonDashboard />
          </div>
        }
      >
        <SystemAppShellLayout currentPath={currentPath} onNavigate={handleNavigate}>
          <ProductionErrorBoundary>
          <Suspense
            fallback={
              <div style={{ padding: "1.5rem", width: "100%", maxWidth: "1600px", margin: "0 auto" }}>
                <SkeletonDashboard />
              </div>
            }
          >
            {renderView()}
          </Suspense>
          </ProductionErrorBoundary>
        </SystemAppShellLayout>
      </Suspense>
    </>
  );
};

export const App: React.FC = () => (
  <KwakoPosProvider>
    <ToastProvider>
      <WindowManagerProvider>
        <AuthenticatedApp />
      </WindowManagerProvider>
    </ToastProvider>
  </KwakoPosProvider>
);

export default App;
