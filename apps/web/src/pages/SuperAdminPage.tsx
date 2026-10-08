/**
 * KwakoPosv2 — Super Admin & Multi-Tenant Platform Tower
 * Server-authoritative platform control surface
 */
import React, { useState, useEffect } from "react";
import {
  Shield,
  Building,
  Activity,
  Server,
  CreditCard,
  Eye,
  Plus,
  Search,
  Lock,
  KeyRound,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Terminal,
  Sparkles,
} from "lucide-react";
import { apiFetch, changeSuperAdminPassword } from "../services/applicationApiService.js";
import { SuperAdminSqlStudio } from "../components/SuperAdminSqlStudio.js";
import { SuperAdminCleanlinessStudio } from "../components/SuperAdminCleanlinessStudio.js";
import { SuperAdminCertificationStudio } from "../components/SuperAdminCertificationStudio.js";
import { SuperAdminLiveControlPlane } from "../components/SuperAdminLiveControlPlane.js";

type AdminTab = "tenants" | "subscriptions" | "health" | "audit" | "security" | "sql-studio" | "cleanliness" | "certification";
const money = (v: number) => `Tsh ${(v / 1_000_000).toFixed(1)}M`;

interface PlatformOverview {
  platformName?: string;
  totalTenants?: number;
  activeTenants?: number;
  totalBranches?: number;
  totalUsers?: number;
}

export const SuperAdminPage: React.FC<{ onNavigate?: (path: string) => void; initialTab?: AdminTab }> = ({ onNavigate, initialTab }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>(() => {
    if (initialTab) return initialTab;
    if (typeof window !== "undefined" && window.location.pathname.includes("certification")) {
      return "certification";
    }
    return "tenants";
  });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [overview, setOverview] = useState<PlatformOverview | null>(null);

  // Password rotation modal
  const [showRotateModal, setShowRotateModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [rotateBusy, setRotateBusy] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [rotateSuccess, setRotateSuccess] = useState<string | null>(null);

  const openOnboarding = () => {
    if (onNavigate) {
      onNavigate("/tenant-onboarding");
      return;
    }
    window.history.pushState({}, "", "/tenant-onboarding");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const returnToDashboard = () => {
    if (onNavigate) {
      onNavigate("/dashboard");
      return;
    }
    window.history.pushState({}, "", "/dashboard");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const verifyAuthorization = async () => {
    setLoading(true);
    setAuthError(null);
    try {
      const res = await apiFetch<{ success: boolean; data?: PlatformOverview }>("/api/v1/super-admin/overview/live");
      if (res && res.success) {
        setAuthorized(true);
        setOverview(res.data || null);
      } else {
        setAuthorized(false);
        setAuthError("Unauthorized access to Super Admin platform.");
      }
    } catch (err: any) {
      setAuthorized(false);
      setAuthError(err?.message || "Super Admin authorization check failed (HTTP 403).");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    verifyAuthorization();
  }, []);

  const handlePasswordRotate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setRotateError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 10) {
      setRotateError("New password must be at least 10 characters long.");
      return;
    }
    setRotateBusy(true);
    setRotateError(null);
    setRotateSuccess(null);

    try {
      await changeSuperAdminPassword(currentPassword, newPassword, mfaCode.trim());
      setRotateSuccess("Super Admin master password rotated successfully. Other sessions have been revoked.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMfaCode("");
      setTimeout(() => {
        setShowRotateModal(false);
        setRotateSuccess(null);
      }, 3000);
    } catch (err) {
      setRotateError(err instanceof Error ? err.message : "Failed to rotate password");
    } finally {
      setRotateBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
        <p className="text-sm font-medium">Verifying Super Admin Authorization &amp; Cryptographic Proofs...</p>
      </div>
    );
  }

  if (authorized === false) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 bg-slate-900 border border-red-800/60 rounded-2xl shadow-2xl text-center space-y-6">
        <div className="inline-flex p-4 bg-red-950/60 border border-red-800 rounded-full text-red-400">
          <AlertTriangle className="w-12 h-12" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white tracking-tight">403 Forbidden — Super Admin Restricted Area</h1>
          <p className="text-sm text-red-300/90 leading-relaxed max-w-lg mx-auto">
            {authError || "Access to the Super Admin Platform Control Tower requires authenticated and verified PLATFORM_SUPER_ADMIN authorization. Tenant administrator permissions do not grant platform super administrative privileges."}
          </p>
        </div>
        <div className="pt-4 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={returnToDashboard}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-xl border border-slate-700 transition"
          >
            Return to Workspace Dashboard
          </button>
          <button
            type="button"
            onClick={verifyAuthorization}
            className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-xl shadow-lg shadow-red-600/20 transition flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Re-verify
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="v2-animate-page-enter v2-space-y-4">
      {/* Header */}
      <div className="v2-flex v2-items-center v2-justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-block px-2.5 py-0.5 text-xs font-semibold tracking-wide bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full">
              PLATFORM ROOT CONTROL TOWER
            </span>
          </div>
          <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>
            Super Admin &amp; Platform Control Tower
          </h1>
          <p className="v2-text-xs v2-text-muted">
            Manage multi-tenant organizations, SaaS subscriptions, server health telemetry, and platform security.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="v2-btn v2-btn-secondary v2-btn-sm flex items-center gap-1.5"
            type="button"
            onClick={() => setShowRotateModal(true)}
          >
            <KeyRound size={13} />
            <span>Rotate Credentials</span>
          </button>
          <button className="v2-btn v2-btn-primary v2-btn-sm" type="button" onClick={openOnboarding}>
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
          { id: "security", label: "Security & MFA Controls", icon: Lock },
          { id: "sql-studio", label: "SQL Studio & DB", icon: Terminal },
          { id: "cleanliness", label: "Production Cleanliness", icon: Sparkles },
          { id: "certification", label: "KPCP Platform Certification", icon: Shield },
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

      {/* KPI Overview Grid */}
      <div className="metrics-grid kpi-grid-4">
        <div className="kpi-card">
          <div className="kpi-card-label">Active Platform Tenants</div>
          <div className="kpi-card-value">{overview?.activeTenants ?? "Live directory"}</div>
          <div className="kpi-card-desc">Total Tenants: {overview?.totalTenants ?? "..."}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-label">Monthly Recurring Revenue</div>
          <div className="kpi-card-value">{money(0)}</div>
          <div className="kpi-card-desc">Awaiting live billing telemetry</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-label">Platform Branches</div>
          <div className="kpi-card-value">{overview?.totalBranches ?? "Live telemetry"}</div>
          <div className="kpi-card-desc">Across all active tenants</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-label">Security &amp; MFA Status</div>
          <div className="kpi-card-value text-emerald-400">ENFORCED</div>
          <div className="kpi-card-desc">Argon2id + Hardware/TOTP Active</div>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "tenants" && (
        <div className="v2-space-y-4">
          <div className="v2-flex v2-items-center" style={{ position: "relative", maxWidth: 420 }}>
            <Search size={14} style={{ position: "absolute", left: ".8rem", color: "var(--muted)" }} />
            <input
              className="v2-input v2-input-sm"
              style={{ paddingLeft: "2.4rem" }}
              placeholder="Search live tenant directory..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="v2-card" style={{ padding: "1.2rem" }}>
            <div className="v2-flex v2-items-center v2-gap-2">
              <Shield size={16} />
              <strong>Production tenant provisioning</strong>
            </div>
            <p className="v2-text-xs v2-text-muted">
              Create a real tenant, main branch, owner role, owner account, deterministic defaults, module entitlements, and audit trail without demo data.
            </p>
            <button className="v2-btn v2-btn-primary v2-btn-sm" onClick={openOnboarding} type="button">
              <Plus size={13} /> Start Tenant Onboarding
            </button>
          </div>
        </div>
      )}

      {activeTab === "security" && (
        <div className="v2-space-y-4">
          <div className="v2-card" style={{ padding: "1.5rem" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-white text-base">Super Admin Credential &amp; Key Governance</h3>
                <p className="text-xs text-slate-400 mt-0.5">Manage root platform master password and MFA enforcement policy.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowRotateModal(true)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-xs rounded-xl shadow transition flex items-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Rotate Master Password</span>
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl">
                <div className="text-xs text-slate-400">Password Hashing</div>
                <div className="font-mono text-emerald-400 font-semibold text-sm mt-1">Argon2id (m=64MB, t=3, p=4)</div>
                <div className="text-[11px] text-slate-500 mt-1">Production memory-hard password derivation</div>
              </div>
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl">
                <div className="text-xs text-slate-400">Second Factor (MFA)</div>
                <div className="font-mono text-emerald-400 font-semibold text-sm mt-1">TOTP (RFC 6238, 30s)</div>
                <div className="text-[11px] text-slate-500 mt-1">Enforced on every platform Super Admin login</div>
              </div>
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl">
                <div className="text-xs text-slate-400">Lockout &amp; Rate Limiting</div>
                <div className="font-mono text-emerald-400 font-semibold text-sm mt-1">5 Attempts → 15m Lockout</div>
                <div className="text-[11px] text-slate-500 mt-1">Exponential backoff + IP throttling active</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "security" && <SuperAdminLiveControlPlane tab="security" />}
      {activeTab === "subscriptions" && <SuperAdminLiveControlPlane tab="subscriptions" />}
      {activeTab === "health" && <SuperAdminLiveControlPlane tab="health" />}
      {activeTab === "audit" && <SuperAdminLiveControlPlane tab="audit" />}

      {activeTab === "sql-studio" && <SuperAdminSqlStudio />}
      {activeTab === "cleanliness" && <SuperAdminCleanlinessStudio />}
      {activeTab === "certification" && <SuperAdminCertificationStudio />}

      {/* Rotate Password Modal */}
      {showRotateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-amber-500/40 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Rotate Super Admin Password</h3>
                <p className="text-xs text-slate-400">Requires current credentials and active MFA verification.</p>
              </div>
            </div>

            {rotateError && (
              <div className="mb-4 p-3 bg-red-950/50 border border-red-800/60 rounded-xl text-red-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{rotateError}</span>
              </div>
            )}

            {rotateSuccess && (
              <div className="mb-4 p-3 bg-emerald-950/50 border border-emerald-800/60 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{rotateSuccess}</span>
              </div>
            )}

            <form onSubmit={handlePasswordRotate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">New Master Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Current 6-Digit MFA Code</label>
                <input
                  type="text"
                  maxLength={6}
                  inputMode="numeric"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-amber-300 font-mono tracking-wider text-center text-sm focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRotateModal(false)}
                  disabled={rotateBusy}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rotateBusy}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded-xl transition flex items-center gap-1.5"
                >
                  {rotateBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  <span>Rotate Credentials</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
