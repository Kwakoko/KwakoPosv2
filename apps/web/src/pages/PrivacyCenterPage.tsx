import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  UserCheck,
  Download,
  Trash2,
  Lock,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  RefreshCw,
  ArrowLeft,
  Eye,
  Key,
} from "lucide-react";
import { apiFetch } from "../services/applicationApiService.js";

interface DsrItem {
  id: string;
  requestType: string;
  status: string;
  createdAt: string;
  resolution?: string | null;
  resolvedAt?: string | null;
}

interface ExportJobItem {
  id: string;
  scope: string;
  format: string;
  status: string;
  createdAt: string;
  downloadToken?: string | null;
}

export const PrivacyCenterPage: React.FC<{ onNavigate?: (path: string) => void }> = ({ onNavigate }) => {
  const [activeTab, setActiveTab] = useState<"dsr" | "export" | "consent" | "storage">("dsr");
  const [dsrType, setDsrType] = useState("ACCESS");
  const [dsrDetails, setDsrDetails] = useState("");
  const [submittingDsr, setSubmittingDsr] = useState(false);
  const [dsrSuccessMessage, setDsrSuccessMessage] = useState<string | null>(null);
  const [dsrError, setDsrError] = useState<string | null>(null);
  const [dsrList, setDsrList] = useState<DsrItem[]>([]);

  // Data Export state
  const [exportScope, setExportScope] = useState<"USER_SPECIFIC" | "TENANT_WIDE">("USER_SPECIFIC");
  const [exporting, setExporting] = useState(false);
  const [activeExportJob, setActiveExportJob] = useState<ExportJobItem | null>(null);
  const [downloadPayload, setDownloadPayload] = useState<any | null>(null);

  // Load existing DSR requests
  const loadDsrRequests = () => {
    apiFetch<{ success: boolean; data: DsrItem[] }>("/api/legal/dsr/requests")
      .then((res) => {
        if (res.success && res.data) {
          setDsrList(res.data);
        }
      })
      .catch((err) => console.error("Could not load DSR list", err));
  };

  useEffect(() => {
    loadDsrRequests();
  }, []);

  const handleDsrSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingDsr(true);
    setDsrError(null);
    setDsrSuccessMessage(null);

    try {
      const res = await apiFetch<{ success: boolean; data: any }>("/api/legal/dsr/request", {
        method: "POST",
        body: JSON.stringify({
          requestType: dsrType,
          details: dsrDetails,
        }),
      });

      if (res.success) {
        setDsrSuccessMessage("Your Data Subject Request has been filed and registered under statutory audit control.");
        setDsrDetails("");
        loadDsrRequests();
      } else {
        throw new Error("Failed to submit request");
      }
    } catch (err) {
      setDsrError(err instanceof Error ? err.message : "DSR submission failed");
    } finally {
      setSubmittingDsr(false);
    }
  };

  const handleRequestExport = async () => {
    setExporting(true);
    setDownloadPayload(null);
    try {
      const res = await apiFetch<{ success: boolean; data: ExportJobItem }>("/api/legal/export/request", {
        method: "POST",
        body: JSON.stringify({ scope: exportScope }),
      });
      if (res.success && res.data) {
        setActiveExportJob(res.data);

        // Fetch download payload
        const dl = await apiFetch<{ success: boolean; data: { exportPayload: any } }>(
          `/api/legal/export/download/${res.data.id}`
        );
        if (dl.success && dl.data) {
          setDownloadPayload(dl.data.exportPayload);
        }
      }
    } catch (err) {
      console.error("Export failed", err);
    } finally {
      setExporting(false);
    }
  };

  const triggerJsonDownload = () => {
    if (!downloadPayload) return;
    const blob = new Blob([JSON.stringify(downloadPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kwakopos-data-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="v2-page-container" style={{ padding: "1.5rem", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {onNavigate && (
            <button
              type="button"
              className="v2-btn v2-btn-secondary"
              onClick={() => onNavigate("/")}
              style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.4rem 0.75rem" }}
            >
              <ArrowLeft size={16} /> Return to App
            </button>
          )}
          <div>
            <h1 className="v2-text-2xl v2-font-black" style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <ShieldCheck size={24} style={{ color: "var(--color-primary, #3b82f6)" }} />
              Privacy Center &amp; Data Subject Rights
            </h1>
            <p className="v2-text-xs v2-text-muted" style={{ margin: 0 }}>
              Exercise your statutory rights under the Tanzania Personal Data Protection Act No. 5 of 2022 and platform governance
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--surface-border, #e2e8f0)", marginBottom: "1.5rem" }}>
        <button
          type="button"
          onClick={() => setActiveTab("dsr")}
          className={`v2-btn ${activeTab === "dsr" ? "v2-btn-primary" : "v2-btn-ghost"}`}
          style={{ borderRadius: "6px 6px 0 0", display: "flex", alignItems: "center", gap: "0.4rem" }}
        >
          <UserCheck size={16} /> Data Subject Rights (DSR)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("export")}
          className={`v2-btn ${activeTab === "export" ? "v2-btn-primary" : "v2-btn-ghost"}`}
          style={{ borderRadius: "6px 6px 0 0", display: "flex", alignItems: "center", gap: "0.4rem" }}
        >
          <Download size={16} /> Download My Data
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("storage")}
          className={`v2-btn ${activeTab === "storage" ? "v2-btn-primary" : "v2-btn-ghost"}`}
          style={{ borderRadius: "6px 6px 0 0", display: "flex", alignItems: "center", gap: "0.4rem" }}
        >
          <Key size={16} /> Security &amp; Storage Transparency
        </button>
      </div>

      {/* DSR Tab */}
      {activeTab === "dsr" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
          {/* Submission Form */}
          <div className="v2-card" style={{ padding: "1.5rem" }}>
            <h2 className="v2-text-lg v2-font-black" style={{ marginBottom: "0.5rem" }}>
              Submit a Privacy Request
            </h2>
            <p className="v2-text-xs v2-text-muted" style={{ marginBottom: "1.25rem" }}>
              You have the legal right to request access, correction, erasure, objection, or restriction of your personal data.
            </p>

            {dsrSuccessMessage && (
              <div className="v2-card" style={{ background: "rgba(16, 185, 129, 0.1)", border: "1px solid var(--color-success, #10b981)", padding: "0.75rem", marginBottom: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--color-success, #10b981)", fontSize: "0.85rem", fontWeight: "bold" }}>
                  <CheckCircle2 size={16} /> {dsrSuccessMessage}
                </div>
              </div>
            )}

            {dsrError && (
              <div className="v2-card" style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid var(--color-danger, #ef4444)", padding: "0.75rem", marginBottom: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--color-danger, #ef4444)", fontSize: "0.85rem", fontWeight: "bold" }}>
                  <AlertCircle size={16} /> {dsrError}
                </div>
              </div>
            )}

            <form onSubmit={handleDsrSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted" style={{ display: "block", marginBottom: "0.25rem" }}>
                  REQUEST TYPE
                </label>
                <select
                  className="v2-input"
                  value={dsrType}
                  onChange={(e) => setDsrType(e.target.value)}
                  style={{ width: "100%" }}
                >
                  <option value="ACCESS">Right to Access (Know what personal data is held)</option>
                  <option value="EXPORT">Right to Data Portability (Export copy of data)</option>
                  <option value="CORRECTION">Right to Rectification (Correct inaccurate records)</option>
                  <option value="DELETION">Right to Erasure / Anonymization (Subject to statutory tax holds)</option>
                  <option value="RESTRICTION">Right to Restrict Processing</option>
                  <option value="OBJECTION">Right to Object</option>
                  <option value="CONSENT_WITHDRAWAL">Withdraw Consent</option>
                </select>
              </div>

              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted" style={{ display: "block", marginBottom: "0.25rem" }}>
                  DETAILS &amp; SCOPE
                </label>
                <textarea
                  className="v2-input"
                  rows={4}
                  placeholder="Specify which accounts, transactions, or personal records this request applies to..."
                  value={dsrDetails}
                  onChange={(e) => setDsrDetails(e.target.value)}
                  style={{ width: "100%", resize: "vertical" }}
                  required
                />
              </div>

              <div style={{ background: "var(--surface-sunken, #f8fafc)", padding: "0.75rem", borderRadius: "6px", fontSize: "0.75rem", color: "var(--text-muted, #64748b)" }}>
                <span className="v2-font-bold">Legal Notice:</span> Requests for deletion of financial, fiscal, or audit transaction records are governed by the 7-year statutory retention obligations under the Tanzania Tax Administration Act. Records subject to active Legal Holds cannot be deleted until officially released.
              </div>

              <button type="submit" className="v2-btn v2-btn-primary" disabled={submittingDsr} style={{ alignSelf: "flex-start" }}>
                {submittingDsr ? "Filing Request..." : "Submit Formal DSR"}
              </button>
            </form>
          </div>

          {/* DSR Tracking Table */}
          <div className="v2-card" style={{ padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 className="v2-text-lg v2-font-black" style={{ margin: 0 }}>
                My Filed Requests ({dsrList.length})
              </h2>
              <button type="button" className="v2-btn v2-btn-ghost v2-btn-xs" onClick={loadDsrRequests}>
                <RefreshCw size={12} /> Refresh
              </button>
            </div>

            {dsrList.length === 0 ? (
              <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-muted, #94a3b8)" }}>
                <UserCheck size={32} style={{ margin: "0 auto 0.5rem auto", opacity: 0.5 }} />
                <p className="v2-text-sm" style={{ margin: 0 }}>No active or past privacy requests filed.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxHeight: "450px", overflowY: "auto" }}>
                {dsrList.map((req) => (
                  <div key={req.id} style={{ padding: "0.75rem", border: "1px solid var(--surface-border, #e2e8f0)", borderRadius: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="v2-badge v2-badge-primary">{req.requestType}</span>
                      <span className={`v2-badge ${req.status === "COMPLETED" ? "v2-badge-success" : req.status === "REJECTED" ? "v2-badge-danger" : "v2-badge-secondary"}`}>
                        {req.status}
                      </span>
                    </div>
                    <div className="v2-text-xs v2-text-muted" style={{ marginTop: "0.4rem" }}>
                      Filed on {new Date(req.createdAt).toLocaleString()}
                    </div>
                    {req.resolution && (
                      <div className="v2-text-xs" style={{ marginTop: "0.4rem", padding: "0.4rem", background: "var(--surface-sunken, #f8fafc)", borderRadius: "4px" }}>
                        <strong>Resolution:</strong> {req.resolution}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Export Data Tab */}
      {activeTab === "export" && (
        <div className="v2-card" style={{ padding: "2rem", maxWidth: "800px" }}>
          <h2 className="v2-text-xl v2-font-black" style={{ marginBottom: "0.5rem" }}>
            Self-Service Personal &amp; Operational Data Export
          </h2>
          <p className="v2-text-sm v2-text-muted" style={{ marginBottom: "1.5rem" }}>
            In accordance with Data Portability principles, you can export a complete machine-readable snapshot of your user profile, audit trail, and account records.
          </p>

          <div style={{ padding: "1rem", background: "rgba(59, 130, 246, 0.08)", border: "1px solid var(--color-primary, #3b82f6)", borderRadius: "8px", marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--color-primary, #3b82f6)", fontWeight: "bold", fontSize: "0.9rem" }}>
              <Lock size={16} /> Cryptographic Secrets Scrubbing Guarantee
            </div>
            <p className="v2-text-xs v2-text-muted" style={{ marginTop: "0.4rem", margin: 0 }}>
              For your safety, the KwakoPos Data Export Engine automatically identifies and cryptographically redacts all password hashes, Argon2 tokens, symmetric encryption keys, and API session credentials before generating the export artifact.
            </p>
          </div>

          <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "1.5rem" }}>
            <div>
              <label className="v2-text-xs v2-font-bold v2-text-muted" style={{ display: "block", marginBottom: "0.25rem" }}>
                EXPORT SCOPE
              </label>
              <select
                className="v2-input"
                value={exportScope}
                onChange={(e) => setExportScope(e.target.value as any)}
              >
                <option value="USER_SPECIFIC">My User Profile &amp; Audit Logs</option>
                <option value="TENANT_WIDE">Full Business Organization (Admin Only)</option>
              </select>
            </div>

            <div style={{ alignSelf: "flex-end" }}>
              <button
                type="button"
                className="v2-btn v2-btn-primary"
                onClick={handleRequestExport}
                disabled={exporting}
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <Download size={16} /> {exporting ? "Compiling Clean Export..." : "Generate Export Snapshot"}
              </button>
            </div>
          </div>

          {downloadPayload && (
            <div className="v2-card" style={{ padding: "1rem", border: "1px solid var(--surface-border, #e2e8f0)", background: "var(--surface-sunken, #f8fafc)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--color-success, #10b981)", fontWeight: "bold" }}>
                  <CheckCircle2 size={16} /> Export Ready for Download
                </div>
                <button
                  type="button"
                  className="v2-btn v2-btn-success v2-btn-sm"
                  onClick={triggerJsonDownload}
                  style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}
                >
                  <Download size={14} /> Download JSON File
                </button>
              </div>

              <pre className="v2-mono" style={{ fontSize: "0.75rem", maxHeight: "250px", overflowY: "auto", background: "#fff", padding: "0.75rem", borderRadius: "4px", border: "1px solid var(--surface-border, #e2e8f0)" }}>
                {JSON.stringify(downloadPayload, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Storage Transparency Tab */}
      {activeTab === "storage" && (
        <div className="v2-card" style={{ padding: "2rem", maxWidth: "800px" }}>
          <h2 className="v2-text-xl v2-font-black" style={{ marginBottom: "0.5rem" }}>
            Browser Storage &amp; Offline Cache Transparency
          </h2>
          <p className="v2-text-sm v2-text-muted" style={{ marginBottom: "1.5rem" }}>
            KwakoPos v2.0 operates as an offline-first Progressive Web Application (PWA). Local browser storage is utilized solely for resilient business operations:
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="v2-card" style={{ padding: "1rem", border: "1px solid var(--surface-border, #e2e8f0)" }}>
              <h3 className="v2-text-sm v2-font-bold" style={{ margin: 0 }}>Authentication Tokens</h3>
              <p className="v2-text-xs v2-text-muted" style={{ margin: "0.25rem 0 0.5rem 0" }}>
                Cryptographic session tokens and tenant identifiers stored in local storage to keep your cash register logged in safely during network drops.
              </p>
              <span className="v2-badge v2-badge-sm">Strictly Essential</span>
            </div>

            <div className="v2-card" style={{ padding: "1rem", border: "1px solid var(--surface-border, #e2e8f0)" }}>
              <h3 className="v2-text-sm v2-font-bold" style={{ margin: 0 }}>Offline Transaction Sync Outbox</h3>
              <p className="v2-text-xs v2-text-muted" style={{ margin: "0.25rem 0 0.5rem 0" }}>
                Pending POS sales, receipt print requests, and inventory deductions waiting for automatic synchronization when connectivity is restored.
              </p>
              <span className="v2-badge v2-badge-sm">Strictly Essential</span>
            </div>

            <div className="v2-card" style={{ padding: "1rem", border: "1px solid var(--surface-border, #e2e8f0)" }}>
              <h3 className="v2-text-sm v2-font-bold" style={{ margin: 0 }}>Zero Advertising &amp; Tracking Policy</h3>
              <p className="v2-text-xs v2-text-muted" style={{ margin: "0.25rem 0 0" }}>
                KwakoPos has zero tracking cookies, zero external analytics beacons, and does not sell or share business behavioral data with marketing brokers.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
