import React, { useEffect, useState } from "react";
import { KwakoPosProvider, useAuth, useModule } from "./context/KwakoPosContexts.js";
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
  LawFirmPage,
  PharmacyPage,
  PoultryLivestockPage,
  FleetPage,
  WorkforcePage,
  TelecomPage,
  HelpPage,
} from "./pages/WorkspacePages.js";

const TAB_TO_PATH: Record<string, string> = {
  Dashboard: "/",
  POS: "/pos",
  Inventory: "/inventory",
  Customers: "/customers",
  Purchasing: "/purchasing",
  Finance: "/finance",
  Reports: "/reports",
  Settings: "/settings",
  "General Settings": "/settings",
  "Users & Roles": "/users",
  "Super Admin": "/super-admin",
  "Support Control Tower": "/super-admin/support",
  "Compliance Tower": "/super-admin/compliance",
  "Rollback Center": "/super-admin/rollback",
  "Rollback Auth Center": "/super-admin/rollback",
  Diagnostics: "/diagnostics",
  Expenses: "/expenses",
  "AI Insights": "/ai",
  "Cash Drawer": "/cash-drawer",
  Receipts: "/receipts",
  Trash: "/trash",
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

const PATH_TO_TAB: Record<string, string> = Object.fromEntries(
  Object.entries(TAB_TO_PATH).map(([tab, path]) => [path, tab])
);

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
  const [currentPath, setCurrentPath] = useState(
    typeof window !== "undefined" ? window.location.pathname : "/"
  );
  const [hasEnteredWorkspace, setHasEnteredWorkspace] = useState(false);

  const isSuperAdmin = Boolean(
    user && (user.role === "SUPER_ADMIN" || user.email === "admin@kwakoko.co.tz")
  );

  useEffect(() => {
    const onPop = () => {
      const path = window.location.pathname;
      setCurrentPath(path);
      if (PATH_TO_TAB[path]) {
        setActiveTab(PATH_TO_TAB[path]);
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
    setCurrentPath(path);
    if (typeof window !== "undefined" && window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
  }, [activeTab, currentPath, isSuperAdmin, impersonatedTenant]);

  const handleNavigate = (path: string) => {
    setCurrentPath(path);
    if (typeof window !== "undefined" && window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
    if (PATH_TO_TAB[path]) {
      setActiveTab(PATH_TO_TAB[path]);
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

  // Stay on WorkspaceLoadingScreen until user explicitly clicks Enter
  if (!hasEnteredWorkspace) {
    if (currentPath === "/legal") {
      return <LegalCenterPage onNavigate={handleNavigate} />;
    }
    if (currentPath === "/privacy") {
      return <PrivacyCenterPage onNavigate={handleNavigate} />;
    }
    return (
      <WorkspaceLoadingScreen
        onForceContinue={() => {
          dismissLoading?.();
          setHasEnteredWorkspace(true);
        }}
      />
    );
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
        return <PosPage onNavigate={handleNavigate} />;
      case "/inventory":
        return <InventoryPage />;
      case "/customers":
        return <CustomersPage />;
      case "/purchasing":
        return <PurchasingPage />;
      case "/finance":
        return <FinancePage />;
      case "/reports":
        return <ReportsPage />;
      case "/settings":
        return <SettingsPage />;
      case "/users":
        return <UsersPage />;
      case "/super-admin":
        return <SuperAdminPage onNavigate={handleNavigate} />;
      case "/super-admin/support":
        return <SuperAdminSupportControlTowerPage />;
      case "/diagnostics":
        return <DiagnosticsPage />;
      case "/expenses":
        return <ExpensesPage />;
      case "/ai":
        return <AiPage />;
      case "/cash-drawer":
        return <CashDrawerPage />;
      case "/receipts":
        return <ReceiptsPage />;
      case "/trash":
        return <TrashPage />;
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
        {renderView()}
      </SystemAppShellLayout>
      <LegalAcceptanceModal />
    </>
  );
};

export const App: React.FC = () => (
  <KwakoPosProvider>
    <AuthenticatedApp />
  </KwakoPosProvider>
);

export default App;
