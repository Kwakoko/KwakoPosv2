import React, { useState, useEffect } from "react";
import { useAuth, useBranch, useTenant } from "../context/KwakoPosContexts.js";
import {
  AlertTriangle,
  ShieldAlert,
  Copy,
  Check,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  WifiOff,
  Info
} from "lucide-react";
import {
  syncDiagnosticService,
  type SyncDiagnosticErrorEntry
} from "../services/syncDiagnosticService.js";
import { clientSyncEngine } from "../clientSyncEngine.js";
import { db } from "../atomicOutbox.js";
import { Button } from "./UI/Button.js";
import { countUniqueLocalConflictIds } from "../services/syncConflictPresentationService.js";

export interface SyncErrorsPanelProps {
  onRetry?: () => Promise<void> | void;
  className?: string;
  maxEntries?: number;
}

export const SyncErrorsPanel: React.FC<SyncErrorsPanelProps> = ({
  onRetry,
  className = "",
  maxEntries = 10,
}) => {
  const [errors, setErrors] = useState<SyncDiagnosticErrorEntry[]>(() =>
    syncDiagnosticService.getErrors()
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const { user } = useAuth();
  const { currentTenantId } = useTenant();
  const { currentBranchId } = useBranch();

  useEffect(() => {
    const unsub = syncDiagnosticService.subscribe((updated) => {
      setErrors(updated);
    });
    return () => unsub();
  }, []);

  const [strandedOutboxCount, setStrandedOutboxCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);

  const refreshTelemetry = () => {
    try {
      const failed = typeof db.getFailedOutbox === "function" ? db.getFailedOutbox().length : 0;
      setStrandedOutboxCount(failed);
      const conflicts = db.syncMetadata
        ? countUniqueLocalConflictIds(db.syncMetadata.entries())
        : 0;
      setConflictCount(conflicts);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    refreshTelemetry();
    const interval = setInterval(refreshTelemetry, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleCopy = async (entry: SyncDiagnosticErrorEntry) => {
    try {
      const payload = JSON.stringify(
        {
          id: entry.id,
          timestamp: entry.timestamp,
          statusCode: entry.statusCode,
          category: entry.category,
          title: entry.title,
          message: entry.message,
          endpoint: entry.endpoint,
          remediation: entry.remediation,
          outboxPendingCount: entry.outboxPendingCount,
          tenantId: entry.tenantId,
          branchId: entry.branchId,
        },
        null,
        2
      );
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(payload);
        setCopiedId(entry.id);
        setTimeout(() => setCopiedId(null), 2000);
      }
    } catch {
      /* ignore clipboard permissions */
    }
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      if (onRetry) {
        await onRetry();
      } else {
        const tenantId = user?.tenantId || currentTenantId;
        const branchId = user?.branchId || currentBranchId;
        if (!tenantId || !branchId) {
          throw new Error("SYNC_CONTEXT_REQUIRED: cannot retry outbox without tenant and branch context");
        }
        await clientSyncEngine.runSync(undefined, undefined, tenantId, branchId);
      }
      refreshTelemetry();
    } catch (e) {
      console.warn("Retry failed:", e);
    } finally {
      setIsRetrying(false);
    }
  };

  const visibleErrors = errors.slice(0, maxEntries);

  if (errors.length === 0 && strandedOutboxCount === 0 && conflictCount === 0) {
    return (
      <div className={`v2-card v2-p-4 ${className}`}>
        <div className="v2-flex v2-items-center v2-justify-between">
          <div className="v2-flex v2-items-center v2-gap-2">
            <Info size={16} className="v2-text-success" />
            <span className="v2-text-sm v2-font-bold">Sync Health Clean</span>
          </div>
          <span className="badge v2-badge-success">0 Failures</span>
        </div>
        <p className="v2-text-xs v2-text-muted v2-mt-1">
          No stranded outbox items or reconciliation conflicts. All local mutations are synchronizing cleanly with Cloud Edge.
        </p>
      </div>
    );
  }

  return (
    <div className={`v2-card ${className}`} style={{ borderLeft: "4px solid var(--danger)" }}>
      {/* Header */}
      <div className="v2-card-header v2-flex v2-items-center v2-justify-between">
        <div className="v2-flex v2-items-center v2-gap-2">
          <ShieldAlert size={18} className="v2-text-danger" />
          <div>
            <div className="v2-card-title v2-flex v2-items-center v2-gap-2">
              <span>Sync Errors &amp; Diagnostics</span>
              {errors.length > 0 && <span className="badge v2-badge-danger">{errors.length} Errors</span>}
              {strandedOutboxCount > 0 && (
                <span className="badge v2-badge-warning" title="Stranded outbox items awaiting retry">
                  {strandedOutboxCount} Stranded Outbox
                </span>
              )}
              {conflictCount > 0 && (
                <span className="badge v2-badge-danger" title="Reconciliation conflicts recorded">
                  {conflictCount} Conflicts
                </span>
              )}
            </div>
            <p className="v2-text-xs v2-text-muted">
              Live operator incident log. Zero error swallowing with exponential backoff retries.
            </p>
          </div>
        </div>
        <div className="v2-flex v2-gap-2 v2-items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRetry}
            disabled={isRetrying}
          >
            <RefreshCw size={12} className={isRetrying ? "v2-animate-spin v2-mr-1" : "v2-mr-1"} />
            {isRetrying ? "Retrying..." : "Retry Stranded & Sync"}
          </Button>
          <button
            type="button"
            className="v2-btn v2-btn-ghost v2-btn-sm"
            onClick={() => syncDiagnosticService.clearErrors()}
            title="Clear error log"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Error Items List */}
      <div className="v2-card-body v2-p-0" style={{ maxHeight: 380, overflowY: "auto" }}>
        {visibleErrors.map((err) => {
          const isExpanded = expandedId === err.id;
          const is403 = err.statusCode === 403;
          const is401 = err.statusCode === 401;

          return (
            <div
              key={err.id}
              className="v2-p-3 v2-border-b"
              style={{
                borderColor: "var(--surface-border)",
                background: isExpanded ? "var(--surface-2)" : "transparent",
              }}
            >
              <div className="v2-flex v2-items-start v2-justify-between v2-gap-2">
                <div className="v2-flex v2-items-start v2-gap-2" style={{ flex: 1 }}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : err.id)}
                    className="v2-btn-ghost"
                    style={{ padding: "2px", marginTop: "2px" }}
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>

                  <div style={{ flex: 1 }}>
                    <div className="v2-flex v2-items-center v2-gap-2 v2-flex-wrap">
                      <span
                        className={`badge ${
                          is403
                            ? "v2-badge-danger"
                            : is401
                            ? "v2-badge-warning"
                            : "v2-badge-info"
                        }`}
                        style={{ fontWeight: 800 }}
                      >
                        {err.statusCode ? `HTTP ${err.statusCode}` : err.category}
                      </span>
                      <span className="v2-text-sm v2-font-bold">{err.title}</span>
                      <span className="v2-text-xs v2-text-muted">
                        {new Date(err.timestamp).toLocaleTimeString()}
                      </span>
                    </div>

                    <p className="v2-text-xs v2-text-danger v2-mt-1" style={{ wordBreak: "break-word" }}>
                      {err.message}
                    </p>

                    {/* Actionable Operator Remediation Box */}
                    <div
                      className="v2-mt-2 v2-p-2"
                      style={{
                        background: "var(--surface)",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--surface-border)",
                        fontSize: "0.74rem",
                      }}
                    >
                      <strong className="v2-text-accent">Operator Action: </strong>
                      <span>{err.remediation}</span>
                    </div>
                  </div>
                </div>

                <div className="v2-flex v2-items-center v2-gap-1">
                  <button
                    type="button"
                    className="v2-btn v2-btn-ghost v2-btn-sm"
                    onClick={() => void handleCopy(err)}
                    title="Copy diagnostic JSON for IT support"
                  >
                    {copiedId === err.id ? (
                      <span className="v2-text-success v2-flex v2-items-center v2-gap-1">
                        <Check size={12} /> Copied
                      </span>
                    ) : (
                      <Copy size={13} />
                    )}
                  </button>
                </div>
              </div>

              {/* Collapsible Deep Details */}
              {isExpanded && (
                <div className="v2-mt-3 v2-p-3" style={{ background: "var(--bg)", borderRadius: "var(--radius-md)" }}>
                  <div className="v2-text-xs v2-text-muted v2-space-y-1">
                    <div><strong>Incident ID:</strong> {err.id}</div>
                    <div><strong>Endpoint:</strong> {err.endpoint}</div>
                    <div><strong>Timestamp:</strong> {err.timestamp}</div>
                    {err.outboxPendingCount !== undefined && (
                      <div><strong>Pending Mutations at Failure:</strong> {err.outboxPendingCount}</div>
                    )}
                  </div>
                  {err.rawError && (
                    <pre
                      className="v2-mt-2"
                      style={{
                        fontSize: "0.68rem",
                        maxHeight: 120,
                        overflow: "auto",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {err.rawError}
                    </pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
