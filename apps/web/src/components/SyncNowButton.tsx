import React, { useState, useEffect, useCallback } from "react";
import { clientSyncEngine } from "../clientSyncEngine.js";
import { Button } from "./UI/Button.js";
import { SyncErrorsPanel } from "./SyncErrorsPanel.js";

export interface SyncNowButtonProps {
  onSyncComplete?: (result: { pushed: number; pulled: number }) => void;
  className?: string;
  showErrorDiagnostics?: boolean;
}

export const SyncNowButton: React.FC<SyncNowButtonProps> = ({
  onSyncComplete,
  className = "",
  showErrorDiagnostics = true,
}) => {
  const [syncStatus, setSyncStatus] = useState<"IDLE" | "RUNNING" | "SUCCESS" | "FAILED">("IDLE");
  const [outboxCount, setOutboxCount] = useState<number>(0);
  const [showErrors, setShowErrors] = useState<boolean>(false);

  const refreshOutboxCount = useCallback(async () => {
    try {
      const count = await clientSyncEngine.localDb.getPendingOutboxCount();
      setOutboxCount(count);
    } catch (err) {
      console.error("Failed to refresh outbox count:", err);
    }
  }, []);

  useEffect(() => {
    void refreshOutboxCount();
  }, [refreshOutboxCount]);

  const handleSyncNow = async () => {
    try {
      setSyncStatus("RUNNING"); // update UI state
      const result = await clientSyncEngine.runSync(); // run sync
      console.log("Sync result:", result);
      setSyncStatus("SUCCESS");
      setShowErrors(false);
      if (onSyncComplete) {
        onSyncComplete(result);
      }
    } catch (err) {
      console.error("Sync failed:", err);
      setSyncStatus("FAILED");
      setShowErrors(true);
    } finally {
      await refreshOutboxCount();
    }
  };

  return (
    <div className={`sync-now-module ${className}`.trim()}>
      <Button
        variant="primary"
        onClick={handleSyncNow}
        disabled={syncStatus === "RUNNING"}
      >
        Sync Now
      </Button>

      <div className="sync-feedback v2-mt-2 v2-text-sm">
        {syncStatus === "RUNNING" && <p className="v2-text-info">Syncing…</p>}
        {syncStatus === "SUCCESS" && <p className="v2-text-success">Sync completed!</p>}
        {syncStatus === "FAILED" && (
          <div className="v2-flex v2-items-center v2-gap-2">
            <p className="v2-text-danger">Sync failed. Check logs.</p>
            {showErrorDiagnostics && (
              <button
                type="button"
                className="v2-btn-ghost v2-text-xs v2-text-accent"
                onClick={() => setShowErrors((prev) => !prev)}
                style={{ textDecoration: "underline", padding: "0 4px" }}
              >
                {showErrors ? "Hide Diagnostics" : "View Sync Error Details"}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="outbox-count-badge v2-text-xs v2-text-muted v2-mt-1">
        Pending Outbox Items: {outboxCount}
      </div>

      {showErrorDiagnostics && showErrors && (
        <div className="v2-mt-3">
          <SyncErrorsPanel onRetry={handleSyncNow} />
        </div>
      )}
    </div>
  );
};
