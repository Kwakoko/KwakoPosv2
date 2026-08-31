import React, { useEffect, useState } from "react";
import { KwakoPosProvider, useAuth } from "./context/KwakoPosContexts.js";
import { LoginPage } from "./pages/LoginPage.js";
import { SystemAppShellLayout } from "./layouts/SystemAppShellLayout.js";
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

const AuthenticatedApp: React.FC = () => {
  const { user, isAuthenticated, isInitializing } = useAuth();
  const [currentPath, setCurrentPath] = useState(
    typeof window !== "undefined" ? window.location.pathname : "/",
  );

  useEffect(() => {
    const onPop = () => setCurrentPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (isInitializing) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "1.5rem" }}>
        <div className="workspace-card">Loading secure KwakoPos workspace…</div>
      </main>
    );
  }

  if (!isAuthenticated || !user) {
    return <LoginPage onAuthenticated={() => setCurrentPath("/")} />;
  }

  const handleNavigate = (path: string) => {
    setCurrentPath(path);
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
  };

  const renderView = () => {
    switch (currentPath) {
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
        return <SuperAdminPage />;
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
      default:
        return <DashboardPage onNavigate={handleNavigate} />;
    }
  };

  return (
    <SystemAppShellLayout currentPath={currentPath} onNavigate={handleNavigate}>
      {renderView()}
    </SystemAppShellLayout>
  );
};

export const App: React.FC = () => (
  <KwakoPosProvider>
    <AuthenticatedApp />
  </KwakoPosProvider>
);

export default App;
