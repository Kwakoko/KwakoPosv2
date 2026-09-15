/**
 * KwakoPos V2 — Real-Time Sync Telemetry & Security HUD
 * ─────────────────────────────────────────────────────────────────────────────
 * Ambient floating status capsule + diagnostics modal:
 * - Online / Offline Edge / Syncing live telemetry
 * - Pending outbox queue count
 * - Monotonic Hybrid Logical Clock (HLC) inspector
 * - Local storage quota telemetry
 * - Hardware WebCrypto zero-trust vault badge
 * - Edge sync probe and offline simulation controls
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState, useEffect, useMemo } from "react";
import {
  Wifi, WifiOff, RefreshCw, ShieldCheck, Clock, Activity, HardDrive,
  CheckCircle2, X, AlertTriangle, Database, Lock, Layers
} from "lucide-react";
import { useAuth, useBranch, useSync, useTenant } from "../context/KwakoPosContexts.js";
import { syncTelemetryService, type SyncTelemetryMetrics } from "../services/syncTelemetryService.js";

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
}

export const SyncTelemetryHUD: React.FC = () => {
  const { user } = useAuth();
  const { currentTenantName, currentTenantId } = useTenant();
  const { currentBranchName, currentBranchId } = useBranch();
  const { isOnline, pendingOutboxCount, syncOutbox, isSyncing, isSimulatedOffline, toggleOfflineSimulation, db } = useSync();

  const [metrics, setMetrics] = useState<SyncTelemetryMetrics>(syncTelemetryService.getMetrics());
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [isProbing, setIsProbing] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; isError?: boolean } | null>(null);

  // Register DB store with telemetry service
  useEffect(() => {
    if (db) {
      syncTelemetryService.registerStore(db);
    }
  }, [db]);

  // Subscribe to telemetry updates
  useEffect(() => {
    const unsub = syncTelemetryService.subscribe((newMetrics) => {
      setMetrics(newMetrics);
    });
    void syncTelemetryService.refreshOutboxCount();
    return () => unsub();
  }, []);

  // Synchronize network state with telemetry service
  useEffect(() => {
    syncTelemetryService.setNetworkStatus(isOnline, Boolean(isSimulatedOffline));
  }, [isOnline, isSimulatedOffline]);

  const effectiveIsSyncing = isSyncing || isProbing || metrics.syncStatus === "SYNCING";
  const effectiveOutboxCount = Math.max(pendingOutboxCount || 0, metrics.pendingOutboxCount || 0);

  const handleForceProbe = async () => {
    setIsProbing(true);
    setFeedbackMsg({ text: "Probing cloud edge sync..." });
    syncTelemetryService.recordSyncStart();
    const start = performance.now();
    try {
      await syncOutbox({ force: true });
      const duration = Math.round(performance.now() - start);
      syncTelemetryService.recordSyncComplete(duration, true);
      await syncTelemetryService.refreshOutboxCount();
      setFeedbackMsg({ text: `✓ Cloud edge sync probe completed (${duration}ms)` });
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (e: any) {
      const duration = Math.round(performance.now() - start);
      syncTelemetryService.recordSyncComplete(duration, false);
      setFeedbackMsg({ text: `✗ Sync probe failed: ${e?.message || "Network timeout"}`, isError: true });
      setTimeout(() => setFeedbackMsg(null), 5000);
    } finally {
      setIsProbing(false);
    }
  };

  // Hide on unauthenticated screen when there is no user
  if (!user) {
    return null;
  }

  return (
    <>
      {/* Floating Status Capsule */}
      <div
        onClick={() => setShowDiagnostics(true)}
        role="button"
        tabIndex={0}
        aria-label="Open Sync Telemetry and Security Diagnostics"
        className="sync-hud-capsule"
        style={{
          position: "fixed",
          bottom: "1.25rem",
          right: "1.25rem",
          zIndex: 9999,
          display: "inline-flex",
          alignItems: "center",
          gap: "0.6rem",
          padding: "0.45rem 0.85rem",
          borderRadius: "9999px",
          background: "rgba(15, 23, 42, 0.92)",
          color: "#f8fafc",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(51, 65, 85, 0.8)",
          fontSize: "0.75rem",
          cursor: "pointer",
          userSelect: "none",
          transition: "transform 0.15s ease, box-shadow 0.15s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.04)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
        }}
      >
        {/* Pulse / Status Icon */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          {effectiveIsSyncing ? (
            <RefreshCw size={13} style={{ color: "#38bdf8", animation: "spin 1s linear infinite" }} />
          ) : isOnline ? (
            <span style={{ position: "relative", display: "inline-flex", width: "8px", height: "8px" }}>
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "9999px",
                  backgroundColor: "#4ade80",
                  opacity: 0.75,
                  animation: "ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite",
                }}
              />
              <span
                style={{
                  position: "relative",
                  display: "inline-flex",
                  borderRadius: "9999px",
                  width: "8px",
                  height: "8px",
                  backgroundColor: "#22c55e",
                }}
              />
            </span>
          ) : (
            <WifiOff size={13} style={{ color: "#fbbf24" }} />
          )}

          <span style={{ fontWeight: 700, letterSpacing: "-0.01em" }}>
            {effectiveIsSyncing
              ? "Syncing..."
              : isSimulatedOffline
              ? "Simulated Offline"
              : isOnline
              ? "Cloud Sync"
              : "Offline Edge"}
          </span>
        </div>

        {/* Outbox Badge */}
        {effectiveOutboxCount > 0 && (
          <span
            style={{
              padding: "0.15rem 0.45rem",
              borderRadius: "9999px",
              background: "rgba(245, 158, 11, 0.25)",
              color: "#fde68a",
              fontWeight: 800,
              fontSize: "0.68rem",
              border: "1px solid rgba(245, 158, 11, 0.4)",
            }}
          >
            {effectiveOutboxCount} queued
          </span>
        )}

        {/* Security Shield Icon */}
        <ShieldCheck size={13} style={{ color: "#4ade80" }} />
      </div>

      {/* Diagnostics Modal Dialog */}
      {showDiagnostics && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
          onClick={() => setShowDiagnostics(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--surface-border)",
              borderRadius: "var(--radius-xl)",
              width: "100%",
              maxWidth: "520px",
              boxShadow: "var(--shadow-xl)",
              overflow: "hidden",
              color: "var(--text)",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "1.25rem 1.5rem",
                borderBottom: "1px solid var(--surface-border)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Activity size={18} style={{ color: "var(--accent)" }} />
                <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 800 }}>
                  Edge Storage, Sync &amp; Zero-Trust Diagnostics
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close diagnostics"
                className="v2-btn-icon-sm"
                onClick={() => setShowDiagnostics(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--muted)",
                  padding: "0.25rem",
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Telemetry Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                {/* Connection State */}
                <div
                  style={{
                    padding: "0.75rem",
                    borderRadius: "var(--radius-md)",
                    background: "var(--surface-2)",
                    border: "1px solid var(--surface-border)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--muted)", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                    <Wifi size={13} />
                    <span>Connection State</span>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: "0.88rem" }}>
                    {isOnline ? "🟢 Connected (Online)" : isSimulatedOffline ? "🟠 Simulated Offline" : "🟠 Edge Mode (Offline)"}
                  </div>
                </div>

                {/* Outbox Queue */}
                <div
                  style={{
                    padding: "0.75rem",
                    borderRadius: "var(--radius-md)",
                    background: "var(--surface-2)",
                    border: "1px solid var(--surface-border)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--muted)", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                    <HardDrive size={13} />
                    <span>Outbox Queue</span>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: "0.88rem" }}>
                    {effectiveOutboxCount} Pending Mutation(s)
                  </div>
                </div>

                {/* HLC Clock */}
                <div
                  style={{
                    padding: "0.75rem",
                    borderRadius: "var(--radius-md)",
                    background: "var(--surface-2)",
                    border: "1px solid var(--surface-border)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--muted)", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                    <Clock size={13} />
                    <span>Monotonic Clock (HLC)</span>
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.72rem",
                      color: "var(--accent)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={metrics.currentHlc}
                  >
                    {metrics.currentHlc}
                  </div>
                </div>

                {/* Health Score */}
                <div
                  style={{
                    padding: "0.75rem",
                    borderRadius: "var(--radius-md)",
                    background: "var(--surface-2)",
                    border: "1px solid var(--surface-border)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--muted)", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                    <Activity size={13} />
                    <span>Edge Health Score</span>
                  </div>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: "0.88rem",
                      color: metrics.healthScore >= 90 ? "var(--success)" : metrics.healthScore >= 60 ? "var(--warning)" : "var(--danger)",
                    }}
                  >
                    {metrics.healthScore}% Operational
                  </div>
                </div>
              </div>

              {/* Zero-Trust & Storage Specifications */}
              <div
                style={{
                  padding: "0.85rem 1rem",
                  borderRadius: "var(--radius-md)",
                  background: "var(--surface-2)",
                  border: "1px solid var(--surface-border)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.55rem",
                  fontSize: "0.78rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "var(--muted)" }}>Database Schema:</span>
                  <span className="badge v2-badge-info" style={{ fontSize: "0.72rem" }}>KwakoPosDB v4 (Schema IDB)</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "var(--muted)" }}>Hardware Data Vault:</span>
                  <span className="badge v2-badge-success" style={{ fontSize: "0.72rem" }}>AES-GCM-256 WebCrypto</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "var(--muted)" }}>Conflict Engine:</span>
                  <span className="badge v2-badge-info" style={{ fontSize: "0.72rem" }}>CRDT + Monotonic HLC</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "var(--muted)" }}>Tenant / Branch:</span>
                  <span style={{ fontWeight: 700, fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>
                    {currentTenantName} / {currentBranchName}
                  </span>
                </div>
                {metrics.storageQuotaTotalBytes ? (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "var(--muted)" }}>Storage Quota Usage:</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem" }}>
                      {formatBytes(metrics.storageQuotaUsedBytes)} / {formatBytes(metrics.storageQuotaTotalBytes)}
                    </span>
                  </div>
                ) : null}
              </div>

              {/* Feedback Banner */}
              {feedbackMsg && (
                <div
                  style={{
                    padding: "0.6rem 0.85rem",
                    borderRadius: "var(--radius-md)",
                    background: feedbackMsg.isError ? "var(--danger-muted)" : "var(--success-muted)",
                    border: `1px solid ${feedbackMsg.isError ? "var(--danger)" : "var(--success)"}`,
                    color: feedbackMsg.isError ? "var(--danger)" : "var(--success)",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  {feedbackMsg.isError ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
                  <span>{feedbackMsg.text}</span>
                </div>
              )}
            </div>

            {/* Modal Actions Footer */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "1rem 1.5rem",
                borderTop: "1px solid var(--surface-border)",
                background: "var(--surface)",
              }}
            >
              <button
                type="button"
                className="v2-btn v2-btn-outline v2-btn-sm"
                onClick={toggleOfflineSimulation}
              >
                {isSimulatedOffline ? (
                  <>
                    <Wifi size={13} style={{ marginRight: "0.35rem", color: "var(--success)" }} />
                    <span>Go Online</span>
                  </>
                ) : (
                  <>
                    <WifiOff size={13} style={{ marginRight: "0.35rem", color: "var(--warning)" }} />
                    <span>Simulate Offline</span>
                  </>
                )}
              </button>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="v2-btn v2-btn-outline v2-btn-sm"
                  disabled={effectiveIsSyncing}
                  onClick={handleForceProbe}
                >
                  <RefreshCw size={13} style={{ marginRight: "0.35rem" }} className={effectiveIsSyncing ? "animate-spin" : ""} />
                  <span>{effectiveIsSyncing ? "Probing..." : "Force Sync Now"}</span>
                </button>
                <button
                  type="button"
                  className="v2-btn v2-btn-primary v2-btn-sm"
                  onClick={() => setShowDiagnostics(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
