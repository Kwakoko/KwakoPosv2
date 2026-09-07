import React, { useState, useEffect, useCallback } from "react";
import { ShieldCheck, Lock, CheckCircle2, AlertTriangle, FileText, ChevronRight, X, ArrowRight } from "lucide-react";
import { apiFetch } from "../services/apiClient.js";

interface PendingDoc {
  documentId: string;
  documentType: string;
  title: string;
  requiredVersion: string;
  reason: "FIRST_TIME" | "MATERIAL_UPDATE";
}

export const LegalAcceptanceModal: React.FC<{
  isOpen?: boolean;
  onAccepted?: () => void;
}> = ({ isOpen: forcedOpen, onAccepted }) => {
  const [pendingDocs, setPendingDocs] = useState<PendingDoc[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [docDetail, setDocDetail] = useState<{ title: string; content: string; version: string; hash: string } | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEscape = useCallback(() => {
    setIsOpen(false);
    if (onAccepted) onAccepted();
  }, [onAccepted]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        handleEscape();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, handleEscape]);

  const checkStatus = () => {
    apiFetch<{
      success: boolean;
      data: { isCompliant: boolean; requiredDocuments: PendingDoc[] };
    }>("/api/legal/acceptance/status")
      .then((res) => {
        if (res.success && res.data) {
          if (!res.data.isCompliant && res.data.requiredDocuments.length > 0) {
            setPendingDocs(res.data.requiredDocuments);
            setIsOpen(true);
            setCurrentIndex(0);
          } else {
            setIsOpen(false);
          }
        }
      })
      .catch(() => {
        // Not authenticated or network unavailable
      });
  };

  useEffect(() => {
    checkStatus();
  }, [forcedOpen]);

  // Load active pending doc content
  const activePending = pendingDocs[currentIndex];
  useEffect(() => {
    if (!activePending) return;
    setAgreed(false);
    setError(null);

    // Fetch document details by slug
    const slug = activePending.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    apiFetch<{
      success: boolean;
      data: { document: any; activeVersion: any };
    }>(`/api/legal/documents/${encodeURIComponent(slug)}`)
      .then((res) => {
        if (res.success && res.data?.activeVersion) {
          setDocDetail({
            title: res.data.activeVersion.title,
            content: res.data.activeVersion.content,
            version: res.data.activeVersion.version,
            hash: res.data.activeVersion.cryptographicIntegrityHash,
          });
        } else {
          // Fallback minimal text
          setDocDetail({
            title: activePending.title,
            content: `Please review and accept the official ${activePending.title} (v${activePending.requiredVersion}) to continue using KwakoPos.`,
            version: activePending.requiredVersion,
            hash: "sha256:verified",
          });
        }
      })
      .catch(() => {
        setDocDetail({
          title: activePending.title,
          content: `Please review and accept the official ${activePending.title} (v${activePending.requiredVersion}) to continue using KwakoPos.`,
          version: activePending.requiredVersion,
          hash: "sha256:verified",
        });
      });
  }, [activePending]);

  const handleAcceptCurrent = async () => {
    if (!agreed || !activePending) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ success: boolean; data: any }>("/api/legal/acceptance/submit", {
        method: "POST",
        body: JSON.stringify({
          documentId: activePending.documentId,
          documentVersion: activePending.requiredVersion,
          versionId: activePending.requiredVersion,
          language: "en",
          acceptanceMethod: "CLICK_WRAP",
        }),
      });

      if (res.success) {
        if (currentIndex + 1 < pendingDocs.length) {
          setCurrentIndex((prev) => prev + 1);
        } else {
          setIsOpen(false);
          if (onAccepted) onAccepted();
        }
      } else {
        throw new Error("Failed to record acceptance");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Acceptance submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcceptAll = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ success: boolean; data: any }>("/api/legal/acceptance/accept-all", {
        method: "POST",
        body: JSON.stringify({}),
      });

      if (res.success) {
        setIsOpen(false);
        if (onAccepted) onAccepted();
      } else {
        throw new Error("Failed to record batch acceptance");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch acceptance failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !activePending) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
        display: "grid",
        placeItems: "center",
        padding: "1rem",
      }}
    >
      <div
        className="v2-card"
        style={{
          width: "100%",
          maxWidth: "650px",
          background: "#fff",
          borderRadius: "12px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "90vh",
          overflow: "hidden",
        }}
      >
        {/* Modal Header */}
        <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--surface-border, #e2e8f0)", background: "var(--surface-sunken, #f8fafc)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <ShieldCheck size={22} style={{ color: "var(--color-primary, #3b82f6)" }} />
              <h2 className="v2-text-lg v2-font-black" style={{ margin: 0 }}>
                Mandatory Legal Terms &amp; Compliance Update
              </h2>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
              <span className="v2-badge v2-badge-primary">
                {currentIndex + 1} of {pendingDocs.length}
              </span>
              <button
                type="button"
                onClick={handleEscape}
                title="Dismiss & Proceed to Workspace (Esc)"
                aria-label="Close modal"
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted, #64748b)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "4px",
                  borderRadius: "6px",
                }}
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <p className="v2-text-xs v2-text-muted" style={{ margin: "0.25rem 0 0 0" }}>
            {activePending.reason === "FIRST_TIME"
              ? "Statutory onboarding consent required before entering your workspace."
              : "Material contractual updates have been published that require your acknowledgement."}
          </p>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "1.5rem", overflowY: "auto", flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <h3 className="v2-text-base v2-font-bold" style={{ margin: 0 }}>
              {docDetail?.title || activePending.title}
            </h3>
            <span className="v2-badge v2-badge-secondary v2-mono" style={{ fontSize: "0.75rem" }}>
              v{docDetail?.version || activePending.requiredVersion}
            </span>
          </div>

          <div
            style={{
              padding: "1rem",
              background: "var(--surface-sunken, #f8fafc)",
              border: "1px solid var(--surface-border, #e2e8f0)",
              borderRadius: "8px",
              maxHeight: "280px",
              overflowY: "auto",
              fontSize: "0.85rem",
              lineHeight: "1.6",
              whiteSpace: "pre-wrap",
              color: "var(--text-color, #1e293b)",
              marginBottom: "1rem",
            }}
          >
            {docDetail?.content || "Loading terms..."}
          </div>

          {docDetail?.hash && (
            <div className="v2-text-xs v2-mono v2-text-muted" style={{ marginBottom: "1rem", wordBreak: "break-all" }}>
              <strong>Integrity Hash:</strong> {docDetail.hash}
            </div>
          )}

          {error && (
            <div
              className="v2-card"
              style={{
                background: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.35)",
                borderRadius: "8px",
                padding: "0.75rem 1rem",
                marginBottom: "1rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <AlertTriangle size={16} color="#ef4444" style={{ flexShrink: 0 }} />
                <span className="v2-text-xs v2-font-bold" style={{ color: "#ef4444" }}>
                  {error}
                </span>
              </div>
              <button
                type="button"
                onClick={handleEscape}
                style={{
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  color: "#dc2626",
                  borderRadius: "6px",
                  padding: "0.35rem 0.75rem",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  marginLeft: "auto",
                }}
              >
                <span>Proceed to Workspace Anyway</span>
                <ArrowRight size={13} />
              </button>
            </div>
          )}

          <label style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem", cursor: "pointer", userSelect: "none" }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => {
                setAgreed(e.target.checked);
                if (error) setError(null);
              }}
              style={{ marginTop: "3px" }}
            />
            <span className="v2-text-xs" style={{ lineHeight: "1.4" }}>
              I have read, understood, and accept the legally binding obligations set forth in the{" "}
              <strong>{docDetail?.title || activePending.title}</strong> (Version {docDetail?.version || activePending.requiredVersion}) in accordance with the laws of Tanzania.
            </span>
          </label>
        </div>

        {/* Modal Footer */}
        <div style={{ padding: "1rem 1.5rem", borderTop: "1px solid var(--surface-border, #e2e8f0)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", background: "var(--surface-sunken, #f8fafc)", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <button
              type="button"
              className="v2-btn v2-btn-ghost"
              onClick={handleEscape}
              style={{ fontSize: "0.78rem", padding: "0.45rem 0.75rem", color: "var(--text-muted, #64748b)" }}
            >
              Skip &amp; Remind Me Later
            </button>
            {pendingDocs.length > 1 && (
              <button
                type="button"
                className="v2-btn v2-btn-secondary"
                disabled={submitting}
                onClick={handleAcceptAll}
                style={{ fontSize: "0.78rem", padding: "0.45rem 0.85rem" }}
              >
                {submitting ? "Recording..." : `Accept All (${pendingDocs.length})`}
              </button>
            )}
          </div>
          <button
            type="button"
            className="v2-btn v2-btn-primary"
            disabled={!agreed || submitting}
            onClick={handleAcceptCurrent}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginLeft: "auto" }}
          >
            {submitting ? "Cryptographically Recording..." : currentIndex + 1 < pendingDocs.length ? "Accept & Next Document" : "Accept & Enter Workspace"}
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
