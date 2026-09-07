/**
 * KwakoPosv2 — System App Shell Layout
 * ─────────────────────────────────────────────────────────────────────────────
 * Full-fidelity shell: TopBar, ModuleSelector, Sidebar (with nested accordion),
 * BottomNav, SyncPanel, UserPanel, NotificationsPanel, Search modal.
 *
 * CSS: V2 design system classes only — no static inline styles.
 *      Inline styles only for genuinely dynamic values (e.g. CSS variable overrides).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, AlignLeft, Bell, BarChart2, Box, Briefcase, Boxes,
  BookOpen, BedDouble, Building, Car, ChevronDown, ChevronRight,
  Clock, Coins, Cpu, Droplets, Egg, ExternalLink, Fuel, GraduationCap,
  Hammer, HardHat, Hash, Home, LogIn, LogOut, Map,
  MapPin, Moon, Package, Pill, Radio, RefreshCw, Scale,
  Scissors, Search, Shield, ShoppingBag, ShoppingCart, Shirt,
  Sparkles, Sprout, Store, Sun, Tag, Trash2, TrendingUp,
  Truck, Tv, Users, Utensils, Wifi, WifiOff, Wine, Wrench,
  X, Zap, ChefHat, ClipboardList, Gauge, FileText, DollarSign,
  PawPrint, Calendar, Receipt, BarChart, Layers, Check, Eye, RotateCcw,
} from "lucide-react";
import {
  useAuth, useTenant, useBranch, useSync, useTheme, useRbac, useModule, useTranslation,
} from "../context/KwakoPosContexts.js";
import {
  type IndustryModule,
  type ModuleSector,
  MODULE_MANIFESTS,
  MODULE_SECTORS,
  ALL_MODULE_KEYS,
  getModulesBySector,
} from "../modules/moduleRegistry.js";
import { apiFetch } from "../services/apiClient.js";
import { LanguageSelector } from "../components/LanguageSelector.js";
import { ImpersonationModal } from "../components/ImpersonationModal.js";

function translateNavTab(tab: string, t: (k: string) => string): string {
  const map: Record<string, string> = {
    Dashboard: "nav.dashboard",
    POS: "nav.pos",
    Inventory: "nav.inventory",
    Customers: "nav.customers",
    Purchasing: "nav.purchasing",
    Finance: "nav.finance",
    Reports: "nav.reports",
    Settings: "nav.settings",
    "General Settings": "nav.settings",
    "Users & Roles": "nav.usersAndRoles",
    "Super Admin": "nav.superAdmin",
    "Compliance Tower": "nav.complianceTower",
    "Support Control Tower": "nav.supportControlTower",
    Diagnostics: "nav.diagnostics",
    Expenses: "nav.expenses",
    "AI Insights": "nav.aiInsights",
    "Cash Drawer": "nav.cashDrawer",
    Receipts: "nav.receipts",
    Trash: "nav.trash",
    Help: "nav.help",
    "Help & Docs": "nav.help",
  };
  const key = map[tab];
  return key ? t(key) : tab;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ShellLayoutProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  children: React.ReactNode;
}

type SearchResult = { type: string; label: string; id: string; target: string };

// ─── Icon Map ─────────────────────────────────────────────────────────────────
// Map lucide icon names (as strings in the registry) → actual components.
// Used for module cards and sidebar icons.
const ICON_MAP: Record<string, React.ElementType> = {
  Activity, AlertTriangle, AlignLeft, BarChart2, BarChart, Bed: BedDouble, BedDouble, Bell,
  BookOpen, Boxes, Box, Briefcase, Building, Calendar,
  Car, ChefHat, Check, ChevronDown, ChevronRight,
  Clock, ClipboardList, Coins, Cpu, DollarSign,
  Droplets, Egg, ExternalLink, FileText, Fuel,
  Gauge, GraduationCap, Hammer, HardHat, Hash,
  Home, Hotel: BedDouble, Layers, LogIn, LogOut, Map,
  MapPin, Package, PawPrint, Pill, Pills: Pill, Radio, Receipt, RefreshCw,
  Scale, Scissors, Search, Shield, ShoppingBag,
  ShoppingCart, Shirt, Sparkles, Sprout, Store, Tag,
  Trash2, TrendingUp, Truck, Tv, Users, Utensils,
  Wine, Wrench, Wifi, WifiOff, X, Zap,
};

function LucideIcon({ name, size = 16, className }: { name: string; size?: number; className?: string }) {
  const Component = ICON_MAP[name] || Box;
  return <Component size={size} className={className} aria-hidden="true" />;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// ─── PopOut Button ────────────────────────────────────────────────────────────
// V2 native component — UI port only, no legacy window manager dependency.
export const PopOutButton: React.FC<{
  label?: string;
  onClick?: () => void;
  className?: string;
}> = ({ label = "Open in window", onClick, className = "" }) => (
  <button
    className={`popout-btn ${className}`}
    onClick={onClick}
    title={label}
    aria-label={label}
    type="button"
  >
    <ExternalLink size={13} aria-hidden="true" />
  </button>
);

// ─── Module Selector Panel ────────────────────────────────────────────────────

const MODULE_SORT_OPTIONS = [
  { key: "alpha", label: "A–Z" },
  { key: "sector", label: "Sector" },
  { key: "available", label: "Available" },
];

const ModuleSelectorPanel: React.FC<{
  onClose: () => void;
}> = ({ onClose }) => {
  const {
    activeModule, setActiveModule,
    canAccessModule, availableModules, isDevSuperuser,
    searchModules: moduleSearch,
  } = useModule();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeSector, setActiveSector] = useState<ModuleSector | "all">("all");
  const [sortKey, setSortKey] = useState<"alpha" | "sector" | "available">("alpha");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  const modulesByFilter = useMemo(() => {
    let keys = searchQuery.trim() ? moduleSearch(searchQuery) : ALL_MODULE_KEYS;
    if (activeSector !== "all") keys = keys.filter((k) => MODULE_MANIFESTS[k].sector === activeSector);
    if (sortKey === "alpha") keys = [...keys].sort((a, b) => MODULE_MANIFESTS[a].name.localeCompare(MODULE_MANIFESTS[b].name));
    else if (sortKey === "sector") keys = [...keys].sort((a, b) => MODULE_MANIFESTS[a].sector.localeCompare(MODULE_MANIFESTS[b].sector));
    else if (sortKey === "available") {
      const avail = new Set(availableModules);
      keys = [...keys].sort((a, b) => (avail.has(b) ? 1 : 0) - (avail.has(a) ? 1 : 0));
    }
    return keys;
  }, [searchQuery, activeSector, sortKey, availableModules, moduleSearch]);

  const availableSet = new Set(availableModules);

  const sectors = useMemo(() => Object.keys(getModulesBySector()) as ModuleSector[], []);

  const handleSelect = (mod: IndustryModule) => {
    if (!canAccessModule(mod)) return;
    setActiveModule(mod);
    onClose();
  };

  return (
    <div className="dropdown-panel module-panel" role="dialog" aria-label="Module Selector">
      {/* Search */}
      <div className="module-panel-search">
        <Search size={14} className="v2-text-muted" aria-hidden="true" />
        <input
          ref={searchRef}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search modules…"
          aria-label="Search modules"
        />
        {searchQuery && (
          <button className="topbar-icon-btn v2-btn-icon-sm" onClick={() => setSearchQuery("")} aria-label="Clear search">
            <X size={13} />
          </button>
        )}
      </div>

      {/* Sector pills */}
      <div className="module-sector-pills">
        <button
          className={`sector-pill${activeSector === "all" ? " active" : ""}`}
          onClick={() => setActiveSector("all")}
        >
          All
        </button>
        {sectors.map((sector) => (
          <button
            key={sector}
            className={`sector-pill${activeSector === sector ? " active" : ""}`}
            onClick={() => setActiveSector(activeSector === sector ? "all" : sector)}
          >
            {sector}
          </button>
        ))}
      </div>

      {/* Sort */}
      <div className="module-sort-row">
        <span className="v2-text-xs v2-text-muted" style={{ lineHeight: "1.8" }}>Sort:</span>
        {MODULE_SORT_OPTIONS.map((o) => (
          <button
            key={o.key}
            className={`module-sort-btn${sortKey === o.key ? " active" : ""}`}
            onClick={() => setSortKey(o.key as typeof sortKey)}
          >
            {o.label}
          </button>
        ))}
        {isDevSuperuser && (
          <span className="badge v2-badge-accent v2-text-xs" style={{ marginLeft: "auto" }}>DEV</span>
        )}
      </div>

      {/* Module Grid */}
      <div className="module-grid">
        {modulesByFilter.length === 0 ? (
          <div className="v2-empty" style={{ gridColumn: "1 / -1", padding: "1.5rem" }}>
            <p className="v2-text-sm v2-text-muted">No modules match your search.</p>
          </div>
        ) : (
          modulesByFilter.map((mod) => {
            const manifest = MODULE_MANIFESTS[mod];
            const isActive = activeModule === mod;
            const isAccessible = availableSet.has(mod);
            const isLocked = !isAccessible;
            return (
              <button
                key={mod}
                className={`module-card${isActive ? " active" : ""}${isLocked ? " locked" : ""}`}
                onClick={() => handleSelect(mod)}
                title={isLocked ? `${manifest.name} — Upgrade to access` : manifest.name}
                disabled={isLocked}
                type="button"
              >
                <div className="module-card-icon">
                  <LucideIcon name={manifest.icon} size={16} />
                </div>
                <div className="module-card-info">
                  <div className="module-card-name">{manifest.name}</div>
                  <div className="module-card-sector">{manifest.sector}</div>
                </div>
                {isLocked ? (
                  <span className="module-card-badge locked-badge">PRO</span>
                ) : manifest.requiresSubscription ? (
                  <span className="module-card-badge">✓</span>
                ) : null}
                {isActive && (
                  <span className="module-card-check">
                    <Check size={9} />
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

// ─── Sidebar Accordion Item ────────────────────────────────────────────────────

const SidebarAccordion: React.FC<{
  name: string;
  subItems: string[];
  activeTab: string;
  onSelectTab: (tab: string) => void;
  expanded: boolean;
  onToggle: () => void;
  iconName?: string;
}> = ({ name, subItems, activeTab, onSelectTab, expanded, onToggle, iconName }) => {
  const { t } = useTranslation();
  const isParentActive = subItems.includes(activeTab) || activeTab === name;

  return (
    <div>
      <button
        className={`sidebar-item${isParentActive ? " active" : ""}${expanded ? " expanded" : ""}`}
        onClick={onToggle}
        type="button"
        aria-expanded={expanded}
      >
        <span className="sidebar-item-icon">
          <LucideIcon name={iconName || "ChevronRight"} size={14} />
        </span>
        <span className="sidebar-item-label">{translateNavTab(name, t)}</span>
        <ChevronRight size={13} className="sidebar-chevron" aria-hidden="true" />
      </button>
      <div className={`sidebar-subitems${expanded ? " open" : ""}`} aria-hidden={!expanded}>
        {subItems.map((sub) => (
          <button
            key={sub}
            className={`sidebar-subitem${activeTab === sub ? " active" : ""}`}
            onClick={() => onSelectTab(sub)}
            type="button"
          >
            {translateNavTab(sub, t)}
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── Sidebar Icon Map (per tab name heuristics) ───────────────────────────────
function guessTabIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("dashboard")) return "Home";
  if (n.includes("pos") || n.includes("checkout") || n.includes("counter")) return "ShoppingCart";
  if (n.includes("inventory") || n.includes("stock") || n.includes("product")) return "Package";
  if (n.includes("customer") || n.includes("patient") || n.includes("member") || n.includes("client") || n.includes("tenant")) return "Users";
  if (n.includes("purchase") || n.includes("supplier") || n.includes("warehouse")) return "ShoppingBag";
  if (n.includes("report") || n.includes("analytics") || n.includes("stats")) return "BarChart2";
  if (n.includes("setting") || n.includes("config")) return "Zap";
  if (n.includes("expense")) return "DollarSign";
  if (n.includes("receipt") || n.includes("invoice") || n.includes("billing")) return "Receipt";
  if (n.includes("employee") || n.includes("staff") || n.includes("guard") || n.includes("worker")) return "Users";
  if (n.includes("vehicle") || n.includes("fleet") || n.includes("truck")) return "Truck";
  if (n.includes("driver")) return "Car";
  if (n.includes("fuel")) return "Fuel";
  if (n.includes("maintenance")) return "Wrench";
  if (n.includes("case") || n.includes("legal")) return "Scale";
  if (n.includes("calendar") || n.includes("schedule") || n.includes("roster")) return "Calendar";
  if (n.includes("map") || n.includes("gis") || n.includes("route") || n.includes("geofence")) return "Map";
  if (n.includes("task") || n.includes("order") || n.includes("work")) return "ClipboardList";
  if (n.includes("site") || n.includes("location")) return "MapPin";
  if (n.includes("farm") || n.includes("crop") || n.includes("harvest") || n.includes("flock")) return "Sprout";
  if (n.includes("prescription") || n.includes("medicine") || n.includes("drug") || n.includes("pharmacy")) return "Pill";
  if (n.includes("project") || n.includes("engagement")) return "Briefcase";
  if (n.includes("contract") || n.includes("document")) return "FileText";
  if (n.includes("payroll") || n.includes("salary") || n.includes("commission")) return "DollarSign";
  if (n.includes("timesheet") || n.includes("attendance") || n.includes("clock")) return "Clock";
  if (n.includes("ai") || n.includes("insight") || n.includes("assistant")) return "Sparkles";
  return "ChevronRight";
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export const Sidebar: React.FC<{
  currentPath: string;
  onNavigate: (path: string) => void;
  user: { name?: string; role?: string; email?: string } | null;
  canAdminister: boolean;
  isMobile?: boolean;
  onCloseMobile?: () => void;
  onOpenInspectModal?: () => void;
}> = ({ currentPath, onNavigate, user, isMobile = false, onCloseMobile, onOpenInspectModal }) => {
  const { sidebarItems, activeTab, setActiveTab, activeModule, manifest } = useModule();
  const { isSuperAdmin } = useRbac();
  const { impersonatedTenant, stopImpersonation } = useAuth();
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const isSuperAdminUser = Boolean(
    isSuperAdmin || user?.role === "SUPER_ADMIN" || user?.email === "admin@kwakoko.co.tz"
  );

  // Auto-expand the section that contains the active tab
  useEffect(() => {
    setExpanded({});
    for (const item of sidebarItems) {
      if (typeof item !== "string" && item.subItems?.includes(activeTab)) {
        setExpanded({ [item.name]: true });
        break;
      }
    }
  }, [activeTab, sidebarItems]);

  const toggleExpand = useCallback((name: string) => {
    setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));
  }, []);

  const handleTabSelect = useCallback(
    (tab: string) => {
      setActiveTab(tab);
      if (isMobile) onCloseMobile?.();
    },
    [setActiveTab, isMobile, onCloseMobile],
  );

  return (
    <div className="sidebar">
      {isMobile && (
        <div className="v2-flex v2-items-center v2-justify-between" style={{ padding: ".75rem .55rem", borderBottom: "1px solid var(--surface-border)" }}>
          <span className="v2-text-sm v2-font-black v2-text-accent">
            {isSuperAdminUser && !impersonatedTenant ? "Platform Control Tower" : manifest.name}
          </span>
          <button className="topbar-icon-btn" onClick={onCloseMobile} aria-label="Close menu">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="sidebar-inner">
        {/* PLATFORM SUPER ADMIN (Strictly isolated — zero tenant tabs unless impersonating) */}
        {isSuperAdminUser && !impersonatedTenant && (
          <div style={{ marginBottom: "0.85rem" }}>
            <div className="sidebar-section-label" style={{ color: "var(--warning, #f59e0b)", letterSpacing: "0.06em", fontWeight: 800 }}>
              <Shield size={12} style={{ color: "var(--warning, #f59e0b)" }} />
              PLATFORM ROOT CONTROL TOWER
            </div>

            <button
              className={`sidebar-item${currentPath === "/super-admin" || activeTab === "Super Admin" ? " active" : ""}`}
              onClick={() => {
                onNavigate("/super-admin");
                setActiveTab("Super Admin");
                if (isMobile) onCloseMobile?.();
              }}
              type="button"
            >
              <span className="sidebar-item-icon" style={{ color: "var(--warning, #f59e0b)" }}>
                <Shield size={14} />
              </span>
              <span className="sidebar-item-label" style={{ fontWeight: 600 }}>Super Admin CPanel</span>
            </button>

            <button
              className={`sidebar-item${currentPath === "/tenant-onboarding" ? " active" : ""}`}
              onClick={() => {
                onNavigate("/tenant-onboarding");
                if (isMobile) onCloseMobile?.();
              }}
              type="button"
            >
              <span className="sidebar-item-icon">
                <Building size={14} />
              </span>
              <span className="sidebar-item-label">Tenant Fleet Manager</span>
            </button>

            <button
              className={`sidebar-item${currentPath === "/super-admin/support" || activeTab === "Support Control Tower" ? " active" : ""}`}
              onClick={() => {
                onNavigate("/super-admin/support");
                setActiveTab("Support Control Tower");
                if (isMobile) onCloseMobile?.();
              }}
              type="button"
            >
              <span className="sidebar-item-icon">
                <Activity size={14} />
              </span>
              <span className="sidebar-item-label">Support Control Tower</span>
            </button>

            <button
              className={`sidebar-item${currentPath === "/super-admin/compliance" || activeTab === "Compliance Tower" ? " active" : ""}`}
              onClick={() => {
                onNavigate("/super-admin/compliance");
                setActiveTab("Compliance Tower");
                if (isMobile) onCloseMobile?.();
              }}
              type="button"
            >
              <span className="sidebar-item-icon">
                <Scale size={14} />
              </span>
              <span className="sidebar-item-label">Compliance Tower</span>
            </button>

            <button
              className={`sidebar-item${currentPath === "/diagnostics" || activeTab === "Diagnostics" ? " active" : ""}`}
              onClick={() => {
                onNavigate("/diagnostics");
                setActiveTab("Diagnostics");
                if (isMobile) onCloseMobile?.();
              }}
              type="button"
            >
              <span className="sidebar-item-icon">
                <Cpu size={14} />
              </span>
              <span className="sidebar-item-label">Platform Telemetry</span>
            </button>

            <button
              className={`sidebar-item${currentPath === "/super-admin/rollback" || activeTab === "Rollback Center" ? " active" : ""}`}
              onClick={() => {
                onNavigate("/super-admin/rollback");
                setActiveTab("Rollback Center");
                if (isMobile) onCloseMobile?.();
              }}
              type="button"
            >
              <span className="sidebar-item-icon">
                <RotateCcw size={14} />
              </span>
              <span className="sidebar-item-label">Rollback Auth Center</span>
            </button>

            {/* Tenant Isolation notice & explicit inspection launchpad */}
            <div style={{ marginTop: "1.2rem", padding: "0.85rem", borderRadius: "8px", background: "rgba(245, 158, 11, 0.07)", border: "1px dashed rgba(245, 158, 11, 0.3)" }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 800, color: "var(--warning)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>
                Multi-Tenant Isolation
              </div>
              <div style={{ fontSize: "0.73rem", color: "var(--muted)", marginBottom: "0.65rem", lineHeight: 1.35 }}>
                Tenant stores, POS &amp; registers are isolated from the root platform plane.
              </div>
              <button
                className="v2-btn v2-btn-sm"
                style={{
                  width: "100%",
                  fontSize: "0.74rem",
                  fontWeight: 700,
                  background: "linear-gradient(135deg, #f59e0b, #d97706)",
                  color: "#0f172a",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.35rem",
                  cursor: "pointer",
                  borderRadius: "6px",
                  padding: "0.4rem",
                }}
                onClick={() => {
                  onOpenInspectModal?.();
                  if (isMobile) onCloseMobile?.();
                }}
                type="button"
              >
                <Eye size={13} />
                <span>Inspect Tenant Workspace...</span>
              </button>
            </div>
          </div>
        )}

        {/* TENANT IMPERSONATION ACTIVE (Super Admin inspecting specific tenant) */}
        {isSuperAdminUser && impersonatedTenant && (
          <div style={{ marginBottom: "0.85rem", padding: "0.75rem", borderRadius: "8px", background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.3)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--warning)", fontSize: "0.7rem", fontWeight: 800 }}>
              <Shield size={12} />
              <span>TENANT AUDIT INSPECTION</span>
            </div>
            <div style={{ fontWeight: 800, fontSize: "0.84rem", color: "var(--text)", marginTop: "0.25rem" }}>
              {impersonatedTenant.tenantName}
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: "0.1rem" }}>
              Branch: {impersonatedTenant.branchName}
            </div>
            <button
              className="v2-btn v2-btn-sm"
              style={{
                width: "100%",
                marginTop: "0.6rem",
                fontSize: "0.72rem",
                fontWeight: 700,
                background: "var(--warning)",
                color: "#0f172a",
                border: "none",
                borderRadius: "6px",
                padding: "0.32rem",
                cursor: "pointer",
              }}
              onClick={async () => {
                await stopImpersonation();
                onNavigate("/super-admin");
                if (isMobile) onCloseMobile?.();
              }}
              type="button"
            >
              Exit Inspection &amp; Return to CPanel →
            </button>
          </div>
        )}

        {/* TENANT STORE MODULE TABS (Visible to Tenant Users, OR Super Admin during active tenant inspection) */}
        {(!isSuperAdminUser || Boolean(impersonatedTenant)) && (
          <>
            <div className="sidebar-section-label">
              <LucideIcon name={manifest.icon} size={11} />
              {isSuperAdminUser ? `Inspecting Store (${activeModule})` : activeModule}
            </div>

            {sidebarItems.map((item, i) => {
              if (typeof item === "string") {
                const isActive = activeTab === item;
                return (
                  <button
                    key={`${item}-${i}`}
                    className={`sidebar-item${isActive ? " active" : ""}`}
                    onClick={() => handleTabSelect(item)}
                    type="button"
                  >
                    <span className="sidebar-item-icon">
                      <LucideIcon name={guessTabIcon(item)} size={14} />
                    </span>
                    <span className="sidebar-item-label">{translateNavTab(item, t)}</span>
                  </button>
                );
              } else {
                return (
                  <SidebarAccordion
                    key={`${item.name}-${i}`}
                    name={item.name}
                    subItems={item.subItems || []}
                    activeTab={activeTab}
                    onSelectTab={handleTabSelect}
                    expanded={!!expanded[item.name]}
                    onToggle={() => toggleExpand(item.name)}
                    iconName={guessTabIcon(item.name)}
                  />
                );
              }
            })}
          </>
        )}
      </div>

      {/* User card */}
      {user && (
        <div className="sidebar-user-card">
          <div className="sidebar-user-avatar">{getInitials(user.name || "?")}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sidebar-user-name">{user.name}</div>
            <div className="sidebar-user-role">{user.role}</div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Bottom Nav ───────────────────────────────────────────────────────────────

export const BottomNav: React.FC = () => {
  const { bottomNavItems, activeTab, setActiveTab } = useModule();
  const { t } = useTranslation();

  return (
    <nav className="bottom-nav" aria-label="Primary mobile navigation">
      {bottomNavItems.map((item) => (
        <button
          key={item.tab}
          className={`bottom-nav-item${activeTab === item.tab ? " active" : ""}`}
          onClick={() => setActiveTab(item.tab)}
          type="button"
          aria-label={translateNavTab(item.label, t)}
          aria-current={activeTab === item.tab ? "page" : undefined}
        >
          <span className="bnav-icon">
            <LucideIcon name={item.icon} size={20} />
          </span>
          <span className="bnav-label">{translateNavTab(item.label, t)}</span>
        </button>
      ))}
    </nav>
  );
};

// ─── App Version Footer ────────────────────────────────────────────────────────

export const AppVersionFooter: React.FC<{
  appVersion?: string;
  gitSha?: string;
  isOnline: boolean;
  onNavigate?: (path: string) => void;
}> = ({ appVersion, gitSha, isOnline, onNavigate }) => {
  const { activeModule } = useModule();
  const navigate = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    } else {
      window.history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  };

  return (
    <footer>
      <span>KwakoPos</span>
      <span className="footer-dot">·</span>
      <span>{appVersion || "v2.12.5"}</span>
      {gitSha && (
        <>
          <span className="footer-dot">·</span>
          <span className="v2-mono">{gitSha.slice(0, 8)}</span>
        </>
      )}
      <span className="footer-dot">·</span>
      <span className="footer-status">
        <span className={`footer-status-dot${isOnline ? "" : " offline"}`} />
        {isOnline ? "Connected" : "Offline"}
      </span>
      <span className="footer-dot">·</span>
      <span className="v2-text-muted">{activeModule}</span>
      <span className="footer-dot">·</span>
      <button type="button" onClick={() => navigate("/privacy")} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, textDecoration: "underline" }}>Privacy</button>
      <span className="footer-dot">·</span>
      <button type="button" onClick={() => navigate("/legal")} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, textDecoration: "underline" }}>Data Protection</button>
      <span className="footer-dot">·</span>
      <button type="button" onClick={() => navigate("/legal")} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, textDecoration: "underline" }}>Terms</button>
      <span className="footer-dot">·</span>
      <button type="button" onClick={() => navigate("/legal")} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, textDecoration: "underline" }}>License</button>
      <span className="footer-dot">·</span>
      <button type="button" onClick={() => navigate("/legal")} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, textDecoration: "underline" }}>Cookies</button>
      <span className="footer-dot">·</span>
      <button type="button" onClick={() => navigate("/legal")} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, textDecoration: "underline" }}>Security</button>
      <span style={{ marginLeft: "auto" }} className="v2-text-muted">{new Date().getFullYear()} ©</span>
    </footer>
  );
};

// ─── Sync Dropdown Panel ──────────────────────────────────────────────────────

const SyncPanel: React.FC<{ isOnline: boolean; pending: number; onSync: () => void; onClose: () => void }> = ({
  isOnline, pending, onSync, onClose,
}) => (
  <div className="dropdown-panel sync-panel">
    <div className="dropdown-header">
      Sync Status
      <button className="topbar-icon-btn" onClick={onClose} aria-label="Close sync panel"><X size={13} /></button>
    </div>
    <div className="v2-p-4 v2-space-y-4">
      <div className="v2-flex v2-items-center v2-gap-3">
        {isOnline
          ? <Wifi size={16} className="v2-text-success" />
          : <WifiOff size={16} className="v2-text-warning" />
        }
        <span className="v2-text-sm">{isOnline ? "Online — server reachable" : "Offline — local mode"}</span>
      </div>
      <div className="v2-flex v2-items-center v2-gap-3">
        <span className="badge v2-badge-warning" style={{ minWidth: 0 }}>{pending}</span>
        <span className="v2-text-sm v2-text-muted">Pending changes in outbox</span>
      </div>
      <button
        className="btn v2-btn-primary v2-w-full"
        onClick={onSync}
        disabled={!isOnline || pending === 0}
        type="button"
      >
        <RefreshCw size={14} aria-hidden="true" />
        Sync Now
      </button>
    </div>
  </div>
);

// ─── Notifications Panel (Separated: Super Admin vs Tenants) ──────────────────

export interface ShellNotification {
  id: string;
  scope: "SUPER_ADMIN" | "TENANT";
  category: "FLEET" | "INCIDENT" | "SECURITY" | "SUPPORT" | "INVENTORY" | "POS" | "SYNC" | "SYSTEM";
  severity: "CRITICAL" | "WARNING" | "INFO";
  title: string;
  description: string;
  timestamp: string;
  timeAgo: string;
  actionPath?: string;
  actionLabel?: string;
  read?: boolean;
}

const SUPER_ADMIN_FALLBACK_NOTIFICATIONS: ShellNotification[] = [
  {
    id: "sa-fleet-bravados",
    scope: "SUPER_ADMIN",
    category: "FLEET",
    severity: "INFO",
    title: "Tenant Fleet: Bravados PUB",
    description: "Status: ACTIVE • Core bar, pos, inventory entitlements registered in cloud DB.",
    timestamp: new Date().toISOString(),
    timeAgo: "5 min ago",
    actionPath: "/tenant-onboarding",
    actionLabel: "View Fleet",
  },
  {
    id: "sa-incident-sync",
    scope: "SUPER_ADMIN",
    category: "INCIDENT",
    severity: "CRITICAL",
    title: "Autonomous Signal: Sync Failures Monitor",
    description: "Real-time background scanner operating across multi-tenant fleet.",
    timestamp: new Date().toISOString(),
    timeAgo: "15 min ago",
    actionPath: "/super-admin/support",
    actionLabel: "Support Tower",
  },
  {
    id: "sa-sec-compliance",
    scope: "SUPER_ADMIN",
    category: "SECURITY",
    severity: "WARNING",
    title: "Super Admin Step-Up Shield Active",
    description: "Multi-factor authentication & step-up policies enforced for platform controls.",
    timestamp: new Date().toISOString(),
    timeAgo: "Active",
    actionPath: "/super-admin/compliance",
    actionLabel: "Compliance",
  },
  {
    id: "sa-telemetry-mig",
    scope: "SUPER_ADMIN",
    category: "SYSTEM",
    severity: "INFO",
    title: "Cluster Migrations 0001-0005 Verified",
    description: "Support operations, idempotency & fleet tables verified in cloud DB.",
    timestamp: new Date().toISOString(),
    timeAgo: "Healthy",
    actionPath: "/diagnostics",
    actionLabel: "Telemetry",
  },
];

const TENANT_FALLBACK_NOTIFICATIONS: ShellNotification[] = [
  {
    id: "tn-stock-alert",
    scope: "TENANT",
    category: "INVENTORY",
    severity: "WARNING",
    title: "Low Stock Alert: Panadol 500mg",
    description: "8 units remaining in branch inventory, below reorder threshold (10 units).",
    timestamp: new Date().toISOString(),
    timeAgo: "2 min ago",
    actionPath: "/inventory",
    actionLabel: "Restock",
  },
  {
    id: "tn-sync-ledger",
    scope: "TENANT",
    category: "SYNC",
    severity: "INFO",
    title: "Branch Ledger Synchronized",
    description: "All local offline transactions pushed and verified by cloud ledger.",
    timestamp: new Date().toISOString(),
    timeAgo: "20 min ago",
    actionPath: "/pos",
    actionLabel: "Sync Status",
  },
  {
    id: "tn-new-cust",
    scope: "TENANT",
    category: "POS",
    severity: "INFO",
    title: "New Customer: John Mbeki",
    description: "Customer profile registered and available on POS terminals.",
    timestamp: new Date().toISOString(),
    timeAgo: "1 hr ago",
    actionPath: "/customers",
    actionLabel: "View Customer",
  },
  {
    id: "tn-cash-reconcile",
    scope: "TENANT",
    category: "POS",
    severity: "INFO",
    title: "Register Float & Session Active",
    description: "Opening float verified. Cash drawer ready for transactions.",
    timestamp: new Date().toISOString(),
    timeAgo: "2 hr ago",
    actionPath: "/pos",
    actionLabel: "Register",
  },
];

const NotificationsPanel: React.FC<{
  onClose: () => void;
  onNavigate: (path: string) => void;
  isSuperAdminUser: boolean;
  impersonatedTenant?: { tenantId: string; tenantName: string; branchName?: string } | null;
  currentTenantName?: string | null;
  currentBranchName?: string | null;
  onUnreadCountChange?: (count: number) => void;
}> = ({
  onClose,
  onNavigate,
  isSuperAdminUser,
  impersonatedTenant,
  currentTenantName,
  currentBranchName,
  onUnreadCountChange,
}) => {
  const [activeScope, setActiveScope] = useState<"SUPER_ADMIN" | "TENANT">(
    isSuperAdminUser && !impersonatedTenant ? "SUPER_ADMIN" : "TENANT"
  );
  const [activeCategory, setActiveCategory] = useState<string>("ALL");
  const [notifications, setNotifications] = useState<ShellNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("kwakopos_read_notifications");
      return stored ? new Set(JSON.parse(stored)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  // Fetch notifications from API with fallback
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const fetchNotifications = async () => {
      try {
        const scopeParam = activeScope === "SUPER_ADMIN" ? "super-admin" : "tenant";
        const res = await apiFetch<any>(`/api/v1/notifications?scope=${scopeParam}`);
        if (isMounted && res?.data?.notifications && Array.isArray(res.data.notifications)) {
          setNotifications(res.data.notifications);
        } else if (isMounted) {
          setNotifications(activeScope === "SUPER_ADMIN" ? SUPER_ADMIN_FALLBACK_NOTIFICATIONS : TENANT_FALLBACK_NOTIFICATIONS);
        }
      } catch {
        if (isMounted) {
          setNotifications(activeScope === "SUPER_ADMIN" ? SUPER_ADMIN_FALLBACK_NOTIFICATIONS : TENANT_FALLBACK_NOTIFICATIONS);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchNotifications();
    return () => { isMounted = false; };
  }, [activeScope]);

  // Update parent unread count
  useEffect(() => {
    const unread = notifications.filter((n) => !readIds.has(n.id)).length;
    onUnreadCountChange?.(unread);
  }, [notifications, readIds, onUnreadCountChange]);

  const markAllRead = () => {
    const updated = new Set(readIds);
    notifications.forEach((n) => updated.add(n.id));
    setReadIds(updated);
    try {
      localStorage.setItem("kwakopos_read_notifications", JSON.stringify(Array.from(updated)));
    } catch {
      // localStorage fallback
    }
  };

  const handleNotificationClick = (item: ShellNotification) => {
    const updated = new Set(readIds);
    updated.add(item.id);
    setReadIds(updated);
    try {
      localStorage.setItem("kwakopos_read_notifications", JSON.stringify(Array.from(updated)));
    } catch {
      // localStorage fallback
    }
    if (item.actionPath) {
      onNavigate(item.actionPath);
      onClose();
    }
  };

  // Filter notifications by category
  const filtered = useMemo(() => {
    if (activeCategory === "ALL") return notifications;
    return notifications.filter((n) => n.category === activeCategory);
  }, [notifications, activeCategory]);

  const unreadCount = filtered.filter((n) => !readIds.has(n.id)).length;

  const categories = activeScope === "SUPER_ADMIN"
    ? ["ALL", "FLEET", "INCIDENT", "SECURITY", "SUPPORT"]
    : ["ALL", "INVENTORY", "POS", "SYNC", "SUPPORT"];

  return (
    <div className="dropdown-panel notif-panel" role="dialog" aria-label="Notifications">
      {/* Header */}
      <div className="dropdown-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", minWidth: 0 }}>
          {activeScope === "SUPER_ADMIN" ? (
            <Shield size={14} style={{ color: "var(--warning)", flexShrink: 0 }} />
          ) : (
            <Store size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
          )}
          <span className="v2-truncate" style={{ fontWeight: 800, fontSize: "0.82rem" }}>
            {activeScope === "SUPER_ADMIN" ? "Platform Control Tower" : `Store (${currentBranchName || currentTenantName || "Branch"})`}
          </span>
          {unreadCount > 0 && (
            <span
              className="notif-scope-badge"
              style={{
                background: activeScope === "SUPER_ADMIN" ? "rgba(245, 158, 11, 0.2)" : "rgba(59, 130, 246, 0.2)",
                color: activeScope === "SUPER_ADMIN" ? "var(--warning)" : "var(--accent)",
                flexShrink: 0,
              }}
            >
              {unreadCount} NEW
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", flexShrink: 0 }}>
          {unreadCount > 0 && (
            <button
              className="topbar-icon-btn v2-btn-icon-sm"
              onClick={markAllRead}
              title="Mark all as read"
              aria-label="Mark all as read"
              type="button"
            >
              <Check size={13} />
            </button>
          )}
          <button className="topbar-icon-btn" onClick={onClose} aria-label="Close notifications" type="button">
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Scope Switcher: only shown if Super Admin is inspecting a specific Tenant */}
      {isSuperAdminUser && impersonatedTenant && (
        <div style={{ display: "flex", background: "var(--surface-2)", padding: "3px", borderBottom: "1px solid var(--surface-border)" }}>
          <button
            type="button"
            className={`notif-tab-btn ${activeScope === "SUPER_ADMIN" ? "active super-admin" : ""}`}
            style={{ flex: 1, textAlign: "center", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "4px" }}
            onClick={() => { setActiveScope("SUPER_ADMIN"); setActiveCategory("ALL"); }}
          >
            <Shield size={12} />
            <span>Root Platform</span>
          </button>
          <button
            type="button"
            className={`notif-tab-btn ${activeScope === "TENANT" ? "active" : ""}`}
            style={{ flex: 1, textAlign: "center", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "4px" }}
            onClick={() => { setActiveScope("TENANT"); setActiveCategory("ALL"); }}
          >
            <Store size={12} />
            <span className="v2-truncate" style={{ maxWidth: 120 }}>{impersonatedTenant.tenantName || "Inspected Store"}</span>
          </button>
        </div>
      )}

      {/* Category Tabs */}
      <div className="notif-tabs">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`notif-tab-btn ${activeScope === "SUPER_ADMIN" ? "super-admin" : ""} ${activeCategory === cat ? "active" : ""}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat === "ALL" ? "All" : cat.charAt(0) + cat.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Notification List */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: "180px", maxHeight: "320px" }}>
        {loading ? (
          <div className="v2-empty" style={{ padding: "2rem" }}>
            <RefreshCw size={20} className="v2-animate-spin v2-text-muted" />
            <p className="v2-text-xs v2-text-muted" style={{ marginTop: "0.5rem" }}>Loading alerts...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="v2-empty" style={{ padding: "2rem" }}>
            <Check size={24} style={{ color: "var(--success)", opacity: 0.8 }} />
            <p className="v2-text-sm v2-font-bold" style={{ marginTop: "0.5rem" }}>All caught up!</p>
            <p className="v2-text-xs v2-text-muted" style={{ marginTop: "0.2rem" }}>
              {activeScope === "SUPER_ADMIN" ? "No active platform alerts in this category." : "No active store alerts in this category."}
            </p>
          </div>
        ) : (
          filtered.map((item) => {
            const isRead = readIds.has(item.id);
            const iconName = item.category === "FLEET" ? "Building"
              : item.category === "INCIDENT" ? "AlertTriangle"
              : item.category === "SECURITY" ? "Shield"
              : item.category === "SUPPORT" ? "Activity"
              : item.category === "INVENTORY" ? "Package"
              : item.category === "SYNC" ? "RefreshCw"
              : item.category === "POS" ? "ShoppingCart"
              : "Bell";

            const iconBg = item.severity === "CRITICAL" ? "rgba(239, 68, 68, 0.15)"
              : item.severity === "WARNING" ? "rgba(245, 158, 11, 0.15)"
              : "rgba(59, 130, 246, 0.15)";
            const iconColor = item.severity === "CRITICAL" ? "var(--danger, #ef4444)"
              : item.severity === "WARNING" ? "var(--warning, #f59e0b)"
              : "var(--accent, #3b82f6)";

            return (
              <div
                key={item.id}
                className="notif-item"
                style={{ opacity: isRead ? 0.65 : 1, position: "relative" }}
                onClick={() => handleNotificationClick(item)}
              >
                <div className="notif-icon" style={{ background: iconBg, color: iconColor }}>
                  <LucideIcon name={iconName} size={15} />
                </div>
                <div className="notif-body">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.4rem" }}>
                    <div className="notif-title" style={{ fontWeight: isRead ? 600 : 800 }}>{item.title}</div>
                    {!isRead && (
                      <span className={`notif-unread-dot ${item.severity === "CRITICAL" ? "danger" : item.severity === "WARNING" ? "warning" : ""}`} />
                    )}
                  </div>
                  <div className="notif-desc">{item.description}</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "0.3rem" }}>
                    <span className="notif-time">{item.timeAgo}</span>
                    {item.actionLabel && (
                      <span className="notif-action-btn">
                        {item.actionLabel} →
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: "0.5rem 0.8rem", borderTop: "1px solid var(--surface-border)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface-1)" }}>
        <button
          type="button"
          className="v2-btn v2-btn-ghost v2-text-xs v2-text-muted"
          onClick={markAllRead}
          disabled={unreadCount === 0}
        >
          Mark all as read
        </button>
        <button
          type="button"
          className="v2-btn v2-btn-ghost v2-text-xs"
          style={{ color: activeScope === "SUPER_ADMIN" ? "var(--warning)" : "var(--accent)", fontWeight: 700 }}
          onClick={() => {
            if (activeScope === "SUPER_ADMIN") {
              onNavigate("/super-admin/support");
            } else {
              onNavigate("/help");
            }
            onClose();
          }}
        >
          {activeScope === "SUPER_ADMIN" ? "Support Tower →" : "Help & Docs →"}
        </button>
      </div>
    </div>
  );
};

// ─── User Dropdown Panel ───────────────────────────────────────────────────────

const UserPanel: React.FC<{
  user: { name: string; email: string; role: string } | null;
  onLogout: () => void;
  onNavigate: (path: string) => void;
  onClose: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}> = ({ user, onLogout, onNavigate, onClose, theme, onToggleTheme }) => {
  const { t } = useTranslation();
  const { isSuperAdmin } = useRbac();
  return (
    <div className="dropdown-panel user-panel">
      <div className="user-panel-header">
        <div className="user-panel-avatar">{user ? getInitials(user.name) : "?"}</div>
        <div>
          <div className="user-panel-name">{user?.name || "Unknown"}</div>
          <div className="user-panel-role">{user?.role}</div>
          <div className="user-panel-email">{user?.email}</div>
        </div>
      </div>

      <button className="dropdown-item" onClick={() => { onNavigate("/settings"); onClose(); }} type="button">
        <Zap size={14} aria-hidden="true" />
        {t("nav.settings")}
      </button>
      <button className="dropdown-item" onClick={() => { onNavigate("/users"); onClose(); }} type="button">
        <Users size={14} aria-hidden="true" />
        {t("nav.usersAndRoles")}
      </button>
      <button className="dropdown-item" onClick={() => { onNavigate("/diagnostics"); onClose(); }} type="button">
        <Activity size={14} aria-hidden="true" />
        {t("nav.diagnostics")}
      </button>
      <button className="dropdown-item" onClick={onToggleTheme} type="button">
        {theme === "dark" ? <Sun size={14} aria-hidden="true" /> : <Moon size={14} aria-hidden="true" />}
        {theme === "dark" ? t("nav.lightMode") : t("nav.darkMode")}
      </button>
      {isSuperAdmin && (
        <>
          <div className="dropdown-divider" />
          <button className="dropdown-item" onClick={() => { onNavigate("/super-admin"); onClose(); }} type="button">
            <Shield size={14} aria-hidden="true" style={{ color: "var(--primary)" }} />
            {t("nav.superAdmin")}
          </button>
          <button className="dropdown-item" onClick={() => { onNavigate("/super-admin/compliance"); onClose(); }} type="button">
            <Scale size={14} aria-hidden="true" style={{ color: "var(--primary)" }} />
            {t("nav.complianceTower")}
          </button>
          <button className="dropdown-item" onClick={() => { onNavigate("/super-admin/support"); onClose(); }} type="button">
            <Activity size={14} aria-hidden="true" style={{ color: "var(--primary)" }} />
            {t("nav.supportControlTower")}
          </button>
          <button className="dropdown-item" onClick={() => { onNavigate("/super-admin/rollback"); onClose(); }} type="button">
            <RotateCcw size={14} aria-hidden="true" style={{ color: "var(--primary)" }} />
            Rollback Auth Center
          </button>
        </>
      )}
      <div className="dropdown-divider" />
      <button
        id="topbar-signout-btn"
        className="dropdown-item danger"
        onClick={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
          await onLogout();
        }}
        type="button"
      >
        <LogOut size={14} aria-hidden="true" />
        {t("nav.signOut")}
      </button>
    </div>
  );
};

// ─── Tenant / Branch Switcher ──────────────────────────────────────────────────

const TenantBranchPanel: React.FC<{
  currentTenantId: string | null;
  currentBranchId: string | null;
  availableTenants: { id: string; name: string }[];
  availableBranches: { id: string; name: string }[];
  onSwitchTenant: (id: string) => void;
  onSwitchBranch: (id: string) => void;
  onClose: () => void;
}> = ({ currentTenantId, currentBranchId, availableTenants, availableBranches, onSwitchTenant, onSwitchBranch, onClose }) => {
  const { t } = useTranslation();
  return (
    <div className="dropdown-panel" style={{ width: 260 }}>
      <div className="dropdown-header">
        {t("nav.tenant")}
        <button className="topbar-icon-btn" onClick={onClose} aria-label="Close panel"><X size={13} /></button>
      </div>
      {availableTenants.map((tenant) => (
        <button
          key={tenant.id}
          className={`dropdown-item${currentTenantId === tenant.id ? " active" : ""}`}
          onClick={() => { onSwitchTenant(tenant.id); onClose(); }}
          type="button"
        >
          <Building size={14} aria-hidden="true" />
          <span className="v2-truncate">{tenant.name}</span>
          {currentTenantId === tenant.id && <Check size={12} aria-hidden="true" />}
        </button>
      ))}
      <div className="dropdown-divider" />
      <div className="dropdown-header" style={{ paddingTop: ".4rem" }}>{t("nav.branch")}</div>
      {availableBranches.map((b) => (
        <button
          key={b.id}
          className={`dropdown-item${currentBranchId === b.id ? " active" : ""}`}
          onClick={() => { onSwitchBranch(b.id); onClose(); }}
          type="button"
        >
          <MapPin size={14} aria-hidden="true" />
          <span className="v2-truncate">{b.name}</span>
          {currentBranchId === b.id && <Check size={12} aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
};

// ─── TopBar ────────────────────────────────────────────────────────────────────

export const TopBar: React.FC<{
  currentTenantId: string | null;
  currentBranchId: string | null;
  currentTenantName: string | null;
  currentBranchName: string | null;
  availableTenants: { id: string; name: string }[];
  availableBranches: { id: string; name: string }[];
  onSwitchTenant: (id: string) => void;
  onSwitchBranch: (id: string) => void;
  isOnline: boolean;
  pendingOutboxCount: number;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onNavigate: (path: string) => void;
  onOpenSearch: () => void;
  onLogout: () => void;
  user: { name: string; email: string; role: string } | null;
  onOpenMobileSidebar: () => void;
  onSync: () => void;
  onOpenInspectModal?: () => void;
}> = ({
  currentTenantId, currentBranchId, currentTenantName, currentBranchName,
  availableTenants, availableBranches, onSwitchTenant, onSwitchBranch,
  isOnline, pendingOutboxCount, theme, onToggleTheme, onNavigate,
  onOpenSearch, onLogout, user, onOpenMobileSidebar, onSync, onOpenInspectModal,
}) => {
  const { activeModule, manifest } = useModule();
  const { isSuperAdmin } = useRbac();
  const { impersonatedTenant, stopImpersonation } = useAuth();
  const { t } = useTranslation();
  const [showModule, setShowModule] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState<number>(0);

  const isSuperAdminUser = Boolean(
    isSuperAdmin || user?.role === "SUPER_ADMIN" || user?.email === "admin@kwakoko.co.tz"
  );

  const closeAll = () => {
    setShowModule(false);
    setShowSync(false);
    setShowUser(false);
    setShowNotif(false);
    setShowContext(false);
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") closeAll(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Close on outside click
  useEffect(() => {
    const anyOpen = showModule || showSync || showUser || showNotif || showContext;
    if (!anyOpen) return;
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        !target.closest(".dropdown-panel") &&
        !target.closest(".user-avatar") &&
        !target.closest(".module-selector-btn") &&
        !target.closest(".sync-status-pill") &&
        !target.closest(".topbar-icon-btn") &&
        !target.closest(".context-selector-btn")
      ) {
        closeAll();
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [showModule, showSync, showUser, showNotif, showContext]);

  const togglePanel = (name: "module" | "sync" | "user" | "notif" | "context") => {
    const map = { module: setShowModule, sync: setShowSync, user: setShowUser, notif: setShowNotif, context: setShowContext };
    const curr = { module: showModule, sync: showSync, user: showUser, notif: showNotif, context: showContext };
    closeAll();
    if (!curr[name]) map[name](true);
  };

  const branchDisplay = currentBranchName || currentBranchId || "Branch";
  const tenantDisplay = currentTenantName || currentTenantId || "Tenant";

  return (
    <>
      {/* Overlay to close any open panel */}
      {(showModule || showSync || showUser || showNotif || showContext) && (
        <div className="dropdown-overlay" onClick={closeAll} aria-hidden="true" />
      )}

      <header className="topbar" role="banner">
        {/* Mobile menu button */}
        <button
          className="topbar-icon-btn"
          onClick={onOpenMobileSidebar}
          aria-label="Open navigation menu"
          style={{ display: "none" }}
          id="topbar-mobile-menu-btn"
        >
          <AlignLeft size={18} />
        </button>

        {/* Brand */}
        <a
          href="/"
          className="topbar-brand"
          onClick={(e) => {
            e.preventDefault();
            if (isSuperAdminUser && !impersonatedTenant) {
              onNavigate("/super-admin");
            } else {
              onNavigate("/");
            }
          }}
          aria-label="KwakoPos home"
        >
          <div className="topbar-brand-logo" aria-hidden="true">K</div>
          <span>KwakoPos</span>
        </a>

        {isSuperAdminUser && !impersonatedTenant && (
          <button
            type="button"
            onClick={() => onNavigate("/super-admin")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.22rem 0.65rem",
              borderRadius: "9999px",
              fontSize: "0.72rem",
              fontWeight: 700,
              background: "rgba(245, 158, 11, 0.16)",
              color: "#f59e0b",
              border: "1px solid rgba(245, 158, 11, 0.35)",
              cursor: "pointer",
              marginLeft: "0.5rem",
            }}
            title="Super Admin Platform Control Tower"
          >
            <Shield size={12} />
            <span>PLATFORM CONTROL TOWER</span>
          </button>
        )}

        {isSuperAdminUser && impersonatedTenant && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.22rem 0.65rem",
              borderRadius: "9999px",
              fontSize: "0.72rem",
              fontWeight: 700,
              background: "rgba(239, 68, 68, 0.18)",
              color: "#f87171",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              marginLeft: "0.5rem",
            }}
          >
            <Shield size={12} />
            <span>INSPECTING: {impersonatedTenant.tenantName || impersonatedTenant.tenantId}</span>
          </div>
        )}

        <div className="topbar-divider" />

        {/* Module selector: Only show store modules if not Super Admin OR if Super Admin is in Impersonation */}
        {(!isSuperAdminUser || impersonatedTenant) ? (
          <div style={{ position: "relative" }}>
            <button
              id="topbar-module-selector"
              className="module-selector-btn"
              onClick={() => togglePanel("module")}
              aria-haspopup="true"
              aria-expanded={showModule}
              type="button"
            >
              <span className="module-icon">
                <LucideIcon name={manifest.icon} size={15} />
              </span>
              <span className="module-name">{manifest.name}</span>
              <ChevronDown size={13} className="chevron" aria-hidden="true" />
            </button>
            {showModule && (
              <ModuleSelectorPanel onClose={() => setShowModule(false)} />
            )}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.78rem", color: "var(--v2-text-secondary, #94a3b8)", fontWeight: 600 }}>
              Platform Control Plane
            </span>
          </div>
        )}

        {/* Search */}
        <button
          className="topbar-search-btn"
          onClick={onOpenSearch}
          aria-label={`${t("common.search")} (${t("nav.searchShortcut")})`}
          type="button"
        >
          <Search size={13} aria-hidden="true" />
          <span>{t("nav.searchPlaceholder")}</span>
          <span className="topbar-search-shortcut">{t("nav.searchShortcut")}</span>
        </button>

        {/* Right actions */}
        <div className="topbar-right">
          {/* Tenant / Branch context or Inspect / Exit Impersonation */}
          {isSuperAdminUser && !impersonatedTenant ? (
            <button
              type="button"
              onClick={onOpenInspectModal}
              className="module-selector-btn"
              style={{
                background: "rgba(59, 130, 246, 0.12)",
                color: "#60a5fa",
                border: "1px solid rgba(59, 130, 246, 0.3)",
                fontWeight: 600,
                fontSize: "0.78rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                cursor: "pointer",
                padding: "0.3rem 0.65rem",
              }}
              title="Inspect Tenant Workspace"
            >
              <Building size={13} />
              <span>Inspect Tenant</span>
            </button>
          ) : isSuperAdminUser && impersonatedTenant ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div
                style={{
                  fontSize: "0.75rem",
                  padding: "0.25rem 0.6rem",
                  borderRadius: "6px",
                  background: "rgba(239, 68, 68, 0.12)",
                  color: "#f87171",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <Building size={12} />
                <span className="v2-truncate" style={{ maxWidth: 140 }}>
                  {impersonatedTenant.tenantName} / {impersonatedTenant.branchName}
                </span>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await stopImpersonation();
                  onNavigate("/super-admin");
                }}
                style={{
                  background: "#ef4444",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  padding: "0.28rem 0.65rem",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                }}
                title="Exit Tenant Inspection & Return to Super Admin CPanel"
              >
                <X size={12} />
                <span>Exit Inspection</span>
              </button>
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              <button
                className="module-selector-btn"
                onClick={() => togglePanel("context")}
                style={{ maxWidth: 180 }}
                aria-haspopup="true"
                aria-expanded={showContext}
                type="button"
                title={`${tenantDisplay} / ${branchDisplay}`}
              >
                <Building size={13} aria-hidden="true" />
                <span className="module-name v2-truncate">{branchDisplay}</span>
                <ChevronDown size={12} className="chevron" aria-hidden="true" />
              </button>
              {showContext && (
                <TenantBranchPanel
                  currentTenantId={currentTenantId}
                  currentBranchId={currentBranchId}
                  availableTenants={availableTenants}
                  availableBranches={availableBranches}
                  onSwitchTenant={onSwitchTenant}
                  onSwitchBranch={onSwitchBranch}
                  onClose={() => setShowContext(false)}
                />
              )}
            </div>
          )}

          {/* Sync status */}
          <div style={{ position: "relative" }}>
            <button
              className={`sync-status-pill${pendingOutboxCount > 0 ? " syncing" : isOnline ? " online" : " offline"}`}
              onClick={() => togglePanel("sync")}
              aria-label={`Sync status: ${isOnline ? "online" : "offline"}, ${pendingOutboxCount} pending`}
              type="button"
            >
              <span className="sync-status-dot" />
              {pendingOutboxCount > 0 ? `${pendingOutboxCount} ${t("nav.queued")}` : isOnline ? t("nav.online") : t("nav.offline")}
            </button>
            {showSync && (
              <SyncPanel
                isOnline={isOnline}
                pending={pendingOutboxCount}
                onSync={onSync}
                onClose={() => setShowSync(false)}
              />
            )}
          </div>

          {/* Notifications */}
          <div style={{ position: "relative" }}>
            <button
              className="topbar-icon-btn"
              onClick={() => togglePanel("notif")}
              aria-label={t("nav.notifications")}
              type="button"
            >
              <Bell size={16} />
              {unreadNotifCount > 0 && (
                <span className={`topbar-badge ${isSuperAdminUser && !impersonatedTenant ? "warning" : "accent"}`}>
                  {unreadNotifCount > 9 ? "9+" : unreadNotifCount}
                </span>
              )}
            </button>
            {showNotif && (
              <NotificationsPanel
                onClose={() => setShowNotif(false)}
                onNavigate={onNavigate}
                isSuperAdminUser={isSuperAdminUser}
                impersonatedTenant={impersonatedTenant}
                currentTenantName={currentTenantName}
                currentBranchName={currentBranchName}
                onUnreadCountChange={setUnreadNotifCount}
              />
            )}
          </div>

          {/* Language selector */}
          <LanguageSelector variant="topbar" />

          {/* Theme toggle */}
          <button
            className="topbar-icon-btn"
            onClick={onToggleTheme}
            aria-label={theme === "dark" ? t("nav.lightMode") : t("nav.darkMode")}
            type="button"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* User avatar */}
          <div style={{ position: "relative" }}>
            <button
              id="topbar-user-btn"
              className="user-avatar"
              onClick={() => togglePanel("user")}
              aria-label={`User menu for ${user?.name || "user"}`}
              aria-haspopup="true"
              aria-expanded={showUser}
              type="button"
            >
              {user ? getInitials(user.name) : "?"}
            </button>
            {showUser && (
              <UserPanel
                user={user}
                onLogout={onLogout}
                onNavigate={onNavigate}
                onClose={() => setShowUser(false)}
                theme={theme}
                onToggleTheme={onToggleTheme}
              />
            )}
          </div>
        </div>
      </header>

      {/* Mobile CSS override to show the menu button */}
      <style>{`
        @media (max-width: 768px) {
          #topbar-mobile-menu-btn { display: flex !important; }
        }
      `}</style>
    </>
  );
};

// ─── Search Modal ─────────────────────────────────────────────────────────────

const SearchModal: React.FC<{
  onClose: () => void;
  onNavigate: (path: string) => void;
}> = ({ onClose, onNavigate }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const handle = window.setTimeout(async () => {
      try {
        const [products, customers] = await Promise.all([
          apiFetch<{ success: boolean; data: Array<{ id: string; name: string; sku: string }> }>(
            `/api/v1/products/search?q=${encodeURIComponent(query)}`),
          apiFetch<{ success: boolean; data: Array<{ id: string; name: string }> }>("/api/v1/customers"),
        ]);
        const q = query.toLowerCase();
        const r: SearchResult[] = [
          ...(products.data || []).slice(0, 5).map((p) => ({
            type: "Product", label: `${p.name} (${p.sku})`, id: p.id, target: "/pos",
          })),
          ...(customers.data || [])
            .filter((c) => c.name.toLowerCase().includes(q))
            .slice(0, 5)
            .map((c) => ({ type: "Customer", label: c.name, id: c.id, target: "/customers" })),
        ];
        setResults(r);
      } catch { setResults([]); }
    }, 180);
    return () => window.clearTimeout(handle);
  }, [query]);

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Search">
      <div className="modal-card search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="v2-flex v2-items-center v2-gap-2" style={{ marginBottom: ".85rem" }}>
          <Search size={16} className="v2-text-muted" aria-hidden="true" />
          <input
            ref={inputRef}
            className="v2-input"
            style={{ border: "none", padding: ".3rem .5rem", fontSize: ".88rem" }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products, customers, modules…"
            aria-label="Search input"
          />
          <button className="topbar-icon-btn" onClick={onClose} aria-label="Close search">
            <X size={15} />
          </button>
        </div>

        {!query.trim() ? (
          <div className="v2-empty v2-p-4">
            <p className="v2-text-sm v2-text-muted">Search is scoped to your V2 session & permissions.</p>
          </div>
        ) : results.length ? (
          results.map((r) => (
            <button
              key={`${r.type}-${r.id}`}
              className="search-result-item"
              onClick={() => { onClose(); onNavigate(r.target); }}
              type="button"
            >
              <span className="search-result-type">{r.type}</span>
              <span className="search-result-label">{r.label}</span>
              <ChevronRight size={13} className="v2-text-muted" aria-hidden="true" />
            </button>
          ))
        ) : (
          <div className="v2-empty v2-p-4">
            <p className="v2-text-sm v2-text-muted">No results found for "{query}".</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── EmptySearch ──────────────────────────────────────────────────────────────
// Kept for backward-compat with any existing consumer.
export const EmptySearch: React.FC<{ message: string }> = ({ message }) => (
  <div className="v2-empty v2-p-4">
    <p className="v2-text-sm v2-text-muted">{message}</p>
  </div>
);

// ─── SystemAppShellLayout ──────────────────────────────────────────────────────

export const SystemAppShellLayout: React.FC<ShellLayoutProps> = ({
  currentPath, onNavigate, children,
}) => {
  const { user, logout, impersonatedTenant, stopImpersonation } = useAuth();
  const { currentTenantId, currentTenantName, availableTenants, switchTenant } = useTenant();
  const { currentBranchId, currentBranchName, availableBranches, switchBranch } = useBranch();
  const { isOnline, pendingOutboxCount, syncOutbox } = useSync();
  const { theme, toggleTheme } = useTheme();
  const { permissions, isSuperAdmin } = useRbac();
  const { isMobileSidebarOpen, setIsMobileSidebarOpen } = useModule();

  const isSuperAdminUser = Boolean(
    isSuperAdmin || user?.role === "SUPER_ADMIN" || user?.email === "admin@kwakoko.co.tz"
  );

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isInspectModalOpen, setIsInspectModalOpen] = useState(false);
  const [release, setRelease] = useState<{ appVersion?: string; gitSha?: string }>({});

  const canAdminister = permissions.includes("*") || permissions.includes("SUPER_ADMIN_OPERATIONS");

  useEffect(() => {
    let alive = true;
    apiFetch<{ appVersion?: string; gitSha?: string; data?: { appVersion?: string; gitSha?: string } }>("/version")
      .then((result) => { if (alive) setRelease(result.data || result); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsSearchOpen(true);
      }
      if (e.key === "Escape") setIsSearchOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const safeSwitchTenant = async (id: string) => {
    try { await switchTenant(id); }
    catch (error) { window.alert(error instanceof Error ? error.message : "Tenant switch denied"); }
  };
  const safeSwitchBranch = async (id: string) => {
    try { await switchBranch(id); }
    catch (error) { window.alert(error instanceof Error ? error.message : "Branch switch denied"); }
  };

  return (
    <div className="kwakopos-app" data-theme={theme}>
      <TopBar
        currentTenantId={currentTenantId}
        currentBranchId={currentBranchId}
        currentTenantName={currentTenantName}
        currentBranchName={currentBranchName}
        availableTenants={availableTenants}
        availableBranches={availableBranches}
        onSwitchTenant={(id) => void safeSwitchTenant(id)}
        onSwitchBranch={(id) => void safeSwitchBranch(id)}
        isOnline={isOnline}
        pendingOutboxCount={pendingOutboxCount}
        theme={theme}
        onToggleTheme={toggleTheme}
        onNavigate={onNavigate}
        onOpenSearch={() => setIsSearchOpen(true)}
        onLogout={async () => {
          try {
            await logout();
          } catch (err) {
            console.warn("Logout error:", err);
          }
          onNavigate("/");
        }}
        user={user ? { name: user.name, email: user.email, role: user.role } : null}
        onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
        onSync={() => void syncOutbox()}
        onOpenInspectModal={() => setIsInspectModalOpen(true)}
      />

      <div className="app-layout">
        {/* Desktop sidebar */}
        <Sidebar
          currentPath={currentPath}
          onNavigate={onNavigate}
          user={user ? { name: user.name, role: user.role, email: user.email } : null}
          canAdminister={canAdminister}
        />

        {/* Mobile sidebar overlay */}
        <div
          className={`sidebar-mobile-overlay${isMobileSidebarOpen ? " open" : ""}`}
          onClick={() => setIsMobileSidebarOpen(false)}
          aria-hidden="true"
        />
        <div className={`sidebar-mobile-drawer${isMobileSidebarOpen ? " open" : ""}`} role="navigation" aria-label="Mobile navigation">
          <Sidebar
            currentPath={currentPath}
            onNavigate={onNavigate}
            user={user ? { name: user.name, role: user.role, email: user.email } : null}
            canAdminister={canAdminister}
            isMobile
            onCloseMobile={() => setIsMobileSidebarOpen(false)}
          />
        </div>

        <main id="app-root" className="main-content" role="main">
          {isSuperAdminUser && impersonatedTenant && (
            <div
              className="impersonation-banner"
              style={{
                background: "linear-gradient(90deg, rgba(239, 68, 68, 0.15), rgba(220, 38, 38, 0.08))",
                border: "1px solid rgba(239, 68, 68, 0.4)",
                borderRadius: "8px",
                padding: "0.6rem 1rem",
                marginBottom: "1rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
                fontSize: "0.82rem",
                color: "#f87171",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <Shield size={18} />
                <span>
                  <strong>TENANT AUDIT &amp; INSPECTION MODE:</strong> You are currently inspecting workspace{" "}
                  <strong>{impersonatedTenant.tenantName || impersonatedTenant.tenantId}</strong> (Branch:{" "}
                  <strong>{impersonatedTenant.branchName || impersonatedTenant.branchId}</strong>).
                  All changes are audited and attributed to Super Admin.
                </span>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await stopImpersonation();
                  onNavigate("/super-admin");
                }}
                style={{
                  background: "#ef4444",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "6px",
                  padding: "0.3rem 0.8rem",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  whiteSpace: "nowrap",
                }}
              >
                <X size={13} />
                <span>Exit Inspection &amp; Return to CPanel</span>
              </button>
            </div>
          )}
          {children}
        </main>
      </div>

      <BottomNav />

      {isSearchOpen && (
        <SearchModal
          onClose={() => setIsSearchOpen(false)}
          onNavigate={onNavigate}
        />
      )}

      <ImpersonationModal
        isOpen={isInspectModalOpen}
        onClose={() => setIsInspectModalOpen(false)}
        onImpersonationStarted={() => {
          onNavigate("/dashboard");
        }}
      />

      <AppVersionFooter
        appVersion={release.appVersion}
        gitSha={release.gitSha}
        isOnline={isOnline}
        onNavigate={onNavigate}
      />
    </div>
  );
};
