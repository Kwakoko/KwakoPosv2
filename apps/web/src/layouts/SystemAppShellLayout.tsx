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
  Activity, AlignLeft, Bell, BarChart2, Box, Briefcase, Boxes,
  BookOpen, BedDouble, Building, Car, ChevronDown, ChevronRight,
  Clock, Coins, Cpu, Droplets, Egg, ExternalLink, Fuel, GraduationCap,
  Hammer, HardHat, Hash, Home, LogIn, LogOut, Map,
  MapPin, Moon, Package, Pill, Radio, RefreshCw, Scale,
  Scissors, Search, Shield, ShoppingBag, ShoppingCart, Shirt,
  Sparkles, Sprout, Store, Sun, Tag, Trash2, TrendingUp,
  Truck, Tv, Users, Utensils, Wifi, WifiOff, Wine, Wrench,
  X, Zap, ChefHat, ClipboardList, Gauge, FileText, DollarSign,
  PawPrint, Calendar, Receipt, BarChart, Layers, Check,
} from "lucide-react";
import {
  useAuth, useTenant, useBranch, useSync, useTheme, useRbac, useModule,
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
  Activity, AlignLeft, BarChart2, BarChart, Bed: BedDouble, BedDouble, Bell,
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
        <span className="sidebar-item-label">{name}</span>
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
            {sub}
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
}> = ({ user, isMobile = false, onCloseMobile }) => {
  const { sidebarItems, activeTab, setActiveTab, activeModule, manifest } = useModule();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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
          <span className="v2-text-sm v2-font-black v2-text-accent">{manifest.name}</span>
          <button className="topbar-icon-btn" onClick={onCloseMobile} aria-label="Close menu">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="sidebar-inner">
        {/* Section label */}
        <div className="sidebar-section-label">
          <LucideIcon name={manifest.icon} size={11} />
          {activeModule}
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
                <span className="sidebar-item-label">{item}</span>
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

  return (
    <nav className="bottom-nav" aria-label="Primary mobile navigation">
      {bottomNavItems.map((item) => (
        <button
          key={item.tab}
          className={`bottom-nav-item${activeTab === item.tab ? " active" : ""}`}
          onClick={() => setActiveTab(item.tab)}
          type="button"
          aria-label={item.label}
          aria-current={activeTab === item.tab ? "page" : undefined}
        >
          <span className="bnav-icon">
            <LucideIcon name={item.icon} size={20} />
          </span>
          <span className="bnav-label">{item.label}</span>
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
}> = ({ appVersion, gitSha, isOnline }) => {
  const { activeModule } = useModule();
  return (
    <footer>
      <span>KwakoPos</span>
      <span className="footer-dot">·</span>
      <span>{appVersion || "v2.5.0"}</span>
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

// ─── Notifications Panel ──────────────────────────────────────────────────────

const DEMO_NOTIFICATIONS = [
  { icon: "Package", iconBg: "var(--warning-muted)", iconColor: "var(--warning)", title: "Low Stock Alert", desc: "Panadol 500mg is below reorder level (8 units).", time: "2 min ago" },
  { icon: "Users", iconBg: "var(--info-muted)", iconColor: "var(--info)", title: "New Customer", desc: "John Mbeki registered via self-service portal.", time: "18 min ago" },
  { icon: "RefreshCw", iconBg: "var(--success-muted)", iconColor: "var(--success)", title: "Sync Complete", desc: "All 34 pending changes pushed to server.", time: "1 hr ago" },
];

const NotificationsPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="dropdown-panel notif-panel">
    <div className="dropdown-header">
      Notifications
      <button className="topbar-icon-btn" onClick={onClose} aria-label="Close notifications"><X size={13} /></button>
    </div>
    {DEMO_NOTIFICATIONS.map((n, i) => (
      <div key={i} className="notif-item">
        <div className="notif-icon" style={{ background: n.iconBg, color: n.iconColor }}>
          <LucideIcon name={n.icon} size={14} />
        </div>
        <div className="notif-body">
          <div className="notif-title">{n.title}</div>
          <div className="notif-desc">{n.desc}</div>
          <div className="notif-time">{n.time}</div>
        </div>
      </div>
    ))}
    <div className="v2-p-2 v2-flex v2-justify-center">
      <button className="v2-btn v2-btn-ghost v2-text-sm v2-text-accent" type="button">View all notifications</button>
    </div>
  </div>
);

// ─── User Dropdown Panel ───────────────────────────────────────────────────────

const UserPanel: React.FC<{
  user: { name: string; email: string; role: string } | null;
  onLogout: () => void;
  onNavigate: (path: string) => void;
  onClose: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}> = ({ user, onLogout, onNavigate, onClose, theme, onToggleTheme }) => (
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
      My Settings
    </button>
    <button className="dropdown-item" onClick={() => { onNavigate("/users"); onClose(); }} type="button">
      <Users size={14} aria-hidden="true" />
      Users & Roles
    </button>
    <button className="dropdown-item" onClick={() => { onNavigate("/diagnostics"); onClose(); }} type="button">
      <Activity size={14} aria-hidden="true" />
      Diagnostics
    </button>
    <button className="dropdown-item" onClick={onToggleTheme} type="button">
      {theme === "dark" ? <Sun size={14} aria-hidden="true" /> : <Moon size={14} aria-hidden="true" />}
      {theme === "dark" ? "Light Mode" : "Dark Mode"}
    </button>
    <div className="dropdown-divider" />
    <button className="dropdown-item danger" onClick={() => { onLogout(); onClose(); }} type="button">
      <LogOut size={14} aria-hidden="true" />
      Sign Out
    </button>
  </div>
);

// ─── Tenant / Branch Switcher ──────────────────────────────────────────────────

const TenantBranchPanel: React.FC<{
  currentTenantId: string | null;
  currentBranchId: string | null;
  availableTenants: { id: string; name: string }[];
  availableBranches: { id: string; name: string }[];
  onSwitchTenant: (id: string) => void;
  onSwitchBranch: (id: string) => void;
  onClose: () => void;
}> = ({ currentTenantId, currentBranchId, availableTenants, availableBranches, onSwitchTenant, onSwitchBranch, onClose }) => (
  <div className="dropdown-panel" style={{ width: 260 }}>
    <div className="dropdown-header">
      Tenant
      <button className="topbar-icon-btn" onClick={onClose} aria-label="Close panel"><X size={13} /></button>
    </div>
    {availableTenants.map((t) => (
      <button
        key={t.id}
        className={`dropdown-item${currentTenantId === t.id ? " active" : ""}`}
        onClick={() => { onSwitchTenant(t.id); onClose(); }}
        type="button"
      >
        <Building size={14} aria-hidden="true" />
        <span className="v2-truncate">{t.name}</span>
        {currentTenantId === t.id && <Check size={12} aria-hidden="true" />}
      </button>
    ))}
    <div className="dropdown-divider" />
    <div className="dropdown-header" style={{ paddingTop: ".4rem" }}>Branch</div>
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
}> = ({
  currentTenantId, currentBranchId, currentTenantName, currentBranchName,
  availableTenants, availableBranches, onSwitchTenant, onSwitchBranch,
  isOnline, pendingOutboxCount, theme, onToggleTheme, onNavigate,
  onOpenSearch, onLogout, user, onOpenMobileSidebar, onSync,
}) => {
  const { activeModule, manifest } = useModule();
  const [showModule, setShowModule] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [showContext, setShowContext] = useState(false);

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
          onClick={(e) => { e.preventDefault(); onNavigate("/"); }}
          aria-label="KwakoPos home"
        >
          <div className="topbar-brand-logo" aria-hidden="true">K</div>
          <span>KwakoPos</span>
        </a>

        <div className="topbar-divider" />

        {/* Module selector */}
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

        {/* Search */}
        <button
          className="topbar-search-btn"
          onClick={onOpenSearch}
          aria-label="Search (Ctrl+K)"
          type="button"
        >
          <Search size={13} aria-hidden="true" />
          <span>Search…</span>
          <span className="topbar-search-shortcut">Ctrl+K</span>
        </button>

        {/* Right actions */}
        <div className="topbar-right">
          {/* Tenant / Branch context */}
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

          {/* Sync status */}
          <div style={{ position: "relative" }}>
            <button
              className={`sync-status-pill${pendingOutboxCount > 0 ? " syncing" : isOnline ? " online" : " offline"}`}
              onClick={() => togglePanel("sync")}
              aria-label={`Sync status: ${isOnline ? "online" : "offline"}, ${pendingOutboxCount} pending`}
              type="button"
            >
              <span className="sync-status-dot" />
              {pendingOutboxCount > 0 ? `${pendingOutboxCount} queued` : isOnline ? "Online" : "Offline"}
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
              aria-label="Notifications"
              type="button"
            >
              <Bell size={16} />
              {/* Demo badge */}
              <span className="topbar-badge warning">3</span>
            </button>
            {showNotif && <NotificationsPanel onClose={() => setShowNotif(false)} />}
          </div>

          {/* Theme toggle */}
          <button
            className="topbar-icon-btn"
            onClick={onToggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
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
  const { user, logout } = useAuth();
  const { currentTenantId, currentTenantName, availableTenants, switchTenant } = useTenant();
  const { currentBranchId, currentBranchName, availableBranches, switchBranch } = useBranch();
  const { isOnline, pendingOutboxCount, syncOutbox } = useSync();
  const { theme, toggleTheme } = useTheme();
  const { permissions } = useRbac();
  const { isMobileSidebarOpen, setIsMobileSidebarOpen } = useModule();

  const [isSearchOpen, setIsSearchOpen] = useState(false);
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
        onLogout={() => void logout()}
        user={user ? { name: user.name, email: user.email, role: user.role } : null}
        onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
        onSync={() => void syncOutbox()}
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

      <AppVersionFooter
        appVersion={release.appVersion}
        gitSha={release.gitSha}
        isOnline={isOnline}
      />
    </div>
  );
};
