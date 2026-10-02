import React, { useState, useEffect, useMemo } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, X, ShieldAlert, Layers } from "lucide-react";
import { apiFetch } from "../services/apiClient.js";

export interface SyncConflictItem {
  id: string;
  entityType: string;
  entityId: string;
  operationId?: string;
  status: string;
  detectedAt?: string;
  localPayload?: any;
  remoteRecord?: any;
  error?: string;
  operationType?: "CREATE" | "UPDATE" | "DELETE";
}

interface SyncConflictResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  localDb: any;
}

export const SyncConflictResolutionModal: React.FC<SyncConflictResolutionModalProps> = ({
  isOpen,
  onClose,
  localDb,
}) => {
  const [conflicts, setConflicts] = useState<SyncConflictItem[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadConflicts = async () => {
    if (!localDb) return;
    const byId = new Map<string, SyncConflictItem>();
    try {
      const response = await apiFetch<any>("/sync/conflicts?status=OPEN");
      const serverItems = Array.isArray(response?.data) ? response.data : [];
      for (const item of serverItems) {
        const id = String(item?.id || "").trim();
        if (!id) continue;
        byId.set(id, {
          id,
          entityType: String(item?.entityType || "Conflict"),
          entityId: String(item?.entityId || "N/A"),
          operationId: item?.operationId,
          operationType: item?.operationType,
          status: String(item?.status || "OPEN"),
          detectedAt: item?.detectedAt,
          localPayload: item?.localPayload,
          remoteRecord: item?.remoteRecord,
          error: item?.error,
        });
      }
    } catch {
      // Offline fallback: retain durable local conflict metadata.
    }
    for (const [key, value] of localDb.syncMetadata.entries()) {
      if (!key.startsWith("sync_conflict_")) continue;
      try {
        const parsed = JSON.parse(value);
        const id = String(parsed?.conflictId || key.replace("sync_conflict_", "")).trim();
        if (!id || byId.has(id)) continue;
        byId.set(id, {
          id,
          entityType: String(parsed?.entityType || "Unknown"),
          entityId: String(parsed?.entityId || "N/A"),
          operationId: parsed?.operationId,
          operationType: parsed?.operationType,
          status: String(parsed?.status || "OPEN"),
          detectedAt: parsed?.detectedAt,
          localPayload: parsed?.localPayload,
          remoteRecord: parsed?.remoteRecord,
          error: parsed?.error,
        });
      } catch {
        // Ignore corrupt local metadata.
      }
    }
    setConflicts([...byId.values()].filter((item) => item.status === "OPEN"));
  };

  useEffect(() => {
    if (!isOpen) return;
    void loadConflicts();
    const timer = window.setInterval(() => void loadConflicts(), 5000);
    return () => window.clearInterval(timer);
  }, [isOpen, localDb]);

  const handleResolve = async (
    conflict: SyncConflictItem,
    action: "ACCEPT_SERVER" | "ACCEPT_LOCAL" | "MERGE",
  ) => {
    setResolvingId(conflict.id);
    setMessage(null);
    try {
      let mergedPayload: Record<string, unknown> | undefined;
      if (action === "MERGE") {
        const remote = conflict.remoteRecord && typeof conflict.remoteRecord === "object" ? conflict.remoteRecord : {};
        const local = conflict.localPayload && typeof conflict.localPayload === "object" ? conflict.localPayload : {};
        mergedPayload = { ...(remote as Record<string, unknown>), ...(local as Record<string, unknown>) };
      }
      const response = await apiFetch<any>("/sync/conflicts/" + conflict.id + "/resolve", {
        method: "POST",
        body: JSON.stringify({ resolution: action, ...(mergedPayload ? { mergedPayload } : {}) }),
      });
      if (!response?.success || response?.data?.status !== "RESOLVED") {
        throw new Error(response?.error?.message || response?.error || "Conflict resolution was not confirmed by the server");
      }
      if (conflict.operationId && typeof localDb.markOutboxConflictResolved === "function") {
        localDb.markOutboxConflictResolved(conflict.operationId, action);
      }
      const deleteMetadata = typeof localDb.deleteSyncMetadata === "function"
        ? localDb.deleteSyncMetadata.bind(localDb)
        : (key: string) => {
            localDb.syncMetadata?.delete(key);
            localDb.persist?.("syncMetadata", key, undefined);
          };
      deleteMetadata("sync_conflict_" + conflict.id);
      deleteMetadata("sync_conflict_" + conflict.entityType + "_" + conflict.entityId);
      await localDb?.flushPersistence?.();
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("kwakopos:sync-conflict-resolved", {
            detail: { conflictId: conflict.id, action },
          }),
        );
        await new Promise<void>((resolve) => {
          let finished = false;
          const done = () => {
            if (finished) return;
            finished = true;
            resolve();
          };
          window.dispatchEvent(
            new CustomEvent("kwakopos:context-sync-now", {
              detail: { force: true, onComplete: done, onError: done },
            }),
          );
          window.setTimeout(done, 5000);
        });
      }
      setMessage("Conflict " + conflict.id + " resolved by " + action + ".");
      await loadConflicts();
    } catch (err: any) {
      setMessage("Failed to resolve conflict: " + (err?.message || String(err)));
    } finally {
      setResolvingId(null);
    }
  };
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "1rem",
      }}
    >
      <div
        style={{
          background: "var(--surface, #1e293b)",
          color: "var(--text, #f8fafc)",
          border: "1px solid var(--surface-border, #334155)",
          borderRadius: "0.75rem",
          maxWidth: "680px",
          width: "100%",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.4)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid var(--surface-border, #334155)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <ShieldAlert size={22} color="#f59e0b" />
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
              Offline Sync & Oversell Conflicts ({conflicts.length})
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--muted, #94a3b8)",
              cursor: "pointer",
              padding: "0.25rem",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Feedback Message */}
        {message && (
          <div
            style={{
              margin: "1rem 1.5rem 0",
              padding: "0.6rem 0.85rem",
              borderRadius: "0.375rem",
              background: "rgba(16, 185, 129, 0.15)",
              border: "1px solid #10b981",
              color: "#34d399",
              fontSize: "0.85rem",
            }}
          >
            {message}
          </div>
        )}

        {/* Content Body */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          {conflicts.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "2.5rem 1rem",
                color: "var(--muted, #94a3b8)",
              }}
            >
              <CheckCircle2 size={40} color="#10b981" style={{ margin: "0 auto 0.75rem" }} />
              <p style={{ margin: 0, fontWeight: 600, fontSize: "0.95rem" }}>
                Zero Divergence: All local mutations are fully synchronized.
              </p>
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem" }}>
                No oversell discrepancies or parent-child conversion conflicts detected.
              </p>
            </div>
          ) : (
            conflicts.map((c) => (
              <div
                key={c.id}
                style={{
                  border: "1px solid var(--surface-border, #334155)",
                  borderRadius: "0.5rem",
                  padding: "1rem",
                  background: "rgba(15, 23, 42, 0.6)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span
                    style={{
                      background: c.entityType === "SaleOversell" ? "rgba(239, 68, 68, 0.2)" : "rgba(245, 158, 11, 0.2)",
                      color: c.entityType === "SaleOversell" ? "#f87171" : "#fbbf24",
                      padding: "0.2rem 0.5rem",
                      borderRadius: "0.25rem",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                    }}
                  >
                    {c.entityType}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--muted, #94a3b8)", fontFamily: "monospace" }}>
                    ID: {c.entityId}
                  </span>
                </div>

                <div style={{ fontSize: "0.82rem", color: "var(--text, #f8fafc)" }}>
                  {c.entityType === "SaleOversell" ? (
                    <p style={{ margin: 0 }}>
                      Physical oversell detected. Sold quantity exceeded available backend inventory before reconciliation.
                    </p>
                  ) : (
                    <p style={{ margin: 0 }}>
                      Concurrent modification detected between local offline state and server state.
                    </p>
                  )}
                </div>

                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                  {c.entityType !== "SaleOversell" && c.entityType !== "UnitConversionConflict" && (
                    <button
                      type="button"
                      disabled={resolvingId === c.id}
                      onClick={() => handleResolve(c, "ACCEPT_LOCAL")}
                      style={{
                        padding: "0.4rem 0.75rem",
                        borderRadius: "0.375rem",
                        background: "#3b82f6",
                        color: "#fff",
                        border: "none",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Accept Local State
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={resolvingId === c.id}
                    onClick={() => handleResolve(c, "ACCEPT_SERVER")}
                    style={{
                      padding: "0.4rem 0.75rem",
                      borderRadius: "0.375rem",
                      background: "#10b981",
                      color: "#fff",
                      border: "none",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {c.entityType === "SaleOversell" || c.entityType === "UnitConversionConflict" ? "Acknowledge Server State" : "Accept Server State"}
                  </button>
                  {c.entityType !== "SaleOversell" && c.entityType !== "UnitConversionConflict" && (
                    <button
                      type="button"
                      disabled={resolvingId === c.id}
                      onClick={() => handleResolve(c, "MERGE")}
                      style={{
                        padding: "0.4rem 0.75rem",
                        borderRadius: "0.375rem",
                        background: "transparent",
                        color: "var(--text, #f8fafc)",
                        border: "1px solid var(--surface-border, #334155)",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Merge Local Changes
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "1rem 1.5rem",
            borderTop: "1px solid var(--surface-border, #334155)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              background: "var(--surface-2, #334155)",
              color: "var(--text, #f8fafc)",
              border: "none",
              fontSize: "0.82rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
