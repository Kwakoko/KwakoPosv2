import React, { useEffect, useState } from "react";
import { Activity, RefreshCw, Shield, Server, CreditCard, ScrollText } from "lucide-react";
import { apiFetch } from "../services/applicationApiService.js";

type Tab = "subscriptions" | "health" | "audit" | "security";
export const SuperAdminLiveControlPlane: React.FC<{ tab: Tab }> = ({ tab }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const endpoint = tab === "subscriptions"
    ? "/api/v1/super-admin/subscriptions"
    : tab === "audit"
      ? "/api/v1/super-admin/audit"
      : tab === "security"
        ? "/api/v1/super-admin/security/health"
        : "/api/v1/super-admin/diagnostics";

  const load = async () => {
    setLoading(true); setError(null);
    try { const result = await apiFetch<any>(endpoint); setData(result?.data ?? null); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to load platform control data"); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [endpoint]);

  const renderJson = () => (
    <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: "0.78rem", lineHeight: 1.5, maxHeight: 520, overflow: "auto" }}>
      {JSON.stringify(data, null, 2)}
    </pre>
  );

  const title = tab === "subscriptions" ? "Live SaaS Subscription Registry"
    : tab === "audit" ? "Global Platform Audit"
    : tab === "security" ? "Live Super Admin Security Posture"
    : "Live Platform Diagnostics";
  const icon = tab === "subscriptions" ? <CreditCard size={16} />
    : tab === "audit" ? <ScrollText size={16} />
    : tab === "security" ? <Shield size={16} />
    : <Server size={16} />;

  return (
    <div className="v2-card" style={{ padding: "1.25rem" }}>
      <div className="v2-flex v2-items-center v2-justify-between" style={{ marginBottom: "0.8rem" }}>
        <div className="v2-flex v2-items-center v2-gap-2">
          {icon}<strong>{title}</strong>
        </div>
        <button className="v2-btn v2-btn-secondary v2-btn-sm" type="button" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={13} className={loading ? "spin" : ""} /> Refresh
        </button>
      </div>
      {error && <div className="v2-text-sm" style={{ color: "var(--danger, #ef4444)", marginBottom: "0.75rem" }}>{error}</div>}
      {loading && !data ? (
        <div className="v2-text-sm v2-text-muted v2-flex v2-items-center v2-gap-2"><Activity size={14} className="spin" /> Loading PostgreSQL-authoritative platform state…</div>
      ) : data ? renderJson() : <div className="v2-text-sm v2-text-muted">No platform records returned.</div>}
    </div>
  );
};
