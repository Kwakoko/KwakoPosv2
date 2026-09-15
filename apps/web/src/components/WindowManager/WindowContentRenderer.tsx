/**
 * KwakoPosv2 — Window Content Renderer
 * ──────────────────────────────────────
 * Maps window routes/modules to their authoritative view components.
 */
import React, { Component, lazy, Suspense, type ReactNode } from "react";
import type { KwakokoWindow } from "../../types/windowManager.js";
import { AlertTriangle, RefreshCw } from "lucide-react";
const lazyWorkspacePage = (key: string) =>
  lazy<React.ComponentType<any>>(() => import("../../pages/WorkspacePages.js").then((module: any) => ({ default: module[key] as React.ComponentType<any> })));

const DashboardPage = lazyWorkspacePage("DashboardPage");
const PosPage = lazyWorkspacePage("PosPage");
const InventoryPage = lazyWorkspacePage("InventoryPage");
const CustomersPage = lazyWorkspacePage("CustomersPage");
const PurchasingPage = lazyWorkspacePage("PurchasingPage");
const FinancePage = lazyWorkspacePage("FinancePage");
const ReportsPage = lazyWorkspacePage("ReportsPage");
const SettingsPage = lazyWorkspacePage("SettingsPage");
const UsersPage = lazyWorkspacePage("UsersPage");
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
const SuperAdminPage = lazyWorkspacePage("SuperAdminPage");
const VerticalCommandCenterPage = lazyWorkspacePage("VerticalCommandCenterPage");
import { SuperAdminCertificationStudio } from "../SuperAdminCertificationStudio.js";
import { SuperAdminComplianceTowerPage } from "../../pages/SuperAdminComplianceTowerPage.js";
import { SuperAdminRollbackCenterPage } from "../../pages/SuperAdminRollbackCenterPage.js";

interface ErrorBoundaryProps {
  windowId: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class WindowErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error(`[WindowContentRenderer] Crash in window ${this.props.windowId}:`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: "2rem", textAlign: "center", gap: "0.75rem" }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: "rgba(239, 68, 68, 0.15)", color: "var(--color-danger, #ef4444)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <AlertTriangle size={22} />
          </div>
          <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600 }}>Unable to render module window</h4>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary)", maxWidth: "300px" }}>
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <button
            className="btn btn-secondary"
            onClick={() => this.setState({ hasError: false })}
            style={{ fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <RefreshCw size={12} /> Reload Content
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const WindowContentRenderer: React.FC<{ window: KwakokoWindow }> = ({ window: win }) => {
  const key = (win.route || win.moduleId || "").toLowerCase();

  const renderModule = () => {
    if (key.includes("pos") || key.includes("checkout")) return <PosPage />;
    if (key.includes("inventory") || key.includes("stock")) return <InventoryPage />;
    if (key.includes("customer")) return <CustomersPage />;
    if (key.includes("cash") || key.includes("drawer")) return <CashDrawerPage />;
    if (key.includes("receipt")) return <ReceiptsPage />;
    if (key.includes("trash")) return <TrashPage />;
    if (key.includes("consult") || key.includes("swot") || key.includes("okr")) return <BusinessConsultingPage />;
    if (key.includes("persist") || key.includes("test")) return <PersistenceTestPage />;
    if (key.includes("purchase") || key.includes("purchasing")) return <PurchasingPage />;
    if (key.includes("finance")) return <FinancePage />;
    if (key.includes("report")) return <ReportsPage />;
    if (key.includes("expense")) return <ExpensesPage />;
    if (key.includes("ai")) return <AiPage />;
    if (key.includes("setting")) return <SettingsPage />;
    if (key.includes("user")) return <UsersPage />;
    if (key.includes("diagnostic")) return <DiagnosticsPage />;
    if (key.includes("law")) return <LawFirmPage />;
    if (key.includes("pharmacy")) return <PharmacyPage />;
    if (key.includes("certification") || key.includes("kpcp")) return <SuperAdminCertificationStudio />;
    if (key.includes("compliance")) return <SuperAdminComplianceTowerPage />;
    if (key.includes("rollback")) return <SuperAdminRollbackCenterPage />;
    if (key.includes("super-admin") || key.includes("superadmin")) return <SuperAdminPage />;
    if (key.includes("restaurant") || key.includes("kitchen")) return <VerticalCommandCenterPage moduleType="restaurant" />;
    if (key.includes("electronics") || key.includes("imei")) return <VerticalCommandCenterPage moduleType="electronics" />;
    if (key.includes("hardware") || key.includes("timber")) return <VerticalCommandCenterPage moduleType="hardware" />;
    if (key.includes("microfinance")) return <VerticalCommandCenterPage moduleType="microfinance" />;
    if (key.includes("sacco") || key.includes("vicoba")) return <VerticalCommandCenterPage moduleType="sacco" />;
    if (key.includes("garage") || key.includes("mechanic")) return <VerticalCommandCenterPage moduleType="garage" />;
    if (key.includes("construction") || key.includes("boq")) return <VerticalCommandCenterPage moduleType="construction" />;
    if (key.includes("wholesale") || key.includes("carton")) return <VerticalCommandCenterPage moduleType="wholesale" />;
    if (key.includes("bar") || key.includes("lounge")) return <VerticalCommandCenterPage moduleType="bar" />;
    if (key.includes("real-estate") || key.includes("lease")) return <VerticalCommandCenterPage moduleType="real-estate" />;
    if (key.includes("poultry") || key.includes("livestock")) return <PoultryLivestockPage />;
    if (key.includes("fleet")) return <FleetPage />;
    if (key.includes("workforce")) return <WorkforcePage />;
    if (key.includes("telecom")) return <TelecomPage />;
    if (key.includes("help")) return <HelpPage />;
    return <DashboardPage />;
  };

  return (
    <WindowErrorBoundary windowId={win.id}>
      <div style={{ height: "100%", overflowY: "auto", padding: "0.75rem" }}>
        <Suspense fallback={<div style={{ minHeight: 180, display: "grid", placeItems: "center" }}>Loading module?</div>}>
          {renderModule()}
        </Suspense>
      </div>
    </WindowErrorBoundary>
  );
};
