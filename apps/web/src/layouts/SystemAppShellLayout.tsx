import React, { useEffect, useState } from "react";
import { useAuth, useTenant, useBranch, useSync, useTheme, useRbac } from "../context/KwakoPosContexts.js";
import { apiFetch } from "../services/apiClient.js";

export interface ShellLayoutProps { currentPath: string; onNavigate: (path: string) => void; children: React.ReactNode; }
type SearchResult = { type: string; label: string; id: string; target: string };

export const TopBar: React.FC<{
  currentTenantId: string | null;
  currentBranchId: string | null;
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
  onOpenCommands: () => void;
  onLogout: () => void;
}> = ({
  currentTenantId,
  currentBranchId,
  availableTenants,
  availableBranches,
  onSwitchTenant,
  onSwitchBranch,
  isOnline,
  pendingOutboxCount,
  theme,
  onToggleTheme,
  onNavigate,
  onOpenSearch,
  onOpenCommands,
  onLogout,
}) => (
  <header>
    <a href="/" className="header-brand" onClick={(e) => { e.preventDefault(); onNavigate("/"); }}>KwakoPos 2.0</a>
    <div className="header-context">
      <button className="context-selector" onClick={onOpenSearch}>🔍 Search (Ctrl+K)</button>
      <button className="context-selector" onClick={onOpenCommands}>⚡ Commands</button>
      <select className="context-selector" value={currentTenantId || ""} onChange={(e) => onSwitchTenant(e.target.value)}>
        {availableTenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <select className="context-selector" value={currentBranchId || ""} onChange={(e) => onSwitchBranch(e.target.value)}>
        {availableBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      <span className={`badge ${isOnline ? "badge-success" : "badge-warning"}`}>{isOnline ? "ONLINE" : "OFFLINE"}</span>
      <span className="badge badge-info">{pendingOutboxCount} QUEUED</span>
      <button className="context-selector" onClick={onToggleTheme}>{theme === "dark" ? "☀️" : "🌙"}</button>
      <button className="context-selector" onClick={onLogout}>Sign out</button>
    </div>
  </header>
);

export const Sidebar: React.FC<{
  currentPath: string;
  onNavigate: (path: string) => void;
  user: { name?: string; role?: string } | null;
  canAdminister: boolean;
}> = ({ currentPath, onNavigate, user, canAdminister }) => (
  <aside>
    <div className="nav-section-title">Core Operations</div>
    <ul className="nav-list">
      {[
        ["/", "📊 Dashboard"],
        ["/pos", "⚡ POS Checkout"],
        ["/inventory", "📦 Inventory & FEFO"],
        ["/customers", "👥 Customer CRM"],
        ["/purchasing", "🛒 Purchasing"],
        ["/cash-drawer", "💵 Cash Drawer"],
        ["/receipts", "🧾 Receipts Engine"],
      ].map(([path, label]) => (
        <li className="nav-item" key={path}>
          <a href={path} className={currentPath === path ? "active" : ""} onClick={(e) => { e.preventDefault(); onNavigate(path); }}>{label}</a>
        </li>
      ))}
    </ul>

    <div className="nav-section-title">Finance & Enterprise</div>
    <ul className="nav-list">
      {[
        ["/finance", "💰 General Ledger"],
        ["/expenses", "💳 Expenses"],
        ["/trash", "🗑️ Soft Delete Bin"],
        ["/reports", "📈 Reports & Analytics"],
        ["/settings", "⚙️ Settings"],
        ["/users", "🔐 Users & Roles"],
        ["/super-admin", "👑 Super Admin"],
        ["/diagnostics", "🩺 Diagnostics"],
      ].filter(([path]) => path !== "/super-admin" || canAdminister).map(([path, label]) => (
        <li className="nav-item" key={path}>
          <a href={path} className={currentPath === path ? "active" : ""} onClick={(e) => { e.preventDefault(); onNavigate(path); }}>{label}</a>
        </li>
      ))}
    </ul>

    <div className="nav-section-title">Vertical Modules</div>
    <ul className="nav-list">
      {[
        ["/law-firm", "⚖️ Law Firm Practice"],
        ["/pharmacy", "💊 Clinical Pharmacy"],
        ["/poultry-livestock", "🐔 Poultry & Livestock"],
        ["/fleet", "🚚 Fleet & Logistics"],
        ["/workforce", "👥 Workforce & Payroll"],
        ["/telecom", "📱 Telecom & Airtime"],
      ].map(([path, label]) => (
        <li className="nav-item" key={path}>
          <a href={path} className={currentPath === path ? "active" : ""} onClick={(e) => { e.preventDefault(); onNavigate(path); }}>{label}</a>
        </li>
      ))}
    </ul>

    <div className="nav-section-title">Intelligence & Support</div>
    <ul className="nav-list">
      {[
        ["/ai", "🧠 AI Control Layer"],
        ["/help", "❓ Knowledge & Help"],
      ].map(([path, label]) => (
        <li className="nav-item" key={path}>
          <a href={path} className={currentPath === path ? "active" : ""} onClick={(e) => { e.preventDefault(); onNavigate(path); }}>{label}</a>
        </li>
      ))}
    </ul>

    <div className="nav-section-title" style={{ marginTop: "auto" }}>Session Context</div>
    <div style={{ padding: "0 .6rem .8rem", fontSize: ".72rem", color: "var(--muted)" }}><div>{user?.name}</div><div>{user?.role}</div></div>
  </aside>
);

export const BottomNav: React.FC<{
  currentPath: string;
  onNavigate: (path: string) => void;
}> = ({ currentPath, onNavigate }) => (
  <nav className="mobile-bottom-nav" aria-label="Primary mobile navigation">
    {[
      ["/", "Home"],
      ["/pos", "POS"],
      ["/inventory", "Stock"],
      ["/customers", "CRM"],
      ["/ai", "AI Layer"],
      ["/help", "Help"],
    ].map(([path, label]) => (
      <a key={path} href={path} className={currentPath === path ? "active" : ""} onClick={(e) => { e.preventDefault(); onNavigate(path); }}>{label}</a>
    ))}
  </nav>
);

export const AppVersionFooter: React.FC<{
  appVersion?: string;
  gitSha?: string;
  isOnline: boolean;
}> = ({ appVersion, gitSha, isOnline }) => (
  <footer>KwakoPos © 2026 · {appVersion || "V2"} · {gitSha ? gitSha.slice(0, 8) : "development"} · {isOnline ? "Connected" : "Offline"}</footer>
);

export const SystemAppShellLayout: React.FC<ShellLayoutProps> = ({ currentPath, onNavigate, children }) => {
  const { user, logout } = useAuth();
  const { currentTenantId, availableTenants, switchTenant } = useTenant();
  const { currentBranchId, availableBranches, switchBranch } = useBranch();
  const { isOnline, pendingOutboxCount } = useSync();
  const { theme, toggleTheme } = useTheme();
  const { permissions } = useRbac();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
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
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setIsSearchOpen(true); }
      if (event.key === "Escape") { setIsSearchOpen(false); setIsCommandOpen(false); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const handle = window.setTimeout(async () => {
      try {
        const [products, customers] = await Promise.all([
          apiFetch<{ success: boolean; data: Array<{ id: string; name: string; sku: string }> }>(`/api/v1/products/search?q=${encodeURIComponent(searchQuery)}`),
          apiFetch<{ success: boolean; data: Array<{ id: string; name: string }> }>("/api/v1/customers"),
        ]);
        const q = searchQuery.toLowerCase();
        const results: SearchResult[] = [
          ...(products.data || []).slice(0, 5).map((p) => ({ type: "Product", label: `${p.name} (${p.sku})`, id: p.id, target: "/pos" })),
          ...(customers.data || []).filter((c) => c.name.toLowerCase().includes(q)).slice(0, 5).map((c) => ({ type: "Customer", label: c.name, id: c.id, target: "/customers" })),
        ];
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      }
    }, 180);
    return () => window.clearTimeout(handle);
  }, [searchQuery]);

  const safeSwitchTenant = async (id: string) => { try { await switchTenant(id); } catch (error) { window.alert(error instanceof Error ? error.message : "Tenant switch denied"); } };
  const safeSwitchBranch = async (id: string) => { try { await switchBranch(id); } catch (error) { window.alert(error instanceof Error ? error.message : "Branch switch denied"); } };

  return (
    <div className="kwakopos-app" data-theme={theme}>
      <TopBar
        currentTenantId={currentTenantId}
        currentBranchId={currentBranchId}
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
        onOpenCommands={() => setIsCommandOpen(true)}
        onLogout={() => void logout()}
      />

      <div className="app-layout">
        <Sidebar
          currentPath={currentPath}
          onNavigate={onNavigate}
          user={user}
          canAdminister={canAdminister}
        />

        <main id="app-root">{children}</main>
      </div>

      <BottomNav currentPath={currentPath} onNavigate={onNavigate} />

      {isSearchOpen && (
        <div className="modal-overlay open">
          <div className="modal-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3>Authorized Instant Search</h3>
              <button className="btn btn-secondary" onClick={() => setIsSearchOpen(false)}>Close</button>
            </div>
            <input className="search-input" autoFocus value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search products, customers or modules" />
            {!searchQuery.trim() ? (
              <EmptySearch message="Search only uses records authorized for the current V2 session." />
            ) : searchResults.length ? (
              searchResults.map((result) => (
                <button key={`${result.type}-${result.id}`} className="btn btn-secondary" style={{ width: "100%", justifyContent: "flex-start", marginTop: ".45rem" }} onClick={() => { setIsSearchOpen(false); onNavigate(result.target); }}>
                  {result.type}: {result.label}
                </button>
              ))
            ) : (
              <EmptySearch message="No authorized matching records found." />
            )}
          </div>
        </div>
      )}

      {isCommandOpen && (
        <div className="modal-overlay open">
          <div className="modal-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3>KwakoPos Action Dispatcher</h3>
              <button className="btn btn-secondary" onClick={() => setIsCommandOpen(false)}>Close</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: ".5rem", maxHeight: "60vh", overflowY: "auto" }}>
              {[
                ["/pos", "⚡ Launch POS Checkout Terminal"],
                ["/inventory", "📦 Open Inventory & FEFO Ledger"],
                ["/customers", "👥 Manage Customers & CRM Accounts"],
                ["/purchasing", "🛒 Open Purchasing & Receiving"],
                ["/cash-drawer", "💵 Open Cash Drawer Shift Reconciliation"],
                ["/receipts", "🧾 Manage Receipts & E-Invoicing Engine"],
                ["/expenses", "💳 Record Business Expense Voucher"],
                ["/trash", "🗑️ Open Soft Delete Recycle Bin"],
                ["/ai", "🧠 Open AI Operating Layer & Policy Gateway"],
                ["/law-firm", "⚖️ Law Firm Practice Command Center"],
                ["/pharmacy", "💊 Clinical Pharmacy & FEFO Dispensing"],
                ["/poultry-livestock", "🐔 Poultry & Livestock Production Ops"],
                ["/fleet", "🚚 Vehicle Fleet & Logistics Operations"],
                ["/workforce", "👥 Workforce Management & Payroll Roster"],
                ["/telecom", "📱 Telecom & Airtime Distribution Center"],
                ["/reports", "📈 Open Financial & Sales Reports"],
                ["/diagnostics", "🩺 Open Sync Diagnostics & Outbox"],
              ].map(([path, label]) => (
                <button key={path} className="btn btn-secondary" style={{ justifyContent: "flex-start" }} onClick={() => { setIsCommandOpen(false); onNavigate(path); }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <AppVersionFooter appVersion={release.appVersion} gitSha={release.gitSha} isOnline={isOnline} />
    </div>
  );
};

const EmptySearch: React.FC<{ message: string }> = ({ message }) => <div style={{ color: "var(--muted)", padding: "1rem", textAlign: "center" }}>{message}</div>;
