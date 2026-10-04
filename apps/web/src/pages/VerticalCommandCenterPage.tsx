/**
 * KwakoPos V2 — Specialized Vertical Industry Command Centers
 * ─────────────────────────────────────────────────────────────────────────────
 * Authoritative UI host mounting rich industry vertical command centers:
 *  - Restaurant / KDS (renderRestaurantDashboard)
 *  - Electronics & IMEI Tracking (renderElectronicsDashboard)
 *  - Hardware & Building Materials (renderHardwareDashboard)
 *  - Microfinance & Micro-Loans (renderMicrofinanceDashboard)
 *  - SACCO / VICOBA Cooperative (renderSaccoVicobaDashboard)
 *  - Auto Garage & Job Cards (renderGarageCommandCenterDashboard)
 *  - Construction & Project Stages (renderConstructionCommandCenterDashboard)
 *  - Wholesale & Bulk Carton Logistics (renderWholesaleCommandCenterDashboard)
 *  - Bar, Pub & Lounge Operations (renderBarLoungeCommandCenterDashboard)
 *  - Real Estate & Property NOI (renderRealEstateCommandCenterDashboard)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useMemo } from "react";
import { useModule } from "../context/KwakoPosContexts.js";
import {
  Utensils, Cpu, Hammer, Coins, Landmark, Wrench, Building,
  Package, Wine, Building2, Layers
} from "lucide-react";
import { renderRestaurantDashboard } from "../restaurantDashboard.js";
import { renderElectronicsDashboard } from "../electronicsDashboard.js";
import { renderHardwareDashboard } from "../hardwareDashboard.js";
import { renderMicrofinanceDashboard } from "../microfinanceDashboard.js";
import { renderSaccoVicobaDashboard } from "../saccoVicobaDashboard.js";
import { renderGarageCommandCenterDashboard } from "../garageCommandCenter.js";
import { renderConstructionCommandCenterDashboard } from "../constructionCommandCenter.js";
import { renderWholesaleCommandCenterDashboard } from "../wholesaleCommandCenter.js";
import { renderBarLoungeCommandCenterDashboard } from "../barLoungeCommandCenter.js";
import { renderRealEstateCommandCenterDashboard } from "../realEstateCommandCenter.js";

export type VerticalModuleType =
  | "restaurant"
  | "electronics"
  | "hardware"
  | "microfinance"
  | "sacco"
  | "garage"
  | "construction"
  | "wholesale"
  | "bar"
  | "real-estate";

export interface VerticalCommandCenterPageProps {
  moduleType: VerticalModuleType;
  activeTab?: string;
  onNavigate?: (path: string) => void;
}

const MODULE_META: Record<VerticalModuleType, { title: string; subtitle: string; icon: React.ReactNode; color: string }> = {
  restaurant: {
    title: "Restaurant & Kitchen Operations (KDS)",
    subtitle: "Real-time kitchen orders, table coordinates, and recipe BOM",
    icon: <Utensils size={20} />,
    color: "#f97316",
  },
  electronics: {
    title: "Electronics & High-Value Serial Matrix",
    subtitle: "IMEI, serial lifecycle tracking, warranty claims & battery health",
    icon: <Cpu size={20} />,
    color: "#38bdf8",
  },
  hardware: {
    title: "Hardware Store & Dimensional Materials",
    subtitle: "Bulk cutting, sheet conversion, dimensional units & contractor tabs",
    icon: <Hammer size={20} />,
    color: "#f59e0b",
  },
  microfinance: {
    title: "Microfinance & Loan Portfolio Center",
    subtitle: "Collateral custody, PAR30 risk tracking, and repayment waterfalls",
    icon: <Coins size={20} />,
    color: "#10b981",
  },
  sacco: {
    title: "SACCO / VICOBA Cooperative Banking",
    subtitle: "Member share capital, group savings, and mutual guarantee funds",
    icon: <Landmark size={20} />,
    color: "#8b5cf6",
  },
  garage: {
    title: "Auto Garage & Mechanic Job Cards",
    subtitle: "Vehicle repair stages, spare parts assignment, and labor costing",
    icon: <Wrench size={20} />,
    color: "#eab308",
  },
  construction: {
    title: "Construction Project & Site Management",
    subtitle: "Bill of quantities (BOQ), subcontractor labor, and site progress",
    icon: <Building size={20} />,
    color: "#06b6d4",
  },
  wholesale: {
    title: "Wholesale & Carton Distribution Hub",
    subtitle: "Tiered wholesale break-pack matrix, pallet allocation & van deliveries",
    icon: <Package size={20} />,
    color: "#6366f1",
  },
  bar: {
    title: "Bar, Pub & Lounge Operations",
    subtitle: "Open drink tabs, bottle pour variance, wastage, and happy hour tiers",
    icon: <Wine size={20} />,
    color: "#ec4899",
  },
  "real-estate": {
    title: "Real Estate Portfolio & Lease Management",
    subtitle: "Unit leases, service charge reconciliation, arrears, and NOI yields",
    icon: <Building2 size={20} />,
    color: "#14b8a6",
  },
};

export const VerticalCommandCenterPage: React.FC<VerticalCommandCenterPageProps> = ({
  moduleType,
  activeTab,
  onNavigate,
}) => {
  const { manifest, setActiveTab } = useModule();
  const meta = MODULE_META[moduleType] || MODULE_META.restaurant;
  const activeSubmenu = useMemo(() => {
    if (!activeTab) return null;
    return manifest.sidebar.find(
      (item) => typeof item !== "string" && Boolean(item.subItems?.includes(activeTab)),
    );
  }, [manifest, activeTab]);
  const horizontalTabs = activeSubmenu && typeof activeSubmenu !== "string"
    ? activeSubmenu.subItems || []
    : [];

  const getDashboardHtml = (): string => {
    switch (moduleType) {
      case "restaurant":
        return renderRestaurantDashboard();
      case "electronics":
        return renderElectronicsDashboard();
      case "hardware":
        return renderHardwareDashboard();
      case "microfinance":
        return renderMicrofinanceDashboard();
      case "sacco":
        return renderSaccoVicobaDashboard();
      case "garage":
        return renderGarageCommandCenterDashboard();
      case "construction":
        return renderConstructionCommandCenterDashboard();
      case "wholesale":
        return renderWholesaleCommandCenterDashboard();
      case "bar":
        return renderBarLoungeCommandCenterDashboard({
          totalTabsCount: 38,
          totalBeverageRevenueUsd: 14820,
          totalFoodRevenueUsd: 3200,
          totalRecipeCogsUsd: 4600,
          grossMarginUsd: 10400,
          grossMarginPct: 70.2,
          totalWastageCostUsd: 280,
        });
      case "real-estate":
        return renderRealEstateCommandCenterDashboard({
          grossMarginPct: 78.9,
          totalPropertiesCount: 14,
          totalUnitsCount: 182,
          averageOccupancyRatePct: 94.5,
          totalRentalRevenueUsd: 68500,
          totalOperatingExpensesUsd: 14400,
          totalMaintenanceCostUsd: 3200,
          totalDepositsHeldUsd: 28000,
          totalOverdueRentUsd: 4200,
          netOperatingIncomeNoiUsd: 54100,
        });
      default:
        return renderRestaurantDashboard();
    }
  };

  return (
    <div className="v2-animate-page-enter" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Module Workspace Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
          background: "var(--v2-bg-card, #1e293b)",
          border: "1px solid var(--v2-border, #334155)",
          borderRadius: "0.85rem",
          padding: "1rem 1.5rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
          <div
            style={{
              width: "2.8rem",
              height: "2.8rem",
              borderRadius: "0.65rem",
              background: `${meta.color}20`,
              color: meta.color,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {meta.icon}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "var(--v2-text, #f8fafc)" }}>
                {meta.title}
              </h1>
              <span
                style={{
                  background: `${meta.color}25`,
                  color: meta.color,
                  padding: "0.15rem 0.5rem",
                  borderRadius: "9999px",
                  fontSize: "10px",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                SPECIALIZED VERTICAL
              </span>
            </div>
            <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--v2-text-muted, #94a3b8)", marginTop: "0.2rem" }}>
              {meta.subtitle}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button
            onClick={() => onNavigate?.("/pos")}
            className="v2-btn v2-btn-secondary v2-btn-sm"
            type="button"
          >
            Switch to Fast POS
          </button>
          <button
            onClick={() => onNavigate?.("/inventory")}
            className="v2-btn v2-btn-secondary v2-btn-sm"
            type="button"
          >
            Catalog Stock
          </button>
        </div>
      </div>

      {/* Shared sidebar <-> horizontal submenu navigation */}
      {horizontalTabs.length > 0 && (
        <div className="v2-card v2-p-2">
          <div className="v2-flex v2-items-center v2-gap-2" style={{ overflowX: "auto", paddingBottom: "2px" }}>
            {horizontalTabs.map((tab) => {
              const isActive = tab === activeTab;
              return (
                <button
                  key={tab}
                  type="button"
                  className={`v2-btn v2-btn-sm ${isActive ? "v2-btn-primary" : "v2-btn-ghost"}`}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={`Open ${tab} command center`}
                  onClick={() => setActiveTab(tab)}
                  style={{ whiteSpace: "nowrap" }}
                >
                  {tab}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Rendered Live Dashboard Content */}
      <div
        style={{
          borderRadius: "0.85rem",
          overflow: "hidden",
          border: "1px solid var(--v2-border, #334155)",
          boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
        }}
        dangerouslySetInnerHTML={{ __html: getDashboardHtml() }}
      />
    </div>
  );
};

export default VerticalCommandCenterPage;
