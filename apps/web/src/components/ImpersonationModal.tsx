import React, { useState, useEffect } from "react";
import { Shield, Eye, Building2, GitBranch, ArrowRight, X, AlertTriangle, Loader2 } from "lucide-react";
import { apiFetch } from "../services/apiClient.js";
import { useAuth } from "../context/KwakoPosContexts.js";

interface TenantBranch {
  id: string;
  name: string;
  code?: string;
  isMain?: boolean;
}

interface TenantItem {
  id: string;
  name: string;
  slug: string;
  status: string;
  branches: TenantBranch[];
}

export const ImpersonationModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onImpersonationStarted?: () => void;
}> = ({ isOpen, onClose, onImpersonationStarted }) => {
  const { startImpersonation } = useAuth();
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [auditReason, setAuditReason] = useState<string>("Customer support ticket & store configuration audit");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    apiFetch<{ success: boolean; data?: TenantItem[] }>("/api/v1/super-admin/tenants")
      .then((res) => {
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          setTenants(res.data);
          setSelectedTenantId(res.data[0].id);
          if (res.data[0].branches?.length > 0) {
            setSelectedBranchId(res.data[0].branches[0].id);
          }
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load tenant fleet directory");
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  const selectedTenant = tenants.find((t) => t.id === selectedTenantId);

  const handleTenantChange = (tenantId: string) => {
    setSelectedTenantId(tenantId);
    const t = tenants.find((item) => item.id === tenantId);
    if (t?.branches?.length) {
      setSelectedBranchId(t.branches[0].id);
    } else {
      setSelectedBranchId("");
    }
  };

  const handleLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenantId) return;
    setBusy(true);
    setError(null);
    try {
      const branch = selectedTenant?.branches.find((b) => b.id === selectedBranchId);
      await startImpersonation(
        selectedTenantId,
        selectedTenant?.name || selectedTenantId,
        selectedBranchId || undefined,
        branch?.name || selectedBranchId || undefined
      );
      onClose();
      onImpersonationStarted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initiate secure tenant inspection session");
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 500 }} role="dialog" aria-modal="true">
      <div
        className="modal-card v2-card"
        style={{
          width: "100%",
          maxWidth: 580,
          background: "var(--surface)",
          border: "1px solid var(--surface-border)",
          boxShadow: "var(--shadow-xl)",
          borderRadius: "var(--radius-xl)",
          padding: "1.6rem",
          animation: "v2-scale-in var(--transition-spring)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.2rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "rgba(245, 158, 11, 0.15)",
                border: "1px solid rgba(245,158,11,0.3)",
                display: "grid",
                placeItems: "center",
                color: "var(--warning)",
              }}
            >
              <Shield size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0, color: "var(--text)" }}>
                Secure Tenant Inspection Launchpad
              </h2>
              <p style={{ fontSize: "0.75rem", color: "var(--muted)", margin: "0.2rem 0 0 0" }}>
                Super Admin Impersonation &amp; Multi-Tenant Scoped Audit Session
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="topbar-icon-btn"
            style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--muted)" }}
            aria-label="Close modal"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        {/* Security Warning */}
        <div
          style={{
            background: "rgba(245, 158, 11, 0.08)",
            border: "1px solid rgba(245, 158, 11, 0.25)",
            borderRadius: 8,
            padding: "0.75rem 0.9rem",
            marginBottom: "1.2rem",
            display: "flex",
            gap: "0.65rem",
            alignItems: "flex-start",
            fontSize: "0.76rem",
            color: "var(--text)",
          }}
        >
          <AlertTriangle size={16} style={{ color: "var(--warning)", flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>Strict Platform Governance:</strong> Entering this tenant session temporarily binds your viewport
            to the target tenant store and branch. All operator actions are recorded in the immutable Super Admin Audit Stream.
          </div>
        </div>

        {error && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: 8,
              padding: "0.65rem 0.85rem",
              marginBottom: "1rem",
              color: "#ef4444",
              fontSize: "0.8rem",
            }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: "2.5rem 0", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.6rem", color: "var(--muted)" }}>
            <Loader2 size={24} className="v2-spin" style={{ color: "var(--warning)" }} />
            <span style={{ fontSize: "0.8rem" }}>Loading registered tenant fleet directory...</span>
          </div>
        ) : (
          <form onSubmit={handleLaunch} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {/* Tenant Selection */}
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, marginBottom: "0.35rem", color: "var(--text)" }}>
                Target Tenant Organization
              </label>
              <div style={{ position: "relative" }}>
                <select
                  className="v2-input"
                  style={{ width: "100%", paddingRight: "2rem" }}
                  value={selectedTenantId}
                  onChange={(e) => handleTenantChange(e.target.value)}
                  required
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.slug}) — {t.status}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Branch Selection */}
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, marginBottom: "0.35rem", color: "var(--text)" }}>
                Target Store Branch
              </label>
              <select
                className="v2-input"
                style={{ width: "100%" }}
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
              >
                {selectedTenant?.branches?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} {b.code ? `[${b.code}]` : ""} {b.isMain ? "★ Main" : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Audit Reason */}
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, marginBottom: "0.35rem", color: "var(--text)" }}>
                Audit Investigation Reason (Logged to Compliance Stream)
              </label>
              <input
                type="text"
                className="v2-input"
                style={{ width: "100%" }}
                value={auditReason}
                onChange={(e) => setAuditReason(e.target.value)}
                placeholder="e.g. Investigation for ticket #4029"
                required
              />
            </div>

            {/* Modal Actions */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.8rem", paddingTop: "0.8rem", borderTop: "1px solid var(--surface-border)" }}>
              <button
                type="button"
                className="v2-btn v2-btn-ghost v2-btn-sm"
                onClick={onClose}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="v2-btn v2-btn-primary v2-btn-sm"
                style={{
                  background: "#f59e0b",
                  color: "#0f172a",
                  fontWeight: 800,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                }}
                disabled={busy || !selectedTenantId}
              >
                {busy ? (
                  <>
                    <Loader2 size={13} className="v2-spin" />
                    <span>Initiating Inspection...</span>
                  </>
                ) : (
                  <>
                    <Eye size={14} />
                    <span>Launch Tenant Inspection</span>
                    <ArrowRight size={13} />
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};