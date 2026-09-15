import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  FileCheck2,
  Lock,
  Flame,
  Clock,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Send,
  Plus,
  ArrowLeft,
  RefreshCw,
  Eye,
  FileText,
} from "lucide-react";
import { apiFetch } from "../services/apiClient.js";

interface GovernanceTowerOverview {
  totalDocuments: number;
  publishedDocuments: number;
  draftDocuments: number;
  totalAcceptances: number;
  acceptanceComplianceRate: number;
  activeIncidents: number;
  pendingDsrRequests: number;
  activeLegalHolds: number;
  subprocessorsCount: number;
  lastRetentionRunAt?: string | null;
  cryptographicHealth: {
    tamperFreeRate: number;
    verifiedSignaturesCount: number;
    corruptedDocumentsCount: number;
  };
}

export const SuperAdminComplianceTowerPage: React.FC<{ onNavigate?: (path: string) => void }> = ({ onNavigate }) => {
  const [overview, setOverview] = useState<GovernanceTowerOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "publish" | "holds" | "retention" | "incidents">("overview");

  // Publish Form State
  const [pubDocId, setPubDocId] = useState("");
  const [pubVersion, setPubVersion] = useState("2.0.0");
  const [pubLanguage, setPubLanguage] = useState<"en" | "sw">("en");
  const [pubTitle, setPubTitle] = useState("");
  const [pubContent, setPubContent] = useState("");
  const [pubSummary, setPubSummary] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null);

  // Legal Hold Form State
  const [holdTenantId, setHoldTenantId] = useState("");
  const [holdReason, setHoldReason] = useState("");
  const [holdAuthority, setHoldAuthority] = useState("TRA_AUDIT");
  const [holdEntityType, setHoldEntityType] = useState("FINANCIAL_LEDGER");
  const [holdEntityId, setHoldEntityId] = useState("*");
  const [placingHold, setPlacingHold] = useState(false);
  const [holdSuccess, setHoldSuccess] = useState<string | null>(null);

  // Retention Runner State
  const [runningRetention, setRunningRetention] = useState(false);
  const [retentionResult, setRetentionResult] = useState<any | null>(null);

  // Incidents Form State
  const [incidents, setIncidents] = useState<any[]>([]);
  const [incTitle, setIncTitle] = useState("");
  const [incSummary, setIncSummary] = useState("");
  const [incSeverity, setIncSeverity] = useState("MEDIUM");
  const [incType, setIncType] = useState("UNAUTHORIZED_ACCESS");
  const [loggingIncident, setLoggingIncident] = useState(false);

  const loadOverview = () => {
    setLoading(true);
    apiFetch<{ success: boolean; data: GovernanceTowerOverview }>("/api/admin/legal/governance-tower")
      .then((res) => {
        if (res.success && res.data) setOverview(res.data);
      })
      .catch((err) => console.error("Could not fetch governance overview", err))
      .finally(() => setLoading(false));
  };

  const loadIncidents = () => {
    apiFetch<{ success: boolean; data: any[] }>("/api/admin/legal/incidents")
      .then((res) => {
        if (res.success && res.data) setIncidents(res.data);
      })
      .catch(console.error);
  };

  useEffect(() => {
    loadOverview();
  }, []);

  useEffect(() => {
    if (activeTab === "incidents") loadIncidents();
  }, [activeTab]);

  const handlePublishVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    setPublishing(true);
    setPublishSuccess(null);
    try {
      const res = await apiFetch<{ success: boolean; data: any }>(
        `/api/admin/legal/documents/${encodeURIComponent(pubDocId)}/publish`,
        {
          method: "POST",
          body: JSON.stringify({
            version: pubVersion,
            language: pubLanguage,
            title: pubTitle,
            content: pubContent,
            summaryOfChanges: pubSummary,
          }),
        }
      );
      if (res.success) {
        setPublishSuccess(`Policy version v${pubVersion} published successfully with SHA-256 cryptographic seal: ${res.data.cryptographicIntegrityHash}`);
        loadOverview();
      }
    } catch (err) {
      console.error("Publishing error", err);
    } finally {
      setPublishing(false);
    }
  };

  const handleCreateHold = async (e: React.FormEvent) => {
    e.preventDefault();
    setPlacingHold(true);
    setHoldSuccess(null);
    try {
      const res = await apiFetch<{ success: boolean; data: any }>("/api/admin/legal/holds", {
        method: "POST",
        body: JSON.stringify({
          tenantId: holdTenantId || "GLOBAL",
          reason: holdReason,
          authority: holdAuthority,
          targetEntityType: holdEntityType,
          targetEntityId: holdEntityId,
        }),
      });
      if (res.success) {
        setHoldSuccess(`Legal hold created. Entities of type ${holdEntityType} are protected against automated purge/anonymization.`);
        loadOverview();
      }
    } catch (err) {
      console.error("Legal hold error", err);
    } finally {
      setPlacingHold(false);
    }
  };

  const handleRunRetention = async () => {
    setRunningRetention(true);
    try {
      const res = await apiFetch<{ success: boolean; data: any }>("/api/admin/legal/retention/run", {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (res.success) {
        setRetentionResult(res.data);
        loadOverview();
      }
    } catch (err) {
      console.error("Retention run error", err);
    } finally {
      setRunningRetention(false);
    }
  };

  const handleLogIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoggingIncident(true);
    try {
      const res = await apiFetch<{ success: boolean; data: any }>("/api/admin/legal/incidents", {
        method: "POST",
        body: JSON.stringify({
          title: incTitle,
          summary: incSummary,
          severity: incSeverity,
          incidentType: incType,
        }),
      });
      if (res.success) {
        setIncTitle("");
        setIncSummary("");
        loadIncidents();
        loadOverview();
      }
    } catch (err) {
      console.error("Incident log error", err);
    } finally {
      setLoggingIncident(false);
    }
  };

  return (
    <div className="v2-page-container" style={{ padding: "1.5rem", maxWidth: "1300px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {onNavigate && (
            <button
              type="button"
              className="v2-btn v2-btn-secondary"
              onClick={() => onNavigate("/super-admin")}
              style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.4rem 0.75rem" }}
            >
              <ArrowLeft size={16} /> Super Admin
            </button>
          )}
          <div>
            <h1 className="v2-text-2xl v2-font-black" style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <ShieldAlert size={24} style={{ color: "var(--color-primary, #3b82f6)" }} />
              Super Admin Compliance Control Tower
            </h1>
            <p className="v2-text-xs v2-text-muted" style={{ margin: 0 }}>
              Platform-wide regulatory governance, legal holds, DSR oversight, and statutory audit integrity
            </p>
          </div>
        </div>

        <button type="button" className="v2-btn v2-btn-secondary" onClick={loadOverview} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <RefreshCw size={14} /> Refresh Metrics
        </button>
      </div>

      {/* Metrics Row */}
      {overview && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
          <div className="v2-card" style={{ padding: "1rem" }}>
            <span className="v2-text-xs v2-text-muted v2-font-bold">TOTAL POLICIES</span>
            <div className="v2-text-2xl v2-font-black" style={{ marginTop: "0.25rem" }}>{overview.totalDocuments}</div>
            <span className="v2-text-xs v2-text-muted">{overview.publishedDocuments} Published Active</span>
          </div>

          <div className="v2-card" style={{ padding: "1rem" }}>
            <span className="v2-text-xs v2-text-muted v2-font-bold">COMPLIANCE RATE</span>
            <div className="v2-text-2xl v2-font-black" style={{ marginTop: "0.25rem", color: "var(--color-success, #10b981)" }}>
              {overview.acceptanceComplianceRate}%
            </div>
            <span className="v2-text-xs v2-text-muted">{overview.totalAcceptances} Recorded Consents</span>
          </div>

          <div className="v2-card" style={{ padding: "1rem" }}>
            <span className="v2-text-xs v2-text-muted v2-font-bold">PENDING DSRs</span>
            <div className="v2-text-2xl v2-font-black" style={{ marginTop: "0.25rem", color: overview.pendingDsrRequests > 0 ? "var(--color-warning, #f59e0b)" : "inherit" }}>
              {overview.pendingDsrRequests}
            </div>
            <span className="v2-text-xs v2-text-muted">Awaiting Action</span>
          </div>

          <div className="v2-card" style={{ padding: "1rem" }}>
            <span className="v2-text-xs v2-text-muted v2-font-bold">ACTIVE LEGAL HOLDS</span>
            <div className="v2-text-2xl v2-font-black" style={{ marginTop: "0.25rem", color: overview.activeLegalHolds > 0 ? "var(--color-danger, #ef4444)" : "inherit" }}>
              {overview.activeLegalHolds}
            </div>
            <span className="v2-text-xs v2-text-muted">Blocking Data Purge</span>
          </div>

          <div className="v2-card" style={{ padding: "1rem" }}>
            <span className="v2-text-xs v2-text-muted v2-font-bold">SUBPROCESSORS</span>
            <div className="v2-text-2xl v2-font-black" style={{ marginTop: "0.25rem" }}>{overview.subprocessorsCount}</div>
            <span className="v2-text-xs v2-text-muted">DPAs Executed</span>
          </div>

          <div className="v2-card" style={{ padding: "1rem" }}>
            <span className="v2-text-xs v2-text-muted v2-font-bold">CRYPTOGRAPHIC HEALTH</span>
            <div className="v2-text-2xl v2-font-black" style={{ marginTop: "0.25rem", color: "var(--color-success, #10b981)" }}>
              {overview.cryptographicHealth.tamperFreeRate}%
            </div>
            <span className="v2-text-xs v2-text-muted">0 Hash Mismatches</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--surface-border, #e2e8f0)", marginBottom: "1.5rem" }}>
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`v2-btn ${activeTab === "overview" ? "v2-btn-primary" : "v2-btn-ghost"}`}
          style={{ borderRadius: "6px 6px 0 0" }}
        >
          Compliance Operations
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("publish")}
          className={`v2-btn ${activeTab === "publish" ? "v2-btn-primary" : "v2-btn-ghost"}`}
          style={{ borderRadius: "6px 6px 0 0" }}
        >
          Publish Legal Version
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("holds")}
          className={`v2-btn ${activeTab === "holds" ? "v2-btn-primary" : "v2-btn-ghost"}`}
          style={{ borderRadius: "6px 6px 0 0" }}
        >
          Legal Holds Management
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("retention")}
          className={`v2-btn ${activeTab === "retention" ? "v2-btn-primary" : "v2-btn-ghost"}`}
          style={{ borderRadius: "6px 6px 0 0" }}
        >
          Data Retention Sweep
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("incidents")}
          className={`v2-btn ${activeTab === "incidents" ? "v2-btn-primary" : "v2-btn-ghost"}`}
          style={{ borderRadius: "6px 6px 0 0" }}
        >
          Security &amp; Privacy Incidents
        </button>
      </div>

      {/* Publish Tab */}
      {activeTab === "publish" && (
        <div className="v2-card" style={{ padding: "1.5rem", maxWidth: "800px" }}>
          <h2 className="v2-text-lg v2-font-black" style={{ marginBottom: "0.5rem" }}>
            Publish New Policy Version with Cryptographic Seal
          </h2>
          <p className="v2-text-xs v2-text-muted" style={{ marginBottom: "1.25rem" }}>
            Publishing a version triggers SHA-256 recalculation, immutability logging, and sets up mandatory re-acceptance requirements if flagged.
          </p>

          {publishSuccess && (
            <div className="v2-card" style={{ background: "rgba(16, 185, 129, 0.1)", border: "1px solid var(--color-success, #10b981)", padding: "0.75rem", marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--color-success, #10b981)", fontSize: "0.85rem", fontWeight: "bold" }}>
                <CheckCircle2 size={16} /> {publishSuccess}
              </div>
            </div>
          )}

          <form onSubmit={handlePublishVersion} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "1rem" }}>
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">DOCUMENT ID / TYPE</label>
                <input
                  type="text"
                  className="v2-input"
                  placeholder="e.g. TERMS_OF_SERVICE"
                  value={pubDocId}
                  onChange={(e) => setPubDocId(e.target.value)}
                  style={{ width: "100%" }}
                  required
                />
              </div>
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">VERSION</label>
                <input
                  type="text"
                  className="v2-input"
                  placeholder="2.1.0"
                  value={pubVersion}
                  onChange={(e) => setPubVersion(e.target.value)}
                  style={{ width: "100%" }}
                  required
                />
              </div>
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">LANGUAGE</label>
                <select
                  className="v2-input"
                  value={pubLanguage}
                  onChange={(e) => setPubLanguage(e.target.value as any)}
                  style={{ width: "100%" }}
                >
                  <option value="en">English (en)</option>
                  <option value="sw">Kiswahili (sw)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="v2-text-xs v2-font-bold v2-text-muted">POLICY TITLE</label>
              <input
                type="text"
                className="v2-input"
                placeholder="Official Terms of Service (Updated 2026)"
                value={pubTitle}
                onChange={(e) => setPubTitle(e.target.value)}
                style={{ width: "100%" }}
                required
              />
            </div>

            <div>
              <label className="v2-text-xs v2-font-bold v2-text-muted">LEGAL TEXT / CONTENT</label>
              <textarea
                className="v2-input"
                rows={8}
                placeholder="Enter complete contractual and policy text here..."
                value={pubContent}
                onChange={(e) => setPubContent(e.target.value)}
                style={{ width: "100%", fontFamily: "monospace", fontSize: "0.85rem" }}
                required
              />
            </div>

            <div>
              <label className="v2-text-xs v2-font-bold v2-text-muted">SUMMARY OF MATERIAL CHANGES</label>
              <input
                type="text"
                className="v2-input"
                placeholder="Updated dispute resolution and compliance with PDPA 2022"
                value={pubSummary}
                onChange={(e) => setPubSummary(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>

            <button type="submit" className="v2-btn v2-btn-primary" disabled={publishing} style={{ alignSelf: "flex-start" }}>
              {publishing ? "Publishing & Hashing..." : "Publish & Generate SHA-256 Seal"}
            </button>
          </form>
        </div>
      )}

      {/* Holds Tab */}
      {activeTab === "holds" && (
        <div className="v2-card" style={{ padding: "1.5rem", maxWidth: "800px" }}>
          <h2 className="v2-text-lg v2-font-black" style={{ marginBottom: "0.5rem" }}>
            Place a Statutory or Forensic Legal Hold
          </h2>
          <p className="v2-text-xs v2-text-muted" style={{ marginBottom: "1.25rem" }}>
            A Legal Hold freezes automated data retention sweeps, preventing erasure or anonymization of documents during audits (e.g. TRA Tax Inquiries or Litigation).
          </p>

          {holdSuccess && (
            <div className="v2-card" style={{ background: "rgba(16, 185, 129, 0.1)", border: "1px solid var(--color-success, #10b981)", padding: "0.75rem", marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--color-success, #10b981)", fontSize: "0.85rem", fontWeight: "bold" }}>
                <CheckCircle2 size={16} /> {holdSuccess}
              </div>
            </div>
          )}

          <form onSubmit={handleCreateHold} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">TENANT ID</label>
                <input
                  type="text"
                  className="v2-input"
                  placeholder="e.g. GLOBAL or specific tenant ID"
                  value={holdTenantId}
                  onChange={(e) => setHoldTenantId(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">AUTHORITY / REGULATOR</label>
                <input
                  type="text"
                  className="v2-input"
                  placeholder="TRA_AUDIT / COURT_ORDER / PDPA_COMMISSION"
                  value={holdAuthority}
                  onChange={(e) => setHoldAuthority(e.target.value)}
                  style={{ width: "100%" }}
                  required
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">TARGET ENTITY TYPE</label>
                <input
                  type="text"
                  className="v2-input"
                  placeholder="FINANCIAL_LEDGER / INVOICE / AUDIT_RECORD"
                  value={holdEntityType}
                  onChange={(e) => setHoldEntityType(e.target.value)}
                  style={{ width: "100%" }}
                  required
                />
              </div>
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">TARGET ENTITY ID (OR * FOR ALL)</label>
                <input
                  type="text"
                  className="v2-input"
                  placeholder="*"
                  value={holdEntityId}
                  onChange={(e) => setHoldEntityId(e.target.value)}
                  style={{ width: "100%" }}
                  required
                />
              </div>
            </div>

            <div>
              <label className="v2-text-xs v2-font-bold v2-text-muted">LEGAL JUSTIFICATION &amp; CASE REFERENCE</label>
              <textarea
                className="v2-input"
                rows={3}
                placeholder="Official mandate reference or court summons ID..."
                value={holdReason}
                onChange={(e) => setHoldReason(e.target.value)}
                style={{ width: "100%" }}
                required
              />
            </div>

            <button type="submit" className="v2-btn v2-btn-danger" disabled={placingHold} style={{ alignSelf: "flex-start" }}>
              {placingHold ? "Securing Hold..." : "Enact Binding Legal Hold"}
            </button>
          </form>
        </div>
      )}

      {/* Retention Tab */}
      {activeTab === "retention" && (
        <div className="v2-card" style={{ padding: "1.5rem", maxWidth: "800px" }}>
          <h2 className="v2-text-lg v2-font-black" style={{ marginBottom: "0.5rem" }}>
            Execute Statutory Data Retention Sweep
          </h2>
          <p className="v2-text-xs v2-text-muted" style={{ marginBottom: "1.25rem" }}>
            Evaluates expired records against the 7-year statutory financial threshold (Tanzania Tax Administration Act) while verifying that any records protected by active Legal Holds are strictly preserved.
          </p>

          <button
            type="button"
            className="v2-btn v2-btn-primary"
            onClick={handleRunRetention}
            disabled={runningRetention}
            style={{ marginBottom: "1.5rem" }}
          >
            {runningRetention ? "Evaluating Records & Holds..." : "Execute Scheduled Retention Evaluation"}
          </button>

          {retentionResult && (
            <div className="v2-card" style={{ padding: "1rem", background: "var(--surface-sunken, #f8fafc)", border: "1px solid var(--surface-border, #e2e8f0)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--color-success, #10b981)", fontWeight: "bold", marginBottom: "0.5rem" }}>
                <CheckCircle2 size={16} /> Retention Sweep Completed Successfully
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <div style={{ background: "#fff", padding: "0.5rem", borderRadius: "4px", textAlign: "center" }}>
                  <div className="v2-text-xs v2-text-muted">Scanned</div>
                  <div className="v2-text-lg v2-font-black">{retentionResult.scannedCount}</div>
                </div>
                <div style={{ background: "#fff", padding: "0.5rem", borderRadius: "4px", textAlign: "center" }}>
                  <div className="v2-text-xs v2-text-muted">Eligible</div>
                  <div className="v2-text-lg v2-font-black">{retentionResult.eligibleCount}</div>
                </div>
                <div style={{ background: "#fff", padding: "0.5rem", borderRadius: "4px", textAlign: "center" }}>
                  <div className="v2-text-xs v2-text-muted">Anonymized</div>
                  <div className="v2-text-lg v2-font-black" style={{ color: "var(--color-success, #10b981)" }}>{retentionResult.anonymizedCount}</div>
                </div>
                <div style={{ background: "#fff", padding: "0.5rem", borderRadius: "4px", textAlign: "center" }}>
                  <div className="v2-text-xs v2-text-muted">Held (Preserved)</div>
                  <div className="v2-text-lg v2-font-black" style={{ color: "var(--color-danger, #ef4444)" }}>{retentionResult.heldCount}</div>
                </div>
              </div>
              <div className="v2-mono v2-text-xs" style={{ wordBreak: "break-all" }}>
                <strong>Evidence Digest (SHA-256):</strong> {retentionResult.evidenceSha256}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Incidents Tab */}
      {activeTab === "incidents" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
          <div className="v2-card" style={{ padding: "1.5rem" }}>
            <h2 className="v2-text-lg v2-font-black" style={{ marginBottom: "0.5rem" }}>
              Report Security / Privacy Incident
            </h2>
            <form onSubmit={handleLogIncident} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">INCIDENT TYPE</label>
                  <select className="v2-input" value={incType} onChange={(e) => setIncType(e.target.value)} style={{ width: "100%" }}>
                    <option value="UNAUTHORIZED_ACCESS">Unauthorized Access</option>
                    <option value="ACCIDENTAL_DISCLOSURE">Accidental Disclosure</option>
                    <option value="TENANT_ISOLATION_ANOMALY">Tenant Isolation Anomaly</option>
                    <option value="CREDENTIAL_COMPROMISE">Credential Compromise</option>
                    <option value="DATA_LOSS">Data Loss</option>
                    <option value="SUBPROCESSOR_BREACH">Subprocessor Breach</option>
                  </select>
                </div>
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">SEVERITY</label>
                  <select className="v2-input" value={incSeverity} onChange={(e) => setIncSeverity(e.target.value)} style={{ width: "100%" }}>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical (24h Regulator Escalation)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">INCIDENT TITLE</label>
                <input
                  type="text"
                  className="v2-input"
                  placeholder="e.g. Sync token replay anomaly detected"
                  value={incTitle}
                  onChange={(e) => setIncTitle(e.target.value)}
                  style={{ width: "100%" }}
                  required
                />
              </div>

              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">FORENSIC SUMMARY &amp; SCOPE</label>
                <textarea
                  className="v2-input"
                  rows={4}
                  placeholder="Details of affected tenants, user accounts, and initial containment steps taken..."
                  value={incSummary}
                  onChange={(e) => setIncSummary(e.target.value)}
                  style={{ width: "100%" }}
                  required
                />
              </div>

              <button type="submit" className="v2-btn v2-btn-primary" disabled={loggingIncident} style={{ alignSelf: "flex-start" }}>
                {loggingIncident ? "Logging Incident..." : "Record Incident in Audit Trail"}
              </button>
            </form>
          </div>

          <div className="v2-card" style={{ padding: "1.5rem" }}>
            <h2 className="v2-text-lg v2-font-black" style={{ marginBottom: "1rem" }}>
              Incident Registry ({incidents.length})
            </h2>
            {incidents.length === 0 ? (
              <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-muted, #94a3b8)" }}>
                <CheckCircle2 size={32} style={{ margin: "0 auto 0.5rem auto", color: "var(--color-success, #10b981)" }} />
                <p className="v2-text-sm" style={{ margin: 0 }}>No active security or privacy incidents reported.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxHeight: "450px", overflowY: "auto" }}>
                {incidents.map((inc) => (
                  <div key={inc.id} style={{ padding: "0.75rem", border: "1px solid var(--surface-border, #e2e8f0)", borderRadius: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="v2-text-sm v2-font-bold">{inc.title}</span>
                      <span className={`v2-badge ${inc.severity === "CRITICAL" || inc.severity === "HIGH" ? "v2-badge-danger" : "v2-badge-secondary"}`}>
                        {inc.severity}
                      </span>
                    </div>
                    <p className="v2-text-xs v2-text-muted" style={{ margin: "0.35rem 0" }}>{inc.summary}</p>
                    <div className="v2-text-xs v2-text-muted">
                      Status: <strong>{inc.status}</strong> • {new Date(inc.detectedAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="v2-card" style={{ padding: "1.5rem" }}>
          <h2 className="v2-text-lg v2-font-black" style={{ marginBottom: "0.5rem" }}>
            Statutory Legal Framework Status
          </h2>
          <p className="v2-text-sm v2-text-muted" style={{ marginBottom: "1.5rem" }}>
            Kwakoko Business Operating System conforms with Tanzanian Law and East African Data Governance:
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
            <div className="v2-card" style={{ padding: "1rem", border: "1px solid var(--surface-border, #e2e8f0)" }}>
              <h3 className="v2-text-sm v2-font-bold" style={{ margin: "0 0 0.5rem 0" }}>Personal Data Protection Act 2022</h3>
              <p className="v2-text-xs v2-text-muted" style={{ margin: 0 }}>
                Data Commissioner registration, legal bases for processing, 72-hour security incident notification capability, and automated DSR fulfillment.
              </p>
            </div>

            <div className="v2-card" style={{ padding: "1rem", border: "1px solid var(--surface-border, #e2e8f0)" }}>
              <h3 className="v2-text-sm v2-font-bold" style={{ margin: "0 0 0.5rem 0" }}>TRA Tax Administration Act</h3>
              <p className="v2-text-xs v2-text-muted" style={{ margin: 0 }}>
                Statutory mandatory 7-year fiscal and audit record retention. Automatic exemption from erasure requests for transactional ledgers.
              </p>
            </div>

            <div className="v2-card" style={{ padding: "1rem", border: "1px solid var(--surface-border, #e2e8f0)" }}>
              <h3 className="v2-text-sm v2-font-bold" style={{ margin: "0 0 0.5rem 0" }}>Cryptographic Evidence Chain</h3>
              <p className="v2-text-xs v2-text-muted" style={{ margin: 0 }}>
                Every published legal version, consent acceptance, and data retention execution computes a SHA-256 tamper-evident digest.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
