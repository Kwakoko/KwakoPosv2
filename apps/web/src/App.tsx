import React, { useEffect, useState } from "react";
import { KwakoPosProvider, useAuth, useModule } from "./context/KwakoPosContexts.js";
import { LoginPage } from "./pages/LoginPage.js";
import { SystemAppShellLayout } from "./layouts/SystemAppShellLayout.js";
import { TenantOnboardingPage } from "./pages/TenantOnboardingPage.js";
import {
  DashboardPage, PosPage, InventoryPage, CustomersPage,
  PurchasingPage, FinancePage, ReportsPage, SettingsPage,
  UsersPage, SuperAdminPage, DiagnosticsPage, ExpensesPage,
  AiPage, CashDrawerPage, ReceiptsPage, TrashPage,
  LawFirmPage, PharmacyPage, PoultryLivestockPage,
  FleetPage, WorkforcePage, TelecomPage, HelpPage,
} from "./pages/WorkspacePages.js";

const TAB_TO_PATH: Record<string, string> = {
  "Dashboard": "/", "POS": "/pos", "Inventory": "/inventory", "Customers": "/customers", "Purchasing": "/purchasing", "Finance": "/finance", "Reports": "/reports", "Settings": "/settings", "General Settings": "/settings", "Users & Roles": "/users", "Super Admin": "/super-admin", "Diagnostics": "/diagnostics", "Expenses": "/expenses", "AI Insights": "/ai", "Cash Drawer": "/cash-drawer", "Receipts": "/receipts", "Trash": "/trash", "Law Firm": "/law-firm", "Pharmacy": "/pharmacy", "Poultry & Livestock": "/poultry-livestock", "Fleet Management": "/fleet", "Workforce": "/workforce", "Telecom": "/telecom", "Help": "/help",
};
const PATH_TO_TAB: Record<string, string> = Object.fromEntries(Object.entries(TAB_TO_PATH).map(([tab, path]) => [path, tab]));

const AuthenticatedApp: React.FC = () => {
  const { user, isAuthenticated, isInitializing } = useAuth();
  const { activeTab, setActiveTab } = useModule();
  const [currentPath, setCurrentPath] = useState(typeof window !== "undefined" ? window.location.pathname : "/");

  useEffect(() => {
    const onPop = () => {
      const path = window.location.pathname;
      setCurrentPath(path);
      const tab = PATH_TO_TAB[path] || "Dashboard";
      setActiveTab(tab);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [setActiveTab]);

  useEffect(() => {
    if (currentPath === "/tenant-onboarding") return;
    const path = TAB_TO_PATH[activeTab] || "/";
    setCurrentPath(path);
    if (typeof window !== "undefined" && window.location.pathname !== path) window.history.pushState({}, "", path);
  }, [activeTab, currentPath]);

  if (isInitializing) return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg)" }}><div className="v2-text-sm v2-text-muted v2-animate-pulse">Loading KwakoPos workspace…</div></main>;
  if (!isAuthenticated || !user) return <LoginPage onAuthenticated={() => setActiveTab("Dashboard")} />;

  const handleNavigate = (path: string) => {
    if (path === "/tenant-onboarding") {
      setCurrentPath(path);
      window.history.pushState({}, "", path);
      return;
    }
    const tab = PATH_TO_TAB[path] || "Dashboard";
    setActiveTab(tab);
  };

  const renderView = () => {
    switch (currentPath) {
      case "/tenant-onboarding": return <TenantOnboardingPage />;
      case "/":
      case "/dashboard": return <DashboardPage onNavigate={handleNavigate} />;
      case "/pos": return <PosPage onNavigate={handleNavigate} />;
      case "/inventory": return <InventoryPage />;
      case "/customers": return <CustomersPage />;
      case "/purchasing": return <PurchasingPage />;
      case "/finance": return <FinancePage />;
      case "/reports": return <ReportsPage />;
      case "/settings": return <SettingsPage />;
      case "/users": return <UsersPage />;
      case "/super-admin": return <SuperAdminPage />;
      case "/diagnostics": return <DiagnosticsPage />;
      case "/expenses": return <ExpensesPage />;
      case "/ai": return <AiPage />;
      case "/cash-drawer": return <CashDrawerPage />;
      case "/receipts": return <ReceiptsPage />;
      case "/trash": return <TrashPage />;
      case "/law-firm": return <LawFirmPage />;
      case "/pharmacy": return <PharmacyPage />;
      case "/poultry-livestock": return <PoultryLivestockPage />;
      case "/fleet": return <FleetPage />;
      case "/workforce": return <WorkforcePage />;
      case "/telecom": return <TelecomPage />;
      case "/help": return <HelpPage />;
      default: return <DashboardPage onNavigate={handleNavigate} />;
    }
  };

  return <SystemAppShellLayout currentPath={currentPath} onNavigate={handleNavigate}>{renderView()}</SystemAppShellLayout>;
};

export const App: React.FC = () => <KwakoPosProvider><AuthenticatedApp /></KwakoPosProvider>;
export default App;
