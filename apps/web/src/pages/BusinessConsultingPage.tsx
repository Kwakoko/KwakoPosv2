/**
 * KwakoPosv2 — Strategic Business Consulting & Goal Management
 * ─────────────────────────────────────────────────────────────
 * Enterprise advisory platform: SWOT 4-quadrant analysis,
 * OKR goal tracking engine, project delivery, and advisory tools.
 */
import React, { useState, useEffect, useMemo } from "react";
import {
  Briefcase,
  Target,
  Sparkles,
  TrendingUp,
  Clock,
  Play,
  Square,
  Plus,
  Trash2,
  CheckCircle2,
  FileText,
  DollarSign,
  Building,
  Shield,
  Layers,
  ArrowRight,
  Download,
} from "lucide-react";
import { useAuth, useTenant } from "../context/KwakoPosContexts.js";

type ConsultingTab = "swot" | "okrs" | "projects" | "advisory" | "ai-strategy";

interface SWOTRecord {
  id: string;
  clientName: string;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
  createdAt: string;
}

interface OKRRecord {
  id: string;
  objective: string;
  keyResults: { text: string; progress: number }[];
  targetDate: string;
}

interface ProjectRecord {
  id: string;
  name: string;
  client: string;
  status: "Planning" | "Active" | "Under Review" | "Completed";
  progress: number;
  timeline: string;
}

const INITIAL_SWOTS: SWOTRecord[] = [
  {
    id: "swot-1",
    clientName: "Tanzania Breweries Ltd (TBL)",
    strengths: ["Strong local brand recognition", "Dense distribution network across Dar & Arusha"],
    weaknesses: ["High sensitivity to local fuel tariffs", "Legacy packaging production lines"],
    opportunities: ["East African regional export expansion (Kenya, Uganda)", "Direct-to-Retailer POS ordering"],
    threats: ["Excise duty increases", "Raw ingredient import currency fluctuations"],
    createdAt: "2026-08-15",
  },
  {
    id: "swot-2",
    clientName: "Kwakoko Flagship Supermarket",
    strengths: ["Fast offline checkout capability", "Integrated mobile money reconciliation"],
    weaknesses: ["Peak hour cashier lane bottlenecks", "Perishable fruit spoilage rate"],
    opportunities: ["Self-checkout tablet kiosks", "Wholesale bulk customer loyalty accounts"],
    threats: ["Nearby competitor price discounting", "Unstable municipal power grid"],
    createdAt: "2026-09-01",
  },
];

const INITIAL_OKRS: OKRRecord[] = [
  {
    id: "okr-1",
    objective: "Expand Retail Gross Profit Margin to 28%",
    keyResults: [
      { text: "Renegotiate wholesale vendor pricing on top 20 fast-movers", progress: 80 },
      { text: "Reduce inventory shrink & stock discrepancy below 0.5%", progress: 65 },
      { text: "Launch private label household packaged items", progress: 40 },
    ],
    targetDate: "2026-10-31",
  },
  {
    id: "okr-2",
    objective: "Achieve 99.9% Cash Drawer Shift Balancing Accuracy",
    keyResults: [
      { text: "Enforce digital denomination counting on 100% of shifts", progress: 95 },
      { text: "Mandate manager witness sign-off on variances over 500 TZS", progress: 100 },
      { text: "Complete cashier reconciliation training for 24 staff members", progress: 75 },
    ],
    targetDate: "2026-11-15",
  },
];

const INITIAL_PROJECTS: ProjectRecord[] = [
  { id: "proj-1", name: "Multi-Branch POS Migration", client: "TBL Distribution", status: "Active", progress: 85, timeline: "Q3 2026" },
  { id: "proj-2", name: "Warehouse Stock Ledger Audit", client: "Bakhresa Group", status: "Active", progress: 60, timeline: "Q3-Q4 2026" },
  { id: "proj-3", name: "Franchise Retail Expansion Plan", client: "METL Group", status: "Planning", progress: 20, timeline: "Q4 2026" },
];

export const BusinessConsultingPage: React.FC = () => {
  const { currentTenantId } = useTenant();
  const [activeTab, setActiveTab] = useState<ConsultingTab>("swot");

  // ── SWOT State ──
  const [swots, setSwots] = useState<SWOTRecord[]>(() => {
    if (typeof window === "undefined") return INITIAL_SWOTS;
    try {
      const saved = localStorage.getItem(`kwakopos:v2:swots:${currentTenantId || "default"}`);
      return saved ? JSON.parse(saved) : INITIAL_SWOTS;
    } catch {
      return INITIAL_SWOTS;
    }
  });
  const [selectedSwotId, setSelectedSwotId] = useState<string>(swots[0]?.id || "swot-1");
  const [newClient, setNewClient] = useState("");
  const [newStrength, setNewStrength] = useState("");
  const [newWeakness, setNewWeakness] = useState("");
  const [newOpportunity, setNewOpportunity] = useState("");
  const [newThreat, setNewThreat] = useState("");

  // ── OKR State ──
  const [okrs, setOkrs] = useState<OKRRecord[]>(() => {
    if (typeof window === "undefined") return INITIAL_OKRS;
    try {
      const saved = localStorage.getItem(`kwakopos:v2:okrs:${currentTenantId || "default"}`);
      return saved ? JSON.parse(saved) : INITIAL_OKRS;
    } catch {
      return INITIAL_OKRS;
    }
  });
  const [newObjective, setNewObjective] = useState("");
  const [newKr1, setNewKr1] = useState("");
  const [newKr2, setNewKr2] = useState("");
  const [newOkrDate, setNewOkrDate] = useState("2026-12-31");

  // ── Projects State ──
  const [projects, setProjects] = useState<ProjectRecord[]>(INITIAL_PROJECTS);

  // ── Live Session Timer State ──
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerClient, setTimerClient] = useState("TBL Distribution");
  const [timerNotes, setTimerNotes] = useState("");
  const [timeLogs, setTimeLogs] = useState<{ id: string; client: string; notes: string; duration: string; date: string }[]>([
    { id: "log-1", client: "TBL Distribution", notes: "Supply chain SKU rationalization workshop", duration: "2h 15m", date: "2026-09-02" },
    { id: "log-2", client: "METL Group", notes: "Franchise unit economic model review", duration: "1h 45m", date: "2026-09-05" },
  ]);

  // Persist swots & okrs
  useEffect(() => {
    try {
      localStorage.setItem(`kwakopos:v2:swots:${currentTenantId || "default"}`, JSON.stringify(swots));
    } catch {
      // ignore
    }
  }, [swots, currentTenantId]);

  useEffect(() => {
    try {
      localStorage.setItem(`kwakopos:v2:okrs:${currentTenantId || "default"}`, JSON.stringify(okrs));
    } catch {
      // ignore
    }
  }, [okrs, currentTenantId]);

  // Timer interval
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isTimerRunning) {
      interval = setInterval(() => setTimerSeconds((s) => s + 1), 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning]);

  const activeSwot = useMemo(() => {
    return swots.find((s) => s.id === selectedSwotId) || swots[0];
  }, [swots, selectedSwotId]);

  // Handle SWOT Creation
  const handleAddSwot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClient.trim()) return;

    const newRec: SWOTRecord = {
      id: `swot-${Date.now()}`,
      clientName: newClient.trim(),
      strengths: newStrength ? [newStrength.trim()] : [],
      weaknesses: newWeakness ? [newWeakness.trim()] : [],
      opportunities: newOpportunity ? [newOpportunity.trim()] : [],
      threats: newThreat ? [newThreat.trim()] : [],
      createdAt: new Date().toISOString().split("T")[0],
    };

    setSwots((prev) => [newRec, ...prev]);
    setSelectedSwotId(newRec.id);
    setNewClient("");
    setNewStrength("");
    setNewWeakness("");
    setNewOpportunity("");
    setNewThreat("");
  };

  // Handle OKR Creation
  const handleAddOkr = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newObjective.trim()) return;

    const krs = [];
    if (newKr1.trim()) krs.push({ text: newKr1.trim(), progress: 0 });
    if (newKr2.trim()) krs.push({ text: newKr2.trim(), progress: 0 });

    const newRec: OKRRecord = {
      id: `okr-${Date.now()}`,
      objective: newObjective.trim(),
      keyResults: krs.length > 0 ? krs : [{ text: "Initial milestone kickoff", progress: 0 }],
      targetDate: newOkrDate,
    };

    setOkrs((prev) => [newRec, ...prev]);
    setNewObjective("");
    setNewKr1("");
    setNewKr2("");
  };

  const handleUpdateKrProgress = (okrId: string, krIdx: number, newProg: number) => {
    setOkrs((prev) =>
      prev.map((okr) => {
        if (okr.id !== okrId) return okr;
        const updatedKrs = [...okr.keyResults];
        updatedKrs[krIdx] = {
          ...updatedKrs[krIdx],
          progress: Math.min(100, Math.max(0, newProg)),
        };
        return { ...okr, keyResults: updatedKrs };
      })
    );
  };

  const handleStopTimer = () => {
    if (!isTimerRunning) return;
    setIsTimerRunning(false);
    const mins = Math.floor(timerSeconds / 60);
    const secs = timerSeconds % 60;
    const durStr = `${mins}m ${secs}s`;

    setTimeLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        client: timerClient,
        notes: timerNotes || "General advisory consultation session",
        duration: durStr,
        date: new Date().toISOString().split("T")[0],
      },
      ...prev,
    ]);

    setTimerSeconds(0);
    setTimerNotes("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Header card */}
      <div className="card" style={{ padding: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Briefcase size={22} color="var(--color-primary, #3b82f6)" />
            <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 700 }}>Strategic Business Consulting &amp; Goal Management</h2>
          </div>
          <p style={{ margin: "0.4rem 0 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            SWOT analysis matrix, Objectives &amp; Key Results (OKR) tracking, and strategic performance recommendations.
          </p>
        </div>

        {/* Tab switcher */}
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          <button
            className={`btn ${activeTab === "swot" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveTab("swot")}
            style={{ fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
          >
            <Shield size={13} /> SWOT Matrix
          </button>
          <button
            className={`btn ${activeTab === "okrs" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveTab("okrs")}
            style={{ fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
          >
            <Target size={13} /> OKR Engine
          </button>
          <button
            className={`btn ${activeTab === "projects" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveTab("projects")}
            style={{ fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
          >
            <Layers size={13} /> Strategy Projects
          </button>
          <button
            className={`btn ${activeTab === "advisory" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveTab("advisory")}
            style={{ fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
          >
            <Clock size={13} /> Time &amp; Billing
          </button>
          <button
            className={`btn ${activeTab === "ai-strategy" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveTab("ai-strategy")}
            style={{ fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
          >
            <Sparkles size={13} /> AI Strategy
          </button>
        </div>
      </div>

      {/* ── TAB 1: SWOT MATRIX ── */}
      {activeTab === "swot" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Client selector & Add button */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Active Assessment:</span>
              <select
                className="input"
                value={selectedSwotId}
                onChange={(e) => setSelectedSwotId(e.target.value)}
                style={{ fontSize: "0.85rem", padding: "0.3rem 0.6rem" }}
              >
                {swots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.clientName} ({s.createdAt})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {activeSwot && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
              {/* Strengths */}
              <div className="card" style={{ padding: "1.25rem", borderTop: "4px solid var(--color-success, #10b981)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--color-success, #10b981)" }}>STRENGTHS (S)</span>
                  <span className="badge badge-success" style={{ fontSize: "0.72rem" }}>Internal Factor</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {activeSwot.strengths.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>

              {/* Weaknesses */}
              <div className="card" style={{ padding: "1.25rem", borderTop: "4px solid var(--color-danger, #ef4444)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--color-danger, #ef4444)" }}>WEAKNESSES (W)</span>
                  <span className="badge badge-danger" style={{ fontSize: "0.72rem" }}>Internal Factor</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {activeSwot.weaknesses.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>

              {/* Opportunities */}
              <div className="card" style={{ padding: "1.25rem", borderTop: "4px solid var(--color-primary, #3b82f6)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--color-primary, #3b82f6)" }}>OPPORTUNITIES (O)</span>
                  <span className="badge badge-primary" style={{ fontSize: "0.72rem" }}>External Market</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {activeSwot.opportunities.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>

              {/* Threats */}
              <div className="card" style={{ padding: "1.25rem", borderTop: "4px solid var(--color-warning, #f59e0b)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--color-warning, #f59e0b)" }}>THREATS (T)</span>
                  <span className="badge badge-warning" style={{ fontSize: "0.72rem" }}>External Market</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {activeSwot.threats.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* New SWOT Assessment Form */}
          <div className="card" style={{ padding: "1.25rem" }}>
            <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "0.95rem", fontWeight: 600 }}>Create New Branch / Client SWOT Analysis</h3>
            <form onSubmit={handleAddSwot} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
              <input
                type="text"
                className="input"
                placeholder="Branch or Client Name..."
                value={newClient}
                onChange={(e) => setNewClient(e.target.value)}
                required
              />
              <input
                type="text"
                className="input"
                placeholder="Key Strength..."
                value={newStrength}
                onChange={(e) => setNewStrength(e.target.value)}
              />
              <input
                type="text"
                className="input"
                placeholder="Key Weakness..."
                value={newWeakness}
                onChange={(e) => setNewWeakness(e.target.value)}
              />
              <input
                type="text"
                className="input"
                placeholder="Key Opportunity..."
                value={newOpportunity}
                onChange={(e) => setNewOpportunity(e.target.value)}
              />
              <input
                type="text"
                className="input"
                placeholder="Key Threat..."
                value={newThreat}
                onChange={(e) => setNewThreat(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem" }}>
                <Plus size={14} /> Add SWOT Assessment
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── TAB 2: OKR TRACKING ENGINE ── */}
      {activeTab === "okrs" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* OKRs List */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {okrs.map((okr) => {
              const avgProgress = Math.round(
                okr.keyResults.reduce((sum, kr) => sum + kr.progress, 0) / (okr.keyResults.length || 1)
              );

              return (
                <div key={okr.id} className="card" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Target size={18} color="var(--color-primary, #3b82f6)" />
                      <span style={{ fontWeight: 700, fontSize: "1rem" }}>{okr.objective}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span className="badge badge-secondary" style={{ fontSize: "0.75rem" }}>Target: {okr.targetDate}</span>
                      <span className="badge badge-primary" style={{ fontSize: "0.8rem", fontWeight: 700 }}>{avgProgress}% Completed</span>
                    </div>
                  </div>

                  {/* Objective Overall Progress Bar */}
                  <div style={{ width: "100%", height: "8px", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: "4px", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${avgProgress}%`,
                        height: "100%",
                        backgroundColor: avgProgress >= 75 ? "var(--color-success, #10b981)" : "var(--color-primary, #3b82f6)",
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>

                  {/* Key Results list */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.25rem" }}>
                    {okr.keyResults.map((kr, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "0.5rem 0.75rem",
                          backgroundColor: "rgba(255,255,255,0.02)",
                          borderRadius: "6px",
                          border: "1px solid var(--border-color)",
                          flexWrap: "wrap",
                          gap: "0.5rem",
                        }}
                      >
                        <span style={{ fontSize: "0.85rem", flex: 1 }}>{kr.text}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <button
                            className="btn btn-secondary"
                            onClick={() => handleUpdateKrProgress(okr.id, idx, kr.progress - 10)}
                            style={{ padding: "0.15rem 0.4rem", fontSize: "0.75rem" }}
                          >
                            -10%
                          </button>
                          <span style={{ fontFamily: "monospace", fontSize: "0.85rem", width: "45px", textAlign: "center" }}>
                            {kr.progress}%
                          </span>
                          <button
                            className="btn btn-secondary"
                            onClick={() => handleUpdateKrProgress(okr.id, idx, kr.progress + 10)}
                            style={{ padding: "0.15rem 0.4rem", fontSize: "0.75rem" }}
                          >
                            +10%
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* New OKR Form */}
          <div className="card" style={{ padding: "1.25rem" }}>
            <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "0.95rem", fontWeight: 600 }}>Create New Strategic OKR</h3>
            <form onSubmit={handleAddOkr} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <input
                type="text"
                className="input"
                placeholder="Objective (e.g. Expand Customer Retention Rate to 85%)..."
                value={newObjective}
                onChange={(e) => setNewObjective(e.target.value)}
                required
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 180px", gap: "0.75rem" }}>
                <input
                  type="text"
                  className="input"
                  placeholder="Key Result 1..."
                  value={newKr1}
                  onChange={(e) => setNewKr1(e.target.value)}
                />
                <input
                  type="text"
                  className="input"
                  placeholder="Key Result 2..."
                  value={newKr2}
                  onChange={(e) => setNewKr2(e.target.value)}
                />
                <input
                  type="date"
                  className="input"
                  value={newOkrDate}
                  onChange={(e) => setNewOkrDate(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <Plus size={14} /> Commit Strategic OKR
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── TAB 3: STRATEGY PROJECTS ── */}
      {activeTab === "projects" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="card" style={{ padding: "1.25rem" }}>
            <h3 style={{ margin: "0 0 0.75rem 0", fontSize: "0.95rem", fontWeight: 600 }}>Active Strategic Transformation Projects</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-color)", color: "var(--text-secondary)" }}>
                    <th style={{ padding: "0.6rem 0.75rem" }}>Project Name</th>
                    <th style={{ padding: "0.6rem 0.75rem" }}>Client / Business</th>
                    <th style={{ padding: "0.6rem 0.75rem" }}>Status</th>
                    <th style={{ padding: "0.6rem 0.75rem" }}>Progress</th>
                    <th style={{ padding: "0.6rem 0.75rem" }}>Timeline</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((proj) => (
                    <tr key={proj.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                      <td style={{ padding: "0.6rem 0.75rem", fontWeight: 600 }}>{proj.name}</td>
                      <td style={{ padding: "0.6rem 0.75rem" }}>{proj.client}</td>
                      <td style={{ padding: "0.6rem 0.75rem" }}>
                        <span className={`badge ${proj.status === "Active" ? "badge-success" : "badge-secondary"}`}>
                          {proj.status}
                        </span>
                      </td>
                      <td style={{ padding: "0.6rem 0.75rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <div style={{ width: "80px", height: "6px", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: "3px", overflow: "hidden" }}>
                            <div style={{ width: `${proj.progress}%`, height: "100%", backgroundColor: "var(--color-primary, #3b82f6)" }} />
                          </div>
                          <span>{proj.progress}%</span>
                        </div>
                      </td>
                      <td style={{ padding: "0.6rem 0.75rem", color: "var(--text-secondary)" }}>{proj.timeline}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4: ADVISORY TIME & BILLING ── */}
      {activeTab === "advisory" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem" }}>
          {/* Live Session Timer */}
          <div className="card" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600 }}>Live Consulting Session Timer</h3>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem 0" }}>
              <div style={{ fontSize: "2.8rem", fontWeight: 800, fontFamily: "monospace", color: isTimerRunning ? "var(--color-success, #10b981)" : "inherit" }}>
                {String(Math.floor(timerSeconds / 60)).padStart(2, "0")}:{String(timerSeconds % 60).padStart(2, "0")}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <select
                className="input"
                value={timerClient}
                onChange={(e) => setTimerClient(e.target.value)}
                disabled={isTimerRunning}
              >
                <option value="TBL Distribution">TBL Distribution</option>
                <option value="Bakhresa Group">Bakhresa Group</option>
                <option value="METL Group">METL Group</option>
                <option value="CRDB Bank Advisory">CRDB Bank Advisory</option>
              </select>

              <input
                type="text"
                className="input"
                placeholder="Session scope notes..."
                value={timerNotes}
                onChange={(e) => setTimerNotes(e.target.value)}
              />

              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                {!isTimerRunning ? (
                  <button
                    className="btn btn-primary"
                    onClick={() => setIsTimerRunning(true)}
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem" }}
                  >
                    <Play size={14} /> Start Consultation
                  </button>
                ) : (
                  <button
                    className="btn btn-secondary"
                    onClick={handleStopTimer}
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem", color: "var(--color-danger)" }}
                  >
                    <Square size={14} /> Complete &amp; Bill Session
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Session History Log */}
          <div className="card" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600 }}>Completed Consultation Logs</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "300px", overflowY: "auto" }}>
              {timeLogs.map((log) => (
                <div
                  key={log.id}
                  style={{
                    padding: "0.6rem 0.75rem",
                    border: "1px solid var(--border-color)",
                    borderRadius: "6px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "0.82rem",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{log.client}</div>
                    <div style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>{log.notes}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, color: "var(--color-primary, #3b82f6)" }}>{log.duration}</div>
                    <div style={{ color: "var(--text-secondary)", fontSize: "0.72rem" }}>{log.date}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 5: AI STRATEGY SUGGESTIONS ── */}
      {activeTab === "ai-strategy" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
          <div className="card" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--color-primary, #3b82f6)" }}>
              <Sparkles size={16} />
              <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Pricing Elasticity Recommendation</span>
            </div>
            <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-secondary)" }}>
              Beverage lines show inelastic demand on weekends (+14% volume). A 3% price adjustment across 500ml lagers will generate ~1.8M TZS monthly incremental EBITDA without volume loss.
            </p>
          </div>

          <div className="card" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--color-warning, #f59e0b)" }}>
              <TrendingUp size={16} />
              <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Inventory Turnover Acceleration</span>
            </div>
            <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-secondary)" }}>
              Pantry items in the Dar branch have an average holding cycle of 42 days. Implement a bundle discount promotion with cooking oils to reduce holding period to 21 days.
            </p>
          </div>

          <div className="card" style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--color-success, #10b981)" }}>
              <Shield size={16} />
              <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Cash Variance Shrinkage Prevention</span>
            </div>
            <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-secondary)" }}>
              Mandatory denomination counting reduced register variances by 92% this week. Ensure supervisor override is enforced during evening shift closure handovers.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
