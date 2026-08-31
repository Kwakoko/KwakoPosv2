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
} from "./pages/WorkspacePages.js";

const AuthenticatedApp: React.FC = () => {
  const { user, isAuthenticated, isInitializing, error } = useAuth();
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
      default:
        return <DashboardPage onNavigate={handleNavigate} />;
    }
  };

  return (
    <SystemAppShellLayout currentPath={currentPath} onNavigate={handleNavigate}>
      {error && <div className="workspace-card" style={{ borderColor: "var(--danger)" }}>{error}</div>}
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
