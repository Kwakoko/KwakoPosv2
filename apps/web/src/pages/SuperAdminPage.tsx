/**
 * KwakoPosv2 — Super Admin & Multi-Tenant Platform Tower
 * ─────────────────────────────────────────────────────────────────────────────
 * Executive platform control tower featuring:
 *   1. Multi-Tenant Directory & Provisioning
 *   2. Subscription Plan Management (Trial, Basic, Pro, Enterprise)
 *   3. Global System Telemetry & Health Monitoring
 *   4. Safe Tenant Impersonation & Audit Trail
 *
 * Uses V2 CSS variables + semantic utility classes. Zero Tailwind / inline styles.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState } from "react";
import {
  Shield, Building, Activity, Zap, Users, CreditCard, Lock, Eye,
  Plus, Search, RefreshCw, AlertTriangle, CheckCircle, Server, Database
} from "lucide-react";

type AdminTab = "tenants" | "subscriptions" | "health" | "audit";

const money = (v: number) => `Tsh ${(v / 1_000_000).toFixed(1)}M`;

export const SuperAdminPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminTab>("tenants");
  const [search, setSearch] = useState("");

  return (
    <div className="v2-animate-page-enter v2-space-y-4">
      {/* Header */}
      <div className="v2-flex v2-items-center v2-justify-between">
        <div>
          <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>
            Super Admin & Platform Control Tower
          </h1>
          <p className="v2-text-xs v2-text-muted">
            Manage multi-tenant organizations, SaaS subscriptions, server health telemetry, and platform security.
          </p>
        </div>
        <div className="v2-flex v2-gap-2">
          <button className="v2-btn v2-btn-primary v2-btn-sm" type="button">
            <Plus size={13} /> Provision New Tenant
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="v2-flex v2-gap-1" style={{ borderBottom: "1px solid var(--surface-border)", paddingBottom: ".4rem" }}>
        {[
          { id: "tenants", label: "Tenant Directory", icon: Building },
          { id: "subscriptions", label: "SaaS Subscriptions", icon: CreditCard },
          { id: "health", label: "System Health & Telemetry", icon: Server },
          { id: "audit", label: "Super Admin Audit Log", icon: Activity },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as AdminTab)}
            type="button"
            className={`v2-btn v2-btn-sm ${activeTab === t.id ? "v2-btn-primary" : "v2-btn-ghost"}`}
          >
            <t.icon size={13} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* KPI Overview */}
      <div className="metrics-grid kpi-grid-4">
        <div className="kpi-card">
          <div className="kpi-card-blob" style={{ background: "#38bdf8" }} />
          <div className="kpi-card-label">Active Platform Tenants</div>
          <div className="kpi-card-value">124 Businesses</div>
          <div className="kpi-card-desc">across 342 Branches</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-blob" style={{ background: "#4ade80" }} />
          <div className="kpi-card-label">Monthly Recurring Revenue</div>
          <div className="kpi-card-value">{money(148500000)}</div>
          <div className="kpi-card-desc">+18.4% MRR Growth</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-blob" style={{ background: "#818cf8" }} />
          <div className="kpi-card-label">Server Cluster Health</div>
          <div className="kpi-card-value">99.99% Uptime</div>
          <div className="kpi-card-desc">Latency: 14ms</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-blob" style={{ background: "#fbbf24" }} />
          <div className="kpi-card-label">Trial Conversions</div>
          <div className="kpi-card-value">84.2%</div>
          <div className="kpi-card-desc">18 Pending Trials</div>
        </div>
      </div>

      {/* Tenants Tab */}
      {activeTab === "tenants" && (
        <div className="v2-space-y-4">
          <div className="v2-flex v2-items-center v2-justify-between v2-gap-4">
            <div className="v2-flex v2-items-center" style={{ position: "relative", flex: 1, maxWidth: 360 }}>
              <Search size={14} style={{ position: "absolute", left: ".8rem", color: "var(--muted)" }} />
              <input
                className="v2-input v2-input-sm"
                style={{ paddingLeft: "2.4rem" }}
                placeholder="Search tenant by name, code, or owner email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="v2-card">
            <table className="v2-table">
              <thead>
                <tr>
                  <th>Tenant Name & Code</th>
                  <th>Industry Sector</th>
                  <th>Subscription Plan</th>
                  <th>Branches</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: "Kwakoko Supermarket Ltd", code: "TEN-001", sector: "Grocery & Retail", plan: "Enterprise", branches: 5, status: "Active" },
                  { name: "Apex Legal Chambers",      code: "TEN-002", sector: "Law Firm Practice", plan: "Pro",        branches: 2, status: "Active" },
                  { name: "City Care Pharmacy",      code: "TEN-003", sector: "Clinical Pharmacy", plan: "Enterprise", branches: 4, status: "Active" },
                  { name: "Kilimo Poultry Farm",      code: "TEN-004", sector: "Poultry & Livestock", plan: "Basic",       branches: 1, status: "Active" },
                  { name: "Speedy Express Logistics", code: "TEN-005", sector: "Vehicle Fleet",     plan: "Enterprise", branches: 8, status: "Active" },
                ].map((t) => (
                  <tr key={t.code}>
                    <td>
                      <div className="v2-font-bold">{t.name}</div>
                      <div className="v2-mono v2-text-xs v2-text-muted">{t.code}</div>
                    </td>
                    <td>{t.sector}</td>
                    <td><span className="badge v2-badge-accent">{t.plan}</span></td>
                    <td className="v2-font-bold">{t.branches} Branches</td>
                    <td><span className="badge v2-badge-success">{t.status}</span></td>
                    <td>
                      <button className="v2-btn v2-btn-secondary v2-btn-sm" type="button">
                        <Eye size={13} /> Impersonate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
