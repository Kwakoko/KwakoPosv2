/**
 * KwakoPos 2.0 Master Application Root Component
 * Hosts KwakoPosProvider pipeline, client router, and SystemAppShellLayout.
 */

import React, { useState, useEffect } from "react";
import { KwakoPosProvider } from "./context/KwakoPosContexts.js";
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
  DiagnosticsPage
} from "./pages/WorkspacePages.js";

export const AppContent: React.FC = () => {
  const [currentPath, setCurrentPath] = useState(
    typeof window !== "undefined" ? window.location.pathname : "/"
  );

  useEffect(() => {
    const onPop = () => setCurrentPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const handleNavigate = (path: string) => {
    setCurrentPath(path);
    if (typeof window !== "undefined" && window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
  };

  const renderView = () => {
    if (currentPath === "/" || currentPath === "/dashboard") {
      return <DashboardPage onNavigate={handleNavigate} />;
    }
    if (currentPath === "/pos") {
      return <PosPage onNavigate={handleNavigate} />;
    }
    if (currentPath === "/inventory") {
      return <InventoryPage />;
    }
    if (currentPath === "/customers") {
      return <CustomersPage />;
    }
    if (currentPath === "/purchasing") {
      return <PurchasingPage />;
    }
    if (currentPath === "/finance") {
      return <FinancePage />;
    }
    if (currentPath === "/reports") {
      return <ReportsPage />;
    }
    if (currentPath === "/settings") {
      return <SettingsPage />;
    }
    if (currentPath === "/users") {
      return <UsersPage />;
    }
    if (currentPath === "/super-admin") {
      return <SuperAdminPage />;
    }
    if (currentPath === "/diagnostics" || currentPath.startsWith("/modules")) {
      return <DiagnosticsPage />;
    }
    return <DashboardPage onNavigate={handleNavigate} />;
  };

  return (
    <SystemAppShellLayout currentPath={currentPath} onNavigate={handleNavigate}>
      {renderView()}
    </SystemAppShellLayout>
  );
};

export const App: React.FC = () => (
  <KwakoPosProvider>
    <AppContent />
  </KwakoPosProvider>
);

export default App;
