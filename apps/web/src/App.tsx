import React, { useEffect, useState } from "react";
import { KwakoPosProvider, useAuth, useModule } from "./context/KwakoPosContexts.js";
import { getStoredSession } from "./services/apiClient.js";
import { WindowManagerProvider } from "./context/WindowManagerContext.js";
import { ToastProvider } from "./components/UI/Toast.js";
import { ProductionErrorBoundary } from "./components/UI/ProductionErrorBoundary.js";
import { LoginPage } from "./pages/LoginPage.js";
import { SystemAppShellLayout } from "./layouts/SystemAppShellLayout.js";
import { TenantOnboardingPage } from "./pages/TenantOnboardingPage.js";
import { SupportOperationsPage } from "./pages/SupportOperationsPage.js";
import { SuperAdminSupportControlTowerPage } from "./pages/SuperAdminSupportControlTowerPage.js";
import { LegalCenterPage } from "./pages/LegalCenterPage.js";
import { PrivacyCenterPage } from "./pages/PrivacyCenterPage.js";
import { SuperAdminComplianceTowerPage } from "./pages/SuperAdminComplianceTowerPage.js";
import { SuperAdminRollbackCenterPage } from "./pages/SuperAdminRollbackCenterPage.js";
import { LegalAcceptanceModal } from "./components/LegalAcceptanceModal.js";
import { WorkspaceLoadingScreen } from "./components/WorkspaceLoadingScreen.js";
import {
  DashboardPage,
  PosPage,
  InventoryPage,
  CustomersPage,
  PurchasingPage,
  FinancePage,
  ReportsPage,
  SettingsPage,
  UsersPage,
  SuperAdminPage,
  DiagnosticsPage,
  ExpensesPage,
  AiPage,
  CashDrawerPage,
  ReceiptsPage,
  TrashPage,
  PersistenceTestPage,
  BusinessConsultingPage,
  LawFirmPage,
  PharmacyPage,
  PoultryLivestockPage,
  FleetPage,
  WorkforcePage,
  TelecomPage,
  HelpPage,
} from "./pages/WorkspacePages.js";
import { CustomerDisplayPage } from "./pages/CustomerDisplayPage.js";

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
  // Other Pages
  Finance: "/finance",
  "Super Admin": "/super-admin",
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
};

const STANDALONE_PATHS = new Set([
  "/tenant-onboarding",
  "/legal",
  "/privacy",
  "/super-admin",
  "/super-admin/support",
  "/super-admin/compliance",
  "/super-admin/rollback",
]);

const ALLOWED_SUPER_ADMIN_PATHS = new Set([
  "/super-admin",
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
  const [hasEnteredWorkspace, setHasEnteredWorkspace] = useState(() =>
    Boolean(getStoredSession()?.user)
  );

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
    if (user || isAuthenticated) {
      setHasEnteredWorkspace(true);
    }
  }, [user, isAuthenticated]);

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
      <SystemAppShellLayout currentPath={currentPath} onNavigate={handleNavigate}>
        <ProductionErrorBoundary>
          {renderView()}
        </ProductionErrorBoundary>
      </SystemAppShellLayout>
      <LegalAcceptanceModal />
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
