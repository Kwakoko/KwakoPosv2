/**
 * KwakoPosv2 — Super Admin & Multi-Tenant Platform Tower
 */
import React, { useState } from "react";
import { Shield, Building, Activity, Server, CreditCard, Eye, Plus, Search } from "lucide-react";

type AdminTab = "tenants" | "subscriptions" | "health" | "audit";
const money = (v: number) => `Tsh ${(v / 1_000_000).toFixed(1)}M`;

export const SuperAdminPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>("tenants");
  const [search, setSearch] = useState("");
  const openOnboarding = () => { window.history.pushState({}, "", "/tenant-onboarding"); window.dispatchEvent(new PopStateEvent("popstate")); };

  return (
    <div className="v2-animate-page-enter v2-space-y-4">
      <div className="v2-flex v2-items-center v2-justify-between">
        <div><h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>Super Admin & Platform Control Tower</h1><p className="v2-text-xs v2-text-muted">Manage multi-tenant organizations, SaaS subscriptions, server health telemetry, and platform security.</p></div>
        <button className="v2-btn v2-btn-primary v2-btn-sm" type="button" onClick={openOnboarding}><Plus size={13} /> Provision New Tenant</button>
      </div>
      <div className="v2-flex v2-gap-1" style={{ borderBottom: "1px solid var(--surface-border)", paddingBottom: ".4rem" }}>
        {[{ id: "tenants", label: "Tenant Directory", icon: Building }, { id: "subscriptions", label: "SaaS Subscriptions", icon: CreditCard }, { id: "health", label: "System Health & Telemetry", icon: Server }, { id: "audit", label: "Super Admin Audit Log", icon: Activity }].map((t) => <button key={t.id} onClick={() => setActiveTab(t.id as AdminTab)} type="button" className={`v2-btn v2-btn-sm ${activeTab === t.id ? "v2-btn-primary" : "v2-btn-ghost"}`}><t.icon size={13} /><span>{t.label}</span></button>)}
      </div>
      <div className="metrics-grid kpi-grid-4">
        <div className="kpi-card"><div className="kpi-card-label">Active Platform Tenants</div><div className="kpi-card-value">Live directory</div><div className="kpi-card-desc">Loaded from platform data</div></div>
        <div className="kpi-card"><div className="kpi-card-label">Monthly Recurring Revenue</div><div className="kpi-card-value">{money(0)}</div><div className="kpi-card-desc">Awaiting live billing telemetry</div></div>
        <div className="kpi-card"><div className="kpi-card-label">Server Cluster Health</div><div className="kpi-card-value">Live telemetry</div><div className="kpi-card-desc">Use Diagnostics for runtime evidence</div></div>
        <div className="kpi-card"><div className="kpi-card-label">Tenant Provisioning</div><div className="kpi-card-value">Ready</div><div className="kpi-card-desc">Production onboarding workflow enabled</div></div>
      </div>
      {activeTab === "tenants" && <div className="v2-space-y-4">
        <div className="v2-flex v2-items-center" style={{ position: "relative", maxWidth: 420 }}><Search size={14} style={{ position: "absolute", left: ".8rem", color: "var(--muted)" }} /><input className="v2-input v2-input-sm" style={{ paddingLeft: "2.4rem" }} placeholder="Search live tenant directory..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <div className="v2-card" style={{ padding: "1.2rem" }}><div className="v2-flex v2-items-center v2-gap-2"><Shield size={16} /><strong>Production tenant provisioning</strong></div><p className="v2-text-xs v2-text-muted">Create a real tenant, main branch, owner role, owner account, deterministic defaults, module entitlements, and audit trail without demo data.</p><button className="v2-btn v2-btn-primary v2-btn-sm" onClick={openOnboarding} type="button"><Plus size={13} /> Start Tenant Onboarding</button></div>
      </div>}
      {activeTab !== "tenants" && <div className="v2-card" style={{ padding: "1.2rem" }}><div className="v2-flex v2-items-center v2-gap-2"><Eye size={16} /><strong>{activeTab === "subscriptions" ? "Subscriptions" : activeTab === "health" ? "System Health" : "Audit"}</strong></div><p className="v2-text-xs v2-text-muted">This control surface remains connected to the existing V2 platform services.</p></div>}
    </div>
  );
};
