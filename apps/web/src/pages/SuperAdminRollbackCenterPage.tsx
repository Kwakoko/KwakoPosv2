import React, { useEffect, useState, useMemo } from "react";
import {
  RotateCcw, Shield, AlertTriangle, CheckCircle, Clock, XCircle,
  FileText, ArrowRight, Eye, RefreshCw, Layers, Lock, Flame,
  Search, Filter, ExternalLink, Hash, Check, AlertOctagon,
} from "lucide-react";
import { useAuth } from "../context/KwakoPosContexts.js";
import { apiFetch } from "../services/apiClient.js";
import { useToast } from "../context/ToastContext.js";
import type {
  RollbackRequest,
  RollbackScope,
  RollbackRiskLevel,
  RollbackTargetType,
  RollbackImpactReport,
  RollbackAuditEvent,
  RollbackMetrics,
} from "@kwakopos2/contracts";

export const SuperAdminRollbackCenterPage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();

  // Data state
  const [requests, setRequests] = useState<RollbackRequest[]>([]);
  const [auditEvents, setAuditEvents] = useState<RollbackAuditEvent[]>([]);
  const [metrics, setMetrics] = useState<RollbackMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"requests" | "audit" | "metrics">("requests");

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [riskFilter, setRiskFilter] = useState<string>("ALL");
  const [scopeFilter, setScopeFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal / Drawer state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [selectedRequestForExecution, setSelectedRequestForExecution] = useState<RollbackRequest | null>(null);
  const [confirmationPhrase, setConfirmationPhrase] = useState("");

  // Request Form state
  const [scope, setScope] = useState<RollbackScope>("RECORD");
  const [targetType, setTargetType] = useState<RollbackTargetType>("TRANSACTION");
  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState("");
  const [incidentId, setIncidentId] = useState("");
  const [isEmergency, setIsEmergency] = useState(false);
  const [dryRunReport, setDryRunReport] = useState<RollbackImpactReport | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Approval / Action modal state
  const [approvalModalRequest, setApprovalModalRequest] = useState<RollbackRequest | null>(null);
  const [approvalReason, setApprovalReason] = useState("Governed peer review passed; safety impact validated");
  const [approvalBusy, setApprovalBusy] = useState(false);

  const isSuperAdmin = Boolean(
    user && (user.role === "SUPER_ADMIN" || user.email === "admin@kwakoko.co.tz")
  );

  const loadData = async () => {
    try {
      setLoading(true);
      const [reqRes, auditRes, metricsRes] = await Promise.all([
        apiFetch<{ success: boolean; data: RollbackRequest[] }>("/api/v1/rollback/requests"),
        apiFetch<{ success: boolean; data: RollbackAuditEvent[] }>("/api/v1/rollback/audit"),
        apiFetch<{ success: boolean; data: RollbackMetrics }>("/api/v1/rollback/metrics"),
      ]);

      if (reqRes.success && reqRes.data) setRequests(reqRes.data);
      if (auditRes.success && auditRes.data) setAuditEvents(auditRes.data);
      if (metricsRes.success && metricsRes.data) setMetrics(metricsRes.data);
    } catch (err) {
      console.error("Failed to load rollback data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDryRun = async () => {
    setFormBusy(true);
    setFormError(null);
    try {
      const res = await apiFetch<{ success: boolean; data: { impactReport: RollbackImpactReport } }>("/api/v1/rollback/requests", {
        method: "POST",
        body: JSON.stringify({
          rollbackScope: scope,
          targetType,
          targetId: targetId.trim() || "TARGET-SAMPLE-ID",
          reason: reason.trim() || "Pre-flight dry-run evaluation",
          incidentId: isEmergency ? incidentId.trim() : undefined,
          isEmergency,
          dryRun: true,
        }),
      });
      if (res.success && res.data?.impactReport) {
        setDryRunReport(res.data.impactReport);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Dry-run calculation failed");
    } finally {
      setFormBusy(false);
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || reason.trim().length < 10) {
      setFormError("Detailed business or incident reason is required (minimum 10 characters).");
      return;
    }
    if (isEmergency && (!incidentId.trim() || incidentId.trim().length < 3)) {
      setFormError("Emergency recovery requires a mandatory incident reference number.");
      return;
    }

    setFormBusy(true);
    setFormError(null);
    try {
      if (isEmergency) {
        // Fast-path emergency
        await apiFetch("/api/v1/rollback/emergency", {
          method: "POST",
          body: JSON.stringify({
            rollbackScope: scope,
            targetType,
            targetId: targetId.trim(),
            incidentId: incidentId.trim(),
            emergencyReason: reason.trim(),
            idempotencyKey: `EMERGENCY-${Date.now()}`,
          }),
        });
      } else {
        await apiFetch("/api/v1/rollback/requests", {
          method: "POST",
          body: JSON.stringify({
            rollbackScope: scope,
            targetType,
            targetId: targetId.trim(),
            reason: reason.trim(),
            incidentId: incidentId.trim() || undefined,
            isEmergency: false,
            dryRun: false,
          }),
        });
      }

      setIsCreateModalOpen(false);
      setTargetId("");
      setReason("");
      setIncidentId("");
      setIsEmergency(false);
      setDryRunReport(null);
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create rollback request");
    } finally {
      setFormBusy(false);
    }
  };

  const handleApprove = async () => {
    if (!approvalModalRequest) return;
    setApprovalBusy(true);
    try {
      await apiFetch(`/api/v1/rollback/requests/${approvalModalRequest.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ reason: approvalReason }),
      });
      setApprovalModalRequest(null);
      await loadData();
      toast.success("Rollback Approved", "Rollback request approved successfully.");
    } catch (err) {
      toast.error("Approval Failed", err instanceof Error ? err.message : "Approval failed");
    } finally {
      setApprovalBusy(false);
    }
  };

  const handleReject = async (reqId: string) => {
    const reasonPrompt = window.prompt("Enter rejection reason:");
    if (!reasonPrompt) return;
    try {
      await apiFetch(`/api/v1/rollback/requests/${reqId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: reasonPrompt }),
      });
      await loadData();
      toast.info("Rollback Rejected", `Request ${reqId} was rejected.`);
    } catch (err) {
      toast.error("Rejection Failed", err instanceof Error ? err.message : "Rejection failed");
    }
  };

  const handleExecute = async () => {
    if (!selectedRequestForExecution) return;
    if (selectedRequestForExecution.riskLevel === "CRITICAL" && confirmationPhrase.trim() !== "AUTHORIZE ROLLBACK") {
      toast.warning("Authorization Required", "You must type 'AUTHORIZE ROLLBACK' to proceed with critical execution.");
      return;
    }

    try {
      await apiFetch(`/api/v1/rollback/requests/${selectedRequestForExecution.id}/execute`, {
        method: "POST",
        body: JSON.stringify({
          idempotencyKey: `EXEC-${Date.now()}-${selectedRequestForExecution.id.slice(0, 6)}`,
          confirmationPhrase: confirmationPhrase.trim() || undefined,
        }),
      });
      setIsConfirmModalOpen(false);
      setSelectedRequestForExecution(null);
      setConfirmationPhrase("");
      await loadData();
      toast.success("Rollback Executed", "Rollback operation executed successfully.");
    } catch (err) {
      toast.error("Execution Failed", err instanceof Error ? err.message : "Execution failed");
    }
  };

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      if (riskFilter !== "ALL" && r.riskLevel !== riskFilter) return false;
      if (scopeFilter !== "ALL" && r.rollbackScope !== scopeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          r.id.toLowerCase().includes(q) ||
          r.targetId.toLowerCase().includes(q) ||
          r.reason.toLowerCase().includes(q) ||
          (r.incidentId && r.incidentId.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [requests, statusFilter, riskFilter, scopeFilter, searchQuery]);

  return (
    <div className="v2-p-6 v2-space-y-6" style={{ maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div className="v2-flex v2-items-center v2-justify-between v2-border-b v2-pb-4" style={{ borderColor: "var(--surface-border)" }}>
        <div>
          <div className="v2-flex v2-items-center v2-gap-2">
            <RotateCcw size={24} style={{ color: "#f59e0b" }} />
            <h1 className="v2-text-2xl v2-font-black">Rollback Authorization Center</h1>
            <span className="badge v2-badge-accent" style={{ background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b" }}>
              ENTERPRISE GOVERNANCE
            </span>
          </div>
          <p className="v2-text-sm v2-text-muted v2-mt-1">
            Governed state reversal, four-eyes authorization, stock ledger preservation, and offline synchronization barrier.
          </p>
        </div>

        <div className="v2-flex v2-items-center v2-gap-3">
          <button
            type="button"
            className="v2-btn v2-btn-secondary"
            onClick={loadData}
            title="Refresh rollback telemetry and requests"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            className="v2-btn v2-btn-primary"
            onClick={() => {
              setDryRunReport(null);
              setFormError(null);
              setIsCreateModalOpen(true);
            }}
            style={{ background: "#dc2626", borderColor: "#b91c1c", color: "#fff" }}
          >
            <RotateCcw size={14} />
            <span>Request Governed Rollback</span>
          </button>
        </div>
      </div>

      {/* KPI Telemetry Banner */}
      <div className="v2-grid v2-grid-cols-2 md:v2-grid-cols-4 lg:v2-grid-cols-7 v2-gap-3">
        {[
          { label: "Total Requests", val: metrics?.totalRequests ?? requests.length, color: "var(--text-primary)" },
          { label: "Pending Review", val: metrics?.pendingRequests ?? 0, color: "#f59e0b" },
          { label: "Approved", val: metrics?.approvedRequests ?? 0, color: "#3b82f6" },
          { label: "Executing", val: metrics?.executingRequests ?? 0, color: "#8b5cf6" },
          { label: "Verified & Done", val: metrics?.completedRequests ?? 0, color: "#10b981" },
          { label: "Failed / Recovery", val: (metrics?.failedRequests ?? 0) + (metrics?.recoveryRequiredRequests ?? 0), color: "#ef4444" },
          { label: "Emergency", val: metrics?.emergencyRequests ?? 0, color: "#ec4899" },
        ].map((kpi, idx) => (
          <div
            key={idx}
            className="v2-card v2-p-3"
            style={{
              background: "var(--surface-bg)",
              border: "1px solid var(--surface-border)",
              borderRadius: "8px",
            }}
          >
            <div className="v2-text-xs v2-text-muted v2-font-bold">{kpi.label}</div>
            <div className="v2-text-2xl v2-font-black v2-mt-1" style={{ color: kpi.color }}>
              {kpi.val}
            </div>
          </div>
        ))}
      </div>

      {/* Navigation Tabs */}
      <div className="v2-flex v2-items-center v2-gap-2 v2-border-b" style={{ borderColor: "var(--surface-border)" }}>
        <button
          type="button"
          onClick={() => setActiveTab("requests")}
          className={`v2-btn ${activeTab === "requests" ? "v2-btn-primary" : "v2-btn-secondary"}`}
          style={{ borderRadius: "6px 6px 0 0", padding: "0.5rem 1rem" }}
        >
          <Layers size={15} />
          <span>Rollback Requests ({requests.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("audit")}
          className={`v2-btn ${activeTab === "audit" ? "v2-btn-primary" : "v2-btn-secondary"}`}
          style={{ borderRadius: "6px 6px 0 0", padding: "0.5rem 1rem" }}
        >
          <Hash size={15} />
          <span>Cryptographic Audit Ledger ({auditEvents.length})</span>
        </button>
      </div>

      {/* Requests Tab */}
      {activeTab === "requests" && (
        <div className="v2-space-y-4">
          {/* Filter Bar */}
          <div className="v2-card v2-p-4 v2-flex v2-flex-wrap v2-items-center v2-gap-3" style={{ background: "var(--surface-bg)" }}>
            <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              <input
                type="text"
                placeholder="Search by target ID, reason, or incident reference..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="v2-input"
                style={{ paddingLeft: "2rem", width: "100%" }}
              />
            </div>

            <div className="v2-flex v2-items-center v2-gap-2">
              <span className="v2-text-xs v2-text-muted v2-font-bold">Scope:</span>
              <select className="v2-input" value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)}>
                <option value="ALL">All Scopes</option>
                <option value="RECORD">Level 0: Record</option>
                <option value="MODULE">Level 1: Module</option>
                <option value="BRANCH">Level 2: Branch</option>
                <option value="TENANT">Level 3: Tenant</option>
                <option value="PLATFORM">Level 4: Platform</option>
                <option value="EMERGENCY">Level 5: Emergency</option>
              </select>
            </div>

            <div className="v2-flex v2-items-center v2-gap-2">
              <span className="v2-text-xs v2-text-muted v2-font-bold">Risk:</span>
              <select className="v2-input" value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
                <option value="ALL">All Risks</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>

            <div className="v2-flex v2-items-center v2-gap-2">
              <span className="v2-text-xs v2-text-muted v2-font-bold">Status:</span>
              <select className="v2-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="ALL">All Statuses</option>
                <option value="REQUESTED">Requested</option>
                <option value="APPROVED">Approved</option>
                <option value="EXECUTED">Executed</option>
                <option value="VERIFIED">Verified</option>
                <option value="FAILED">Failed</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
          </div>

          {/* Requests Table */}
          <div className="v2-card v2-overflow-hidden" style={{ background: "var(--surface-bg)", border: "1px solid var(--surface-border)" }}>
            <table className="v2-table" style={{ width: "100%", textAlign: "left", fontSize: "0.85rem" }}>
              <thead style={{ background: "rgba(0,0,0,0.15)", borderBottom: "1px solid var(--surface-border)" }}>
                <tr>
                  <th className="v2-p-3">Request ID &amp; Target</th>
                  <th className="v2-p-3">Scope &amp; Risk</th>
                  <th className="v2-p-3">Reason &amp; Incident</th>
                  <th className="v2-p-3">Four-Eyes Actors</th>
                  <th className="v2-p-3">Status</th>
                  <th className="v2-p-3" style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="v2-p-8 v2-text-center v2-text-muted">
                      No rollback requests match the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map((r) => {
                    const isRequesterSelf = user?.id === r.requestedBy;
                    return (
                      <tr key={r.id} style={{ borderBottom: "1px solid var(--surface-border)" }}>
                        <td className="v2-p-3">
                          <div className="v2-font-bold v2-mono" style={{ color: "#3b82f6" }}>
                            {r.id.slice(0, 8)}...
                          </div>
                          <div className="v2-text-xs v2-text-muted">
                            {r.targetType}: <code>{r.targetId}</code>
                          </div>
                        </td>
                        <td className="v2-p-3">
                          <span
                            className="badge"
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              padding: "0.2rem 0.5rem",
                              borderRadius: "4px",
                              background:
                                r.riskLevel === "CRITICAL"
                                  ? "rgba(239, 68, 68, 0.15)"
                                  : r.riskLevel === "HIGH"
                                  ? "rgba(245, 158, 11, 0.15)"
                                  : "rgba(59, 130, 246, 0.15)",
                              color:
                                r.riskLevel === "CRITICAL"
                                  ? "#f87171"
                                  : r.riskLevel === "HIGH"
                                  ? "#f59e0b"
                                  : "#60a5fa",
                            }}
                          >
                            {r.rollbackScope} · {r.riskLevel}
                          </span>
                        </td>
                        <td className="v2-p-3" style={{ maxWidth: 320 }}>
                          <div className="v2-truncate" title={r.reason}>
                            {r.reason}
                          </div>
                          {r.incidentId && (
                            <div className="v2-text-xs v2-font-bold" style={{ color: "#ec4899" }}>
                              Incident: {r.incidentId}
                            </div>
                          )}
                        </td>
                        <td className="v2-p-3">
                          <div className="v2-text-xs">
                            <strong>Req:</strong> {r.requesterEmail.split("@")[0]}
                          </div>
                          {r.approverEmail ? (
                            <div className="v2-text-xs" style={{ color: "#10b981" }}>
                              <strong>Appr:</strong> {r.approverEmail.split("@")[0]}
                            </div>
                          ) : (
                            <div className="v2-text-xs v2-text-muted">Pending peer review</div>
                          )}
                        </td>
                        <td className="v2-p-3">
                          <span
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.3rem",
                              color:
                                r.status === "VERIFIED"
                                  ? "#10b981"
                                  : r.status === "APPROVED"
                                  ? "#3b82f6"
                                  : r.status === "FAILED"
                                  ? "#ef4444"
                                  : "#f59e0b",
                            }}
                          >
                            {r.status === "VERIFIED" && <CheckCircle size={13} />}
                            {r.status === "APPROVED" && <Check size={13} />}
                            {r.status === "FAILED" && <XCircle size={13} />}
                            {r.status}
                          </span>
                        </td>
                        <td className="v2-p-3" style={{ textAlign: "right" }}>
                          <div className="v2-flex v2-items-center v2-justify-end v2-gap-2">
                            {r.status === "REQUESTED" && (
                              <>
                                {isRequesterSelf && !isSuperAdmin ? (
                                  <span className="v2-text-xs v2-text-muted" title="Four-eyes control prevents self-approval">
                                    Awaiting Peer
                                  </span>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => setApprovalModalRequest(r)}
                                      className="v2-btn v2-btn-secondary"
                                      style={{ padding: "0.25rem 0.55rem", fontSize: "0.75rem", color: "#10b981" }}
                                    >
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleReject(r.id)}
                                      className="v2-btn v2-btn-secondary"
                                      style={{ padding: "0.25rem 0.55rem", fontSize: "0.75rem", color: "#ef4444" }}
                                    >
                                      Reject
                                    </button>
                                  </>
                                )}
                              </>
                            )}

                            {r.status === "APPROVED" && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedRequestForExecution(r);
                                  setConfirmationPhrase("");
                                  setIsConfirmModalOpen(true);
                                }}
                                className="v2-btn v2-btn-primary"
                                style={{
                                  padding: "0.28rem 0.65rem",
                                  fontSize: "0.75rem",
                                  background: "#dc2626",
                                  borderColor: "#b91c1c",
                                }}
                              >
                                Execute Rollback
                              </button>
                            )}

                            {r.status === "VERIFIED" && (
                              <span className="v2-text-xs v2-text-muted">Verified Safe</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cryptographic Audit Ledger Tab */}
      {activeTab === "audit" && (
        <div className="v2-card v2-p-4 v2-space-y-3" style={{ background: "var(--surface-bg)", border: "1px solid var(--surface-border)" }}>
          <div className="v2-flex v2-items-center v2-justify-between">
            <h2 className="v2-text-lg v2-font-bold">Tamper-Evident SHA-256 Audit Ledger</h2>
            <span className="v2-text-xs v2-text-muted">Cryptographically chained via previous_hash + payload + timestamp</span>
          </div>

          <div className="v2-overflow-x-auto">
            <table className="v2-table" style={{ width: "100%", fontSize: "0.82rem" }}>
              <thead style={{ borderBottom: "1px solid var(--surface-border)" }}>
                <tr>
                  <th className="v2-p-2">Timestamp</th>
                  <th className="v2-p-2">Event</th>
                  <th className="v2-p-2">Actor</th>
                  <th className="v2-p-2">Scope &amp; Target</th>
                  <th className="v2-p-2">Result</th>
                  <th className="v2-p-2">SHA-256 Event Hash</th>
                </tr>
              </thead>
              <tbody>
                {auditEvents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="v2-p-6 v2-text-center v2-text-muted">
                      No audit events recorded yet.
                    </td>
                  </tr>
                ) : (
                  auditEvents.map((evt) => (
                    <tr key={evt.id} style={{ borderBottom: "1px solid var(--surface-border)" }}>
                      <td className="v2-p-2 v2-text-muted">{new Date(evt.timestamp).toLocaleTimeString()}</td>
                      <td className="v2-p-2 v2-font-bold">{evt.eventType}</td>
                      <td className="v2-p-2">{evt.actorEmail}</td>
                      <td className="v2-p-2">{evt.scope}: {evt.target}</td>
                      <td className="v2-p-2">
                        <span style={{ color: evt.result === "SUCCESS" ? "#10b981" : "#ef4444" }}>
                          {evt.result}
                        </span>
                      </td>
                      <td className="v2-p-2 v2-mono" style={{ fontSize: "0.72rem", color: "#3b82f6" }}>
                        {evt.eventHash.slice(0, 16)}...
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Rollback Request Modal */}
      {isCreateModalOpen && (
        <div className="modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="v2-flex v2-items-center v2-justify-between v2-border-b v2-pb-3" style={{ borderColor: "var(--surface-border)" }}>
              <div className="v2-flex v2-items-center v2-gap-2">
                <RotateCcw size={18} style={{ color: "#dc2626" }} />
                <h2 className="v2-text-lg v2-font-bold">Initiate Governed Rollback</h2>
              </div>
              <button type="button" className="topbar-icon-btn" onClick={() => setIsCreateModalOpen(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateRequest} className="v2-space-y-4 v2-mt-4">
              {formError && (
                <div className="v2-p-3" style={{ background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.4)", borderRadius: 6, color: "#f87171", fontSize: "0.82rem" }}>
                  {formError}
                </div>
              )}

              <div className="v2-grid v2-grid-cols-2 v2-gap-3">
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">Rollback Scope</label>
                  <select className="v2-input v2-mt-1" value={scope} onChange={(e) => setScope(e.target.value as RollbackScope)}>
                    <option value="RECORD">Level 0: Record Correction</option>
                    <option value="MODULE">Level 1: Module Rollback</option>
                    <option value="BRANCH">Level 2: Branch Rollback</option>
                    <option value="TENANT">Level 3: Tenant Rollback</option>
                    <option value="PLATFORM">Level 4: Platform Rollback</option>
                    <option value="EMERGENCY">Level 5: Emergency Recovery</option>
                  </select>
                </div>

                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">Target Entity Type</label>
                  <select className="v2-input v2-mt-1" value={targetType} onChange={(e) => setTargetType(e.target.value as RollbackTargetType)}>
                    <option value="TRANSACTION">Financial Transaction</option>
                    <option value="STOCK_LEDGER">Stock Ledger Movement</option>
                    <option value="MODULE_STATE">Module State</option>
                    <option value="BRANCH_CONFIG">Branch Configuration</option>
                    <option value="TENANT_DATA">Tenant Workspace Data</option>
                    <option value="PLATFORM_DEPLOYMENT">Platform Deployment</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">Target ID / Reference</label>
                <input
                  type="text"
                  placeholder="e.g. TX-SALE-847291 or STK-MOV-0192"
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="v2-input v2-mt-1"
                  required
                />
              </div>

              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">Business or Incident Reason (Min 10 characters)</label>
                <textarea
                  placeholder="Provide precise justification for this rollback operation..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="v2-input v2-mt-1"
                  rows={3}
                  required
                />
              </div>

              <div className="v2-flex v2-items-center v2-gap-2">
                <input
                  type="checkbox"
                  id="emergencyCheck"
                  checked={isEmergency}
                  onChange={(e) => setIsEmergency(e.target.checked)}
                />
                <label htmlFor="emergencyCheck" className="v2-text-xs v2-font-bold" style={{ color: isEmergency ? "#ef4444" : "var(--text-primary)" }}>
                  Emergency Recovery Path (Bypasses standard queue; requires mandatory incident reference)
                </label>
              </div>

              {isEmergency && (
                <div>
                  <label className="v2-text-xs v2-font-bold" style={{ color: "#ef4444" }}>Mandatory Incident ID</label>
                  <input
                    type="text"
                    placeholder="e.g. INC-2026-0906-01"
                    value={incidentId}
                    onChange={(e) => setIncidentId(e.target.value)}
                    className="v2-input v2-mt-1"
                    required
                  />
                </div>
              )}

              {/* Dry-run report display */}
              {dryRunReport && (
                <div className="v2-card v2-p-3" style={{ background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.3)", borderRadius: 6 }}>
                  <div className="v2-text-xs v2-font-bold" style={{ color: "#3b82f6" }}>Dry-Run Impact Preview:</div>
                  <div className="v2-grid v2-grid-cols-3 v2-gap-2 v2-mt-2 v2-text-xs">
                    <div>Records: <strong>{dryRunReport.recordsAffected}</strong></div>
                    <div>Movements: <strong>{dryRunReport.inventoryMovementsAffected}</strong></div>
                    <div>Duration: <strong>~{dryRunReport.estimatedDurationSeconds}s</strong></div>
                  </div>
                  {dryRunReport.warnings.length > 0 && (
                    <div className="v2-mt-2 v2-text-xs" style={{ color: "#f59e0b" }}>
                      Warnings: {dryRunReport.warnings.join("; ")}
                    </div>
                  )}
                </div>
              )}

              <div className="v2-flex v2-items-center v2-justify-between v2-pt-3 v2-border-t" style={{ borderColor: "var(--surface-border)" }}>
                <button
                  type="button"
                  className="v2-btn v2-btn-secondary"
                  onClick={handleDryRun}
                  disabled={formBusy}
                >
                  Calculate Impact &amp; Dry-Run
                </button>

                <div className="v2-flex v2-items-center v2-gap-2">
                  <button type="button" className="v2-btn v2-btn-secondary" onClick={() => setIsCreateModalOpen(false)}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="v2-btn v2-btn-primary"
                    disabled={formBusy}
                    style={{ background: "#dc2626", borderColor: "#b91c1c", color: "#fff" }}
                  >
                    {formBusy ? "Submitting..." : isEmergency ? "Execute Emergency Recovery" : "Submit for Peer Review"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Approval Modal */}
      {approvalModalRequest && (
        <div className="modal-overlay" onClick={() => setApprovalModalRequest(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <h2 className="v2-text-lg v2-font-bold">Four-Eyes Peer Review Approval</h2>
            <p className="v2-text-xs v2-text-muted v2-mt-1">
              Confirm authorization for rollback request <code>{approvalModalRequest.id.slice(0, 8)}</code> ({approvalModalRequest.rollbackScope} · {approvalModalRequest.riskLevel}).
            </p>

            <div className="v2-mt-3">
              <label className="v2-text-xs v2-font-bold v2-text-muted">Approval Justification</label>
              <textarea
                className="v2-input v2-mt-1"
                rows={2}
                value={approvalReason}
                onChange={(e) => setApprovalReason(e.target.value)}
                required
              />
            </div>

            <div className="v2-flex v2-items-center v2-justify-end v2-gap-2 v2-mt-4">
              <button type="button" className="v2-btn v2-btn-secondary" onClick={() => setApprovalModalRequest(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="v2-btn v2-btn-primary"
                onClick={handleApprove}
                disabled={approvalBusy}
                style={{ background: "#10b981", borderColor: "#059669", color: "#fff" }}
              >
                {approvalBusy ? "Approving..." : "Sign & Authorize Rollback"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Phrase Execution Modal */}
      {isConfirmModalOpen && selectedRequestForExecution && (
        <div className="modal-overlay" onClick={() => setIsConfirmModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="v2-flex v2-items-center v2-gap-2" style={{ color: "#ef4444" }}>
              <AlertTriangle size={20} />
              <h2 className="v2-text-lg v2-font-black">Final Execution Gate</h2>
            </div>

            <p className="v2-text-xs v2-text-muted v2-mt-2">
              You are about to execute a <strong>{selectedRequestForExecution.riskLevel}</strong> rollback for scope <strong>{selectedRequestForExecution.rollbackScope}</strong>.
              This will acquire an execution lock, freeze sync mutations, generate a recovery point snapshot, and increment the sync epoch.
            </p>

            {selectedRequestForExecution.riskLevel === "CRITICAL" && (
              <div className="v2-mt-3 v2-p-3" style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 6 }}>
                <label className="v2-text-xs v2-font-bold" style={{ color: "#ef4444" }}>
                  Confirmation Phrase Required: Type <code>AUTHORIZE ROLLBACK</code> below:
                </label>
                <input
                  type="text"
                  placeholder="AUTHORIZE ROLLBACK"
                  value={confirmationPhrase}
                  onChange={(e) => setConfirmationPhrase(e.target.value)}
                  className="v2-input v2-mt-1"
                />
              </div>
            )}

            <div className="v2-flex v2-items-center v2-justify-end v2-gap-2 v2-mt-4">
              <button type="button" className="v2-btn v2-btn-secondary" onClick={() => setIsConfirmModalOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="v2-btn v2-btn-primary"
                onClick={handleExecute}
                disabled={selectedRequestForExecution.riskLevel === "CRITICAL" && confirmationPhrase.trim() !== "AUTHORIZE ROLLBACK"}
                style={{ background: "#dc2626", borderColor: "#b91c1c", color: "#fff" }}
              >
                Execute Transactionally
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminRollbackCenterPage;
