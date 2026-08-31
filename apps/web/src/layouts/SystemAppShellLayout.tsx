import React, { useEffect, useState } from "react";
import { useAuth, useTenant, useBranch, useSync, useTheme, useRbac } from "../context/KwakoPosContexts.js";
import { apiFetch } from "../services/apiClient.js";

export interface ShellLayoutProps { currentPath: string; onNavigate: (path: string) => void; children: React.ReactNode; }

type SearchResult = { type: string; label: string; id: string; target: string };

export const SystemAppShellLayout: React.FC<ShellLayoutProps> = ({ currentPath, onNavigate, children }) => {
  const { user, logout } = useAuth();
  const { currentTenantId, availableTenants, switchTenant } = useTenant();
  const { currentBranchId, availableBranches, switchBranch } = useBranch();
  const { isOnline, pendingOutboxCount, syncOutbox } = useSync();
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

  const safeSwitchTenant = (id: string) => { try { switchTenant(id); } catch (error) { window.alert(error instanceof Error ? error.message : "Tenant switch denied"); } };
  const safeSwitchBranch = (id: string) => { try { switchBranch(id); } catch (error) { window.alert(error instanceof Error ? error.message : "Branch switch denied"); } };

  return (
    <div className="kwakopos-app" data-theme={theme}>
      <header>
        <a href="/" className="header-brand" onClick={(e) => { e.preventDefault(); onNavigate("/"); }}>KwakoPos 2.0</a>
        <div className="header-context">
          <button className="context-selector" onClick={() => setIsSearchOpen(true)}>🔍 Search (Ctrl+K)</button>
          <button className="context-selector" onClick={() => setIsCommandOpen(true)}>⚡ Commands</button>
          <select className="context-selector" value={currentTenantId || ""} onChange={(e) => safeSwitchTenant(e.target.value)} disabled={availableTenants.length <= 1}>
            {availableTenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select className="context-selector" value={currentBranchId || ""} onChange={(e) => safeSwitchBranch(e.target.value)} disabled={availableBranches.length <= 1}>
            {availableBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <span className={`badge ${isOnline ? "badge-success" : "badge-warning"}`}>{isOnline ? "ONLINE" : "OFFLINE"}</span>
          <span className="badge badge-info">{pendingOutboxCount} QUEUED</span>
          <button className="context-selector" onClick={toggleTheme}>{theme === "dark" ? "☀️" : "🌙"}</button>
          <button className="context-selector" onClick={() => void logout()}>Sign out</button>
        </div>
      </header>

      <div className="app-layout">
        <aside>
          <div className="nav-section-title">Core Operations</div>
          <ul className="nav-list">
            {[["/","📊 Dashboard"],["/pos","⚡ POS"],["/inventory","📦 Inventory"],["/customers","👥 Customers"],["/purchasing","🛒 Purchasing"]].map(([path,label]) => <li className="nav-item" key={path}><a href={path} className={currentPath===path ? "active" : ""} onClick={(e)=>{e.preventDefault();onNavigate(path)}}>{label}</a></li>)}
          </ul>
          <div className="nav-section-title">Finance & Enterprise</div>
          <ul className="nav-list">
            {[['/finance','💰 Finance'],['/reports','📈 Reports'],['/settings','⚙️ Settings'],['/users','🔐 Users & Roles'],['/super-admin','👑 Super Admin'],['/diagnostics','🩺 Diagnostics']].filter(([path]) => path !== '/super-admin' || canAdminister).map(([path,label]) => <li className="nav-item" key={path}><a href={path} className={currentPath===path?"active":""} onClick={(e)=>{e.preventDefault();onNavigate(path)}}>{label}</a></li>)}
          </ul>
          <div className="nav-section-title" style={{ marginTop: "auto" }}>Session</div>
          <div style={{ padding: "0 .6rem .8rem", fontSize: ".72rem", color: "var(--muted)" }}><div>{user.name}</div><div>{user.role}</div></div>
        </aside>

        <main id="app-root">{children}</main>
      </div>

      <nav className="mobile-bottom-nav" aria-label="Primary mobile navigation">
        {[["/","Home"],["/pos","POS"],["/inventory","Stock"],["/customers","Customers"],["/reports","Reports"]].map(([path,label]) => <a key={path} href={path} className={currentPath===path?"active":""} onClick={(e)=>{e.preventDefault();onNavigate(path)}}>{label}</a>)}
      </nav>

      {isSearchOpen && <div className="modal-overlay open"><div className="modal-card"><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}><h3>Authorized Search</h3><button className="btn btn-secondary" onClick={() => setIsSearchOpen(false)}>Close</button></div><input className="search-input" autoFocus value={searchQuery} onChange={(e)=>setSearchQuery(e.target.value)} placeholder="Search products or customers" />{!searchQuery.trim() ? <EmptySearch message="Search only uses records authorized for the current V2 session." /> : searchResults.length ? searchResults.map((result) => <button key={`${result.type}-${result.id}`} className="btn btn-secondary" style={{ width: "100%", justifyContent: "flex-start", marginTop: ".45rem" }} onClick={() => { setIsSearchOpen(false); onNavigate(result.target); }}>{result.type}: {result.label}</button>) : <EmptySearch message="No authorized matching records found." />}</div></div>}

      {isCommandOpen && <div className="modal-overlay open"><div className="modal-card"><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}><h3>Command Palette</h3><button className="btn btn-secondary" onClick={() => setIsCommandOpen(false)}>Close</button></div><div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>{[["/pos","Open POS"],["/inventory","Open Inventory"],["/customers","Open Customers"],["/reports","Open Reports"],["/diagnostics","Open Sync Diagnostics"]].map(([path,label]) => <button key={path} className="btn btn-secondary" style={{ justifyContent: "flex-start" }} onClick={() => { setIsCommandOpen(false); onNavigate(path); }}>{label}</button>)}</div></div></div>}

      <footer>KwakoPos © 2026 · {release.appVersion || "V2"} · {release.gitSha ? release.gitSha.slice(0, 8) : "development"} · {isOnline ? "Connected" : "Offline"}</footer>
    </div>
  );
};

const EmptySearch: React.FC<{ message: string }> = ({ message }) => <div style={{ color: "var(--muted)", padding: "1rem", textAlign: "center" }}>{message}</div>;
