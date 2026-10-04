/**
 * KwakoPosv2 — TRA VFD Fiscalization Card Component
 * ─────────────────────────────────────────────────────────────────────────────
 * Complete enterprise control card for Tanzania Revenue Authority (TRA)
 * Virtual Fiscal Device (VFD / EFDMS) integration:
 *   - Prominent, tactile ToggleSwitch with emerald active glow
 *   - Instant environment presets (Sandbox, Production, Local Mock)
 *   - Environment selector (TEST vs PRODUCTION)
 *   - Live gateway diagnostics & test connection ping
 *   - Expandable advanced fiscal credentials (TIN, Cert Serial, Reg ID, EFD Serial)
 *   - Durable offline state preservation
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState } from "react";
import {
  ShieldCheck,
  RefreshCw,
  Server,
  Zap,
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Lock,
} from "lucide-react";
import { ToggleSwitch } from "../UI/ToggleSwitch.js";
import { useToast } from "../UI/Toast.js";
import { apiFetch } from "../../services/applicationApiService.js";

export interface TraVfdCardConfig {
  enabled: boolean;
  endpoint: string;
  environment?: "TEST" | "PRODUCTION";
  tin?: string;
  certSerial?: string;
  registrationId?: string;
  efdSerial?: string;
  receiptCode?: string;
  routingKey?: string;
}

export interface TraVfdFiscalizationCardProps {
  config: TraVfdCardConfig;
  onConfigChange: (updates: Partial<TraVfdCardConfig>) => void;
  onToggle: (enabled: boolean) => Promise<void> | void;
  isCompact?: boolean;
  onOpenFullSettings?: () => void;
}

const PRESETS = [
  {
    name: "Sandbox (TRA Test)",
    env: "TEST" as const,
    url: "https://virtual.tra.go.tz/efdmsRctApi/api/efdmsRctInfo",
    tag: "SANDBOX",
  },
  {
    name: "Production (TRA Live)",
    env: "PRODUCTION" as const,
    url: "https://vfd.tra.go.tz/efdmsRctApi/api/efdmsRctInfo",
    tag: "LIVE",
  },
  {
    name: "Local Dev / Mock",
    env: "TEST" as const,
    url: "http://localhost:3000/api/v1/tra-vfd/mock",
    tag: "DEV",
  },
];

export const TraVfdFiscalizationCard: React.FC<TraVfdFiscalizationCardProps> = ({
  config,
  onConfigChange,
  onToggle,
  isCompact = false,
  onOpenFullSettings,
}) => {
  const toast = useToast();
  const [isTesting, setIsTesting] = useState(false);
  const [statusData, setStatusData] = useState<any>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  const isEnabled = Boolean(config.enabled);
  const currentEnv = config.environment || "TEST";

  const handleToggleClick = async (val: boolean) => {
    setIsToggling(true);
    try {
      await onToggle(val);
    } finally {
      setIsToggling(false);
    }
  };

  const handleApplyPreset = (preset: typeof PRESETS[number]) => {
    onConfigChange({
      endpoint: preset.url,
      environment: preset.env,
    });
    toast.info("TRA Preset Applied", `Endpoint set to ${preset.name} (${preset.env})`);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const res = await apiFetch<any>("/api/v1/tra-vfd/status");
      const data = res?.data || res;
      setStatusData(data);
      toast.success(
        "TRA VFD Gateway Online",
        `Gateway status: ${data?.status || "OK"} (Environment: ${data?.environment || currentEnv})`
      );
    } catch (err: any) {
      toast.error(
        "VFD Gateway Offline",
        err?.message || "Could not reach TRA VFD server or proxy."
      );
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div
      className="v2-card"
      style={{
        border: isEnabled
          ? "1px solid rgba(16, 185, 129, 0.45)"
          : "1px solid var(--surface-border)",
        background: isEnabled
          ? "linear-gradient(180deg, rgba(16, 185, 129, 0.05) 0%, rgba(16, 185, 129, 0.01) 100%)"
          : "var(--surface-2)",
        borderRadius: "var(--radius-lg, .75rem)",
        padding: isCompact ? "1rem" : "1.5rem",
        boxShadow: isEnabled
          ? "0 4px 20px rgba(16, 185, 129, 0.08)"
          : "none",
        transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* ── Top Header Row with Tactile Toggle ── */}
      <div
        className="v2-flex v2-items-center v2-justify-between"
        style={{ flexWrap: "wrap", gap: "1rem" }}
      >
        <div className="v2-flex v2-items-center v2-gap-3">
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "12px",
              background: isEnabled
                ? "rgba(16, 185, 129, 0.18)"
                : "rgba(100, 116, 139, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: isEnabled ? "#10b981" : "var(--text-muted)",
              boxShadow: isEnabled
                ? "0 0 15px rgba(16, 185, 129, 0.25)"
                : "none",
              flexShrink: 0,
              transition: "all 0.2s ease",
            }}
          >
            <ShieldCheck size={24} />
          </div>

          <div>
            <div
              className="v2-font-black v2-text-base"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                letterSpacing: "-.01em",
              }}
            >
              <span>TRA VFD Fiscalization</span>
              <span
                className="v2-badge v2-badge-sm"
                style={{
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  background: isEnabled
                    ? "rgba(16, 185, 129, 0.2)"
                    : "rgba(148, 163, 184, 0.2)",
                  color: isEnabled ? "#10b981" : "var(--text-muted)",
                }}
              >
                EFD / VFDMS
              </span>
            </div>
            <div
              className="v2-text-xs v2-text-muted"
              style={{ maxWidth: "42rem", marginTop: ".2rem", lineHeight: 1.4 }}
            >
              Tanzania Revenue Authority electronic fiscal receipt compliance.
              When enabled, retail checkout automatically signs digital receipts
              and queues them in a durable fiscal outbox.
            </div>
          </div>
        </div>

        {/* Tactile Toggle & Status Pill */}
        <div
          className="v2-flex v2-items-center v2-gap-3"
          style={{
            background: isEnabled
              ? "rgba(16, 185, 129, 0.1)"
              : "var(--surface-3)",
            padding: "0.4rem 0.8rem",
            borderRadius: "9999px",
            border: isEnabled
              ? "1px solid rgba(16, 185, 129, 0.3)"
              : "1px solid var(--surface-border)",
          }}
        >
          <span
            style={{
              fontSize: "0.78rem",
              fontWeight: 800,
              letterSpacing: "0.06em",
              color: isEnabled ? "#10b981" : "var(--text-muted)",
              minWidth: "7rem",
              textAlign: "right",
              userSelect: "none",
            }}
          >
            {isEnabled ? "ACTIVE (ON)" : "DISABLED (OFF)"}
          </span>
          <ToggleSwitch
            checked={isEnabled}
            disabled={isToggling}
            onChange={(val) => void handleToggleClick(val)}
            size="lg"
            label="TRA VFD Fiscal Device Power Toggle"
          />
        </div>
      </div>

      {/* ── Environment Presets & Configuration ── */}
      <div
        className="v2-space-y-4"
        style={{
          borderTop: "1px solid var(--surface-border)",
          paddingTop: "1.25rem",
          marginTop: "1.25rem",
        }}
      >
        {/* Environment Mode Switch & Presets */}
        <div className="v2-flex v2-items-center v2-justify-between" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
          <div>
            <label className="v2-text-xs v2-font-bold v2-text-muted">Target Environment</label>
            <div className="v2-flex v2-gap-2 v2-mt-1">
              <button
                type="button"
                onClick={() => onConfigChange({ environment: "TEST" })}
                className={`v2-btn v2-btn-sm ${currentEnv === "TEST" ? "v2-btn-primary" : "v2-btn-ghost"}`}
                style={{ fontWeight: currentEnv === "TEST" ? 800 : 500 }}
              >
                Sandbox / Test (virtual.tra.go.tz)
              </button>
              <button
                type="button"
                onClick={() => onConfigChange({ environment: "PRODUCTION" })}
                className={`v2-btn v2-btn-sm ${currentEnv === "PRODUCTION" ? "v2-btn-primary" : "v2-btn-ghost"}`}
                style={{ fontWeight: currentEnv === "PRODUCTION" ? 800 : 500 }}
              >
                Production Live (vfd.tra.go.tz)
              </button>
            </div>
          </div>

          <div>
            <label className="v2-text-xs v2-font-bold v2-text-muted">Quick Endpoint Presets</label>
            <div className="v2-flex v2-gap-1 v2-mt-1" style={{ flexWrap: "wrap" }}>
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => handleApplyPreset(p)}
                  className="v2-btn v2-btn-secondary v2-btn-sm"
                  style={{ fontSize: "0.72rem", padding: "0.2rem 0.55rem" }}
                  title={p.url}
                >
                  <Zap size={11} style={{ color: p.env === "PRODUCTION" ? "#ef4444" : "#10b981" }} />
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Server Endpoint URL Input */}
        <div>
          <label className="v2-text-xs v2-font-bold v2-text-muted">
            TRA VFD Server Gateway Endpoint
          </label>
          <div className="v2-flex v2-gap-2 v2-mt-1">
            <input
              className="v2-input"
              style={{
                flex: 1,
                fontFamily: "monospace",
                fontSize: "0.82rem",
              }}
              value={config.endpoint}
              onChange={(e) => onConfigChange({ endpoint: e.target.value })}
              placeholder="https://virtual.tra.go.tz/efdmsRctApi/api/efdmsRctInfo"
            />
            <button
              className="v2-btn v2-btn-secondary v2-btn-sm"
              onClick={() => void handleTestConnection()}
              disabled={isTesting}
              type="button"
              style={{ whiteSpace: "nowrap" }}
            >
              <RefreshCw size={13} className={isTesting ? "v2-spin" : ""} />
              <span>{isTesting ? "Connecting..." : "Test Gateway"}</span>
            </button>
          </div>
          <div className="v2-text-xs v2-text-muted v2-mt-1">
            Official TRA EFDMS URL format:{" "}
            <code>https://virtual.tra.go.tz/efdmsRctApi/api/efdmsRctInfo</code>
          </div>
        </div>

        {/* Live Diagnostics HUD */}
        {statusData && (
          <div
            style={{
              padding: "0.9rem",
              borderRadius: "var(--radius-md)",
              background: "var(--surface-3)",
              border: "1px solid var(--surface-border)",
              fontSize: "0.75rem",
            }}
          >
            <div className="v2-flex v2-items-center v2-justify-between v2-mb-2">
              <strong style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <CheckCircle size={15} style={{ color: "#10b981" }} />
                <span>Live TRA Gateway Telemetry</span>
              </strong>
              <span
                className="v2-badge v2-badge-sm"
                style={{
                  fontWeight: 800,
                  background:
                    statusData.status === "VERIFIED"
                      ? "rgba(16, 185, 129, 0.2)"
                      : "rgba(245, 158, 11, 0.2)",
                  color:
                    statusData.status === "VERIFIED" ? "#10b981" : "#f59e0b",
                }}
              >
                STATUS: {statusData.status}
              </span>
            </div>
            <div className="v2-grid v2-grid-4 v2-gap-3 v2-text-muted">
              <div>
                Environment: <strong>{statusData.environment || currentEnv}</strong>
              </div>
              <div>
                Pending Outbox:{" "}
                <strong>{statusData.pendingOutboxCount ?? 0} items</strong>
              </div>
              <div>
                Provider Ready:{" "}
                <strong
                  style={{
                    color: statusData.configured ? "#10b981" : "#f87171",
                  }}
                >
                  {statusData.configured ? "YES" : "NO"}
                </strong>
              </div>
              <div>
                Verified Receipts:{" "}
                <strong>{statusData.stateCounts?.TRA_VERIFIED ?? 0}</strong>
              </div>
            </div>
          </div>
        )}

        {/* Advanced Fiscal Identifiers (Expandable) */}
        {!isCompact && (
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="v2-btn v2-btn-ghost v2-btn-sm"
              style={{
                paddingLeft: 0,
                color: "var(--text-muted)",
                fontSize: "0.75rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <Lock size={12} />
              <span>
                {showAdvanced
                  ? "Hide Advanced Fiscal Device Identifiers"
                  : "Show Advanced Fiscal Device Identifiers (TIN, Cert Serial, EFD ID)"}
              </span>
              {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>

            {showAdvanced && (
              <div
                className="v2-card v2-p-3 v2-mt-2 v2-space-y-3"
                style={{
                  background: "var(--surface-3)",
                  border: "1px solid var(--surface-border)",
                }}
              >
                <div className="v2-text-xs v2-text-muted">
                  These certified identifiers are issued by TRA or your registered EFDMS vendor.
                  Leave blank to inherit from store profile or default provider credentials.
                </div>
                <div className="v2-grid v2-grid-3 v2-gap-3">
                  <div>
                    <label className="v2-text-xs v2-font-bold v2-text-muted">TIN Number</label>
                    <input
                      className="v2-input"
                      value={config.tin || ""}
                      onChange={(e) => onConfigChange({ tin: e.target.value })}
                      placeholder="e.g. 123-456-789"
                    />
                  </div>
                  <div>
                    <label className="v2-text-xs v2-font-bold v2-text-muted">Certificate Serial</label>
                    <input
                      className="v2-input"
                      value={config.certSerial || ""}
                      onChange={(e) => onConfigChange({ certSerial: e.target.value })}
                      placeholder="e.g. CERT-2026-X1"
                    />
                  </div>
                  <div>
                    <label className="v2-text-xs v2-font-bold v2-text-muted">Registration ID</label>
                    <input
                      className="v2-input"
                      value={config.registrationId || ""}
                      onChange={(e) => onConfigChange({ registrationId: e.target.value })}
                      placeholder="e.g. REG-TZ-001"
                    />
                  </div>
                  <div>
                    <label className="v2-text-xs v2-font-bold v2-text-muted">EFD Device Serial</label>
                    <input
                      className="v2-input"
                      value={config.efdSerial || ""}
                      onChange={(e) => onConfigChange({ efdSerial: e.target.value })}
                      placeholder="e.g. EFD-998811"
                    />
                  </div>
                  <div>
                    <label className="v2-text-xs v2-font-bold v2-text-muted">Receipt Code</label>
                    <input
                      className="v2-input"
                      value={config.receiptCode || ""}
                      onChange={(e) => onConfigChange({ receiptCode: e.target.value })}
                      placeholder="e.g. RCT"
                    />
                  </div>
                  <div>
                    <label className="v2-text-xs v2-font-bold v2-text-muted">AMQP / Outbox Routing Key</label>
                    <input
                      className="v2-input"
                      value={config.routingKey || "vfdrct"}
                      onChange={(e) => onConfigChange({ routingKey: e.target.value })}
                      placeholder="vfdrct"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Link to Full Settings if in Compact Mode */}
        {isCompact && onOpenFullSettings && (
          <div className="v2-flex v2-justify-end v2-pt-1">
            <button
              type="button"
              onClick={onOpenFullSettings}
              className="v2-btn v2-btn-ghost v2-btn-sm"
              style={{ fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <span>Open Complete Fiscal Device Settings</span>
              <ExternalLink size={12} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
