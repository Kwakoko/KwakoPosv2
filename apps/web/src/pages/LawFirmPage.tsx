/**
 * KwakoPosv2 — Law Firm Module Page
 * Full sub-navigation: Dashboard, Clients, Cases, Calendar, Tasks,
 * Documents, Billing & Retainers, Reports, Settings
 * CSS: V2 design system only. No static inline styles.
 */
import React, { useState } from "react";
import { runUiAction } from "../services/uiActionRegistry.js";
import {
  Scale, Users, Calendar, AlertCircle, DollarSign, ShieldAlert, Clock,
  ChevronRight, Gavel, FileText, Plus, Search, ArrowRight, BarChart2,
  CheckCircle, Edit2, Eye, Trash2, Tag, Hash, Building, MapPin,
  Phone, Mail, Briefcase, Bell, Download, Filter, Check, X,
} from "lucide-react";
import { useModule } from "../context/KwakoPosContexts.js";
import { recordLawFirmPayment, saveLawFirmSettings } from "../services/verticalMutationService.js";

// ─── Types ────────────────────────────────────────────────────────────────────
const money = (v: number) =>
  v >= 1_000_000 ? `Tsh ${(v / 1_000_000).toFixed(1)}M`
  : v >= 1_000 ? `Tsh ${(v / 1_000).toFixed(0)}K`
  : `Tsh ${Math.round(v).toLocaleString()}`;

// ─── Sub-nav tabs ─────────────────────────────────────────────────────────────
const LAW_TABS = [
  "Legal Dashboard", "Clients", "Cases", "Court Calendar",
  "Legal Tasks", "Documents", "Billing & Retainers", "Legal Reports", "Legal Settings",
] as const;
type LawTab = typeof LAW_TABS[number];

// ─── Shared components ────────────────────────────────────────────────────────
const KpiCard: React.FC<{
  label: string; value: string | number; desc?: string;
  icon: React.ReactNode; accent: string; onClick?: () => void;
}> = ({ label, value, desc, icon, accent, onClick }) => (
  <div
    className={`kpi-card${onClick ? "" : ""}`}
    onClick={onClick}
    style={onClick ? { cursor: "pointer" } : undefined}
    role={onClick ? "button" : undefined}
    tabIndex={onClick ? 0 : undefined}
  >
    <div className="kpi-card-blob" style={{ background: accent }} />
    <div className="v2-flex v2-items-start v2-justify-between v2-gap-2">
      <div>
        <div className="kpi-card-label">{label}</div>
        <div className="kpi-card-value">{value}</div>
        {desc && <div className="kpi-card-desc">{desc}</div>}
      </div>
      <div className="kpi-card-icon-box" style={{ background: `${accent}18`, color: accent }}>
        {icon}
      </div>
    </div>
  </div>
);

const Empty: React.FC<{ icon?: React.ReactNode; message: string; action?: React.ReactNode }> = ({ icon, message, action }) => (
  <div className="v2-empty">
    <div className="v2-empty-icon">{icon || <FileText size={22} />}</div>
    <p className="v2-empty-title">{message}</p>
    {action && <div style={{ marginTop: ".75rem" }}>{action}</div>}
  </div>
);

// ─── Demo Data ────────────────────────────────────────────────────────────────
const DEMO_CASES = [
  { id: "LC-2026-001", title: "Mwangi v. Tanzania Revenue Authority",  client: "John Mwangi",    status: "IN_PROGRESS", type: "Tax Dispute",   court: "High Court Dar", nextHearing: "2026-09-15" },
  { id: "LC-2026-002", title: "Safaricom Ltd — Contract Review",       client: "Safaricom Ltd",  status: "OPEN",        type: "Commercial",    court: "Commercial Court", nextHearing: "—" },
  { id: "LC-2026-003", title: "R v. Hassan Mohamed",                    client: "Hassan Mohamed", status: "IN_PROGRESS", type: "Criminal",      court: "Resident Magistrate", nextHearing: "2026-09-08" },
  { id: "LC-2026-004", title: "Fatuma Estate — Succession Matter",      client: "Fatuma Salum",   status: "INTAKE",      type: "Succession",    court: "High Court PBD", nextHearing: "2026-09-22" },
  { id: "LC-2026-005", title: "THA v. Dar Port Authority",             client: "THA",            status: "CLOSED",      type: "Admin Law",     court: "High Court Dar", nextHearing: "—" },
];

const DEMO_CLIENTS = [
  { id: "CL-001", name: "John Mwangi",   type: "Individual", phone: "+255 712 111 222", email: "jmwangi@email.co.tz",  balance: 4500000, matters: 2 },
  { id: "CL-002", name: "Safaricom Ltd", type: "Corporate",  phone: "+255 800 726 000", email: "legal@safaricom.co.tz", balance: 22000000, matters: 1 },
  { id: "CL-003", name: "Hassan Mohamed",type: "Individual", phone: "+255 754 333 444", email: "hassan.m@gmail.com",   balance: 1800000, matters: 1 },
  { id: "CL-004", name: "Fatuma Salum",  type: "Individual", phone: "+255 768 555 666", email: "fatuma.s@yahoo.com",   balance: 3200000, matters: 1 },
  { id: "CL-005", name: "THA",           type: "Government", phone: "+255 22 211 5000", email: "legal@tha.go.tz",      balance: 18500000, matters: 1 },
];

const DEMO_HEARINGS = [
  { id: "H-001", caseId: "LC-2026-001", title: "Tax Tribunal Mention",         date: "2026-09-08", time: "09:00", court: "High Court Dar",      type: "Mention",  status: "Scheduled" },
  { id: "H-002", caseId: "LC-2026-003", title: "Criminal Bail Hearing",        date: "2026-09-10", time: "10:30", court: "Res. Magistrate Dar", type: "Hearing",  status: "Scheduled" },
  { id: "H-003", caseId: "LC-2026-001", title: "Substantive Hearing — Day 1",  date: "2026-09-15", time: "08:30", court: "High Court Dar",      type: "Trial",    status: "Scheduled" },
  { id: "H-004", caseId: "LC-2026-004", title: "Succession Application",       date: "2026-09-22", time: "14:00", court: "High Court PBD",      type: "Petition", status: "Scheduled" },
];

const DEMO_TASKS = [
  { id: "T-001", title: "File Written Submissions — Mwangi Tax Case", caseId: "LC-2026-001", dueDate: "2026-09-05", priority: "HIGH",   status: "OVERDUE",   assignee: "Adv. Kamau" },
  { id: "T-002", title: "Draft Contract Opinion — Safaricom",         caseId: "LC-2026-002", dueDate: "2026-09-12", priority: "MEDIUM", status: "OPEN",      assignee: "Adv. Kimani" },
  { id: "T-003", title: "Serve pleadings on opposing counsel",        caseId: "LC-2026-003", dueDate: "2026-09-09", priority: "HIGH",   status: "OPEN",      assignee: "Clerk Joan" },
  { id: "T-004", title: "Confirm court attendance — Fatuma matter",   caseId: "LC-2026-004", dueDate: "2026-09-20", priority: "LOW",    status: "COMPLETED", assignee: "Adv. Kimani" },
];

const DEMO_DOCS = [
  { id: "DOC-001", name: "Mwangi — Notice of Appeal.pdf",    caseId: "LC-2026-001", type: "Pleading",  size: "1.2 MB", uploaded: "2026-08-20" },
  { id: "DOC-002", name: "Safaricom Contract v3 Draft.docx", caseId: "LC-2026-002", type: "Contract",  size: "680 KB", uploaded: "2026-08-22" },
  { id: "DOC-003", name: "Hassan — Bail Application.pdf",   caseId: "LC-2026-003", type: "Motion",    size: "840 KB", uploaded: "2026-08-28" },
  { id: "DOC-004", name: "THA Correspondence Chain.pdf",    caseId: "LC-2026-005", type: "Correspondence", size: "2.1 MB", uploaded: "2026-07-14" },
];

const DEMO_BILLING = [
  { id: "INV-2026-081", client: "John Mwangi",    description: "Substantive Hearing Attendance × 2", amount: 2800000, hours: 6,   status: "UNPAID",    date: "2026-08-25" },
  { id: "INV-2026-082", client: "Safaricom Ltd",  description: "Contract Advisory — 12 hrs",         amount: 7200000, hours: 12,  status: "PAID",      date: "2026-08-20" },
  { id: "INV-2026-083", client: "Hassan Mohamed", description: "Criminal Defence Retainer Draw",      amount: 1500000, hours: 4,   status: "UNPAID",    date: "2026-08-30" },
  { id: "INV-2026-084", client: "THA",            description: "Admin Law Matter — Research",         amount: 4800000, hours: 10,  status: "PARTIAL",   date: "2026-08-18" },
];

const STATUS_BADGE: Record<string, string> = {
  IN_PROGRESS: "v2-badge-accent", OPEN: "v2-badge-info", INTAKE: "v2-badge-warning",
  CLOSED: "v2-badge-muted", COMPLETED: "v2-badge-success", OVERDUE: "v2-badge-danger",
  PAID: "v2-badge-success", UNPAID: "v2-badge-danger", PARTIAL: "v2-badge-warning",
  Scheduled: "v2-badge-accent",
};

// ─── Sub-page: Legal Dashboard ────────────────────────────────────────────────
const LegalDashboard: React.FC<{ onNav: (tab: LawTab) => void }> = ({ onNav }) => {
  const activeCases   = DEMO_CASES.filter((c) => ["INTAKE","OPEN","IN_PROGRESS"].includes(c.status)).length;
  const overdueTasks  = DEMO_TASKS.filter((t) => t.status === "OVERDUE").length;
  const unbilled      = DEMO_BILLING.filter((b) => b.status !== "PAID").reduce((s, b) => s + b.amount, 0);
  const retainerBal   = 45200000;

  return (
    <div className="v2-animate-page-enter">
      {/* Hero banner */}
      <div className="v2-card v2-mb-4" style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #1e1b4b 100%)", border: "1px solid #4338ca33" }}>
        <div className="v2-card-body v2-flex v2-items-center v2-gap-4">
          <div style={{ width: 48, height: 48, borderRadius: "var(--radius-xl)", background: "rgba(99,102,241,.2)", border: "1px solid rgba(99,102,241,.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Scale size={22} style={{ color: "#a5b4fc" }} />
          </div>
          <div style={{ flex: 1 }}>
            <h1 className="v2-text-xl v2-font-black" style={{ color: "#fff", letterSpacing: "-.02em" }}>Legal Practice Intelligence</h1>
            <p className="v2-text-xs" style={{ color: "#a5b4fc", marginTop: ".2rem" }}>Active litigation tracking, conflict checks, retainer monitoring & court calendaring</p>
          </div>
          <span className="badge v2-badge-accent">LAW_FIRM</span>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="metrics-grid kpi-grid-4 v2-mb-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}>
        <KpiCard label="Active Cases"    value={activeCases}        desc={`${DEMO_CASES.length} total matters`}  icon={<Gavel size={18} />}       accent="#6366f1" onClick={() => onNav("Cases")} />
        <KpiCard label="Total Clients"   value={DEMO_CLIENTS.length} desc="Individuals & corporates"              icon={<Users size={18} />}       accent="#38bdf8" onClick={() => onNav("Clients")} />
        <KpiCard label="Hearings (7d)"   value={DEMO_HEARINGS.length} desc="Court events scheduled"              icon={<Calendar size={18} />}    accent="#4ade80" onClick={() => onNav("Court Calendar")} />
        <KpiCard label="Overdue Tasks"   value={overdueTasks}        desc="Filing deadlines"                      icon={<AlertCircle size={18} />} accent="#fbbf24" onClick={() => onNav("Legal Tasks")} />
        <KpiCard label="Unbilled Fees"   value={money(unbilled)}     desc="Pending invoices"                      icon={<DollarSign size={18} />}  accent="#818cf8" onClick={() => onNav("Billing & Retainers")} />
        <KpiCard label="Retainer Fund"   value={money(retainerBal)}  desc="Client trust balance"                 icon={<ShieldAlert size={18} />} accent="#34d399" />
      </div>

      {/* Split: Cases + Hearings */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1rem" }}>
        <div className="v2-card">
          <div className="v2-card-header">
            <div className="v2-flex v2-items-center v2-gap-2">
              <Gavel size={15} style={{ color: "#6366f1" }} />
              <div className="v2-card-title">Active Legal Cases & Matters</div>
            </div>
            <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => onNav("Cases")} type="button">View all <ArrowRight size={13} /></button>
          </div>
          <div className="v2-card-body" style={{ padding: 0 }}>
            {DEMO_CASES.filter((c) => c.status !== "CLOSED").map((c) => (
              <div key={c.id} className="v2-flex v2-items-center v2-gap-3" style={{ padding: ".75rem 1.25rem", borderBottom: "1px solid var(--surface-border)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="v2-flex v2-items-center v2-gap-2">
                    <span className="v2-mono v2-text-xs v2-font-black" style={{ color: "#818cf8" }}>#{c.id}</span>
                    <span className="v2-text-sm v2-font-black v2-truncate">{c.title}</span>
                  </div>
                  <div className="v2-text-xs v2-text-muted" style={{ marginTop: ".15rem" }}>
                    Client: <strong>{c.client}</strong> · {c.type} · {c.court}
                  </div>
                </div>
                <div className="v2-flex v2-items-center v2-gap-2">
                  {c.nextHearing !== "—" && <span className="v2-text-xs v2-text-muted">{c.nextHearing}</span>}
                  <span className={`badge ${STATUS_BADGE[c.status] || "v2-badge-muted"}`}>{c.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="v2-card">
          <div className="v2-card-header">
            <div className="v2-flex v2-items-center v2-gap-2">
              <Calendar size={15} style={{ color: "#4ade80" }} />
              <div className="v2-card-title">Upcoming Hearings</div>
            </div>
            <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => onNav("Court Calendar")} type="button">Calendar <ArrowRight size={13} /></button>
          </div>
          <div className="v2-card-body" style={{ padding: ".65rem" }}>
            <div className="v2-space-y-4">
              {DEMO_HEARINGS.map((h) => (
                <div key={h.id} className="v2-card" style={{ background: "var(--surface-2)", padding: ".65rem .85rem" }}>
                  <div className="v2-flex v2-items-center v2-justify-between v2-mb-1">
                    <span className={`badge ${STATUS_BADGE[h.type] || "v2-badge-muted"}`} style={{ fontSize: ".6rem" }}>{h.type}</span>
                    <span className="v2-text-xs v2-text-muted v2-flex v2-items-center v2-gap-1"><Clock size={10} /> {h.date} · {h.time}</span>
                  </div>
                  <div className="v2-text-xs v2-font-black">{h.title}</div>
                  <div className="v2-text-xs v2-text-muted" style={{ marginTop: ".1rem" }}>{h.court}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Sub-page: Clients ────────────────────────────────────────────────────────
const LegalClients: React.FC = () => {
  const [search, setSearch] = useState("");
  const filtered = DEMO_CLIENTS.filter((c) => !search || `${c.name} ${c.type} ${c.email}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="v2-animate-page-enter">
      <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
        <h2 className="v2-text-xl v2-font-black">Clients & Corporate Register</h2>
        <button className="v2-btn v2-btn-primary v2-btn-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.LawFirmPage.215.new-client", "New Client", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.LawFirmPage.215.new-client"><Plus size={13} /> New Client</button>
      </div>
      <div className="v2-card">
        <div className="v2-card-header">
          <div className="v2-flex v2-items-center v2-gap-2" style={{ flex: 1 }}>
            <Search size={13} style={{ color: "var(--muted)" }} />
            <input className="v2-input" style={{ border: "none", padding: ".3rem .4rem", flex: 1 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search clients…" />
          </div>
          <button className="v2-btn v2-btn-secondary v2-btn-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.LawFirmPage.223.export", "Export", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.LawFirmPage.223.export"><Download size={13} /> Export</button>
        </div>
        <table className="v2-table">
          <thead><tr><th>Client ID</th><th>Name</th><th>Type</th><th>Phone</th><th>Email</th><th>Retainer Bal.</th><th>Matters</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}>
                <td className="v2-mono v2-text-xs">{c.id}</td>
                <td className="v2-font-bold">{c.name}</td>
                <td><span className={`badge ${c.type === "Corporate" ? "v2-badge-accent" : c.type === "Government" ? "v2-badge-info" : "v2-badge-muted"}`}>{c.type}</span></td>
                <td className="v2-text-muted">{c.phone}</td>
                <td className="v2-mono v2-text-xs v2-text-muted">{c.email}</td>
                <td className="v2-font-black">{money(c.balance)}</td>
                <td><span className="badge v2-badge-muted">{c.matters}</span></td>
                <td>
                  <div className="v2-flex v2-gap-1">
                    <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.LawFirmPage.239.button", "Button", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.LawFirmPage.239.button"><Eye size={13} /></button>
                    <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.LawFirmPage.240.button", "Button", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.LawFirmPage.240.button"><Edit2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Sub-page: Cases & Matters ────────────────────────────────────────────────
const LegalCases: React.FC = () => {
  const [filter, setFilter] = useState("All");
  const statuses = ["All", "INTAKE", "OPEN", "IN_PROGRESS", "CLOSED"];
  const filtered = DEMO_CASES.filter((c) => filter === "All" || c.status === filter);
  return (
    <div className="v2-animate-page-enter">
      <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
        <h2 className="v2-text-xl v2-font-black">Legal Cases & Matters</h2>
        <div className="v2-flex v2-gap-2">
          <button className="v2-btn v2-btn-secondary v2-btn-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.LawFirmPage.262.conflict-check", "Conflict Check", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.LawFirmPage.262.conflict-check"><ShieldAlert size={13} /> Conflict Check</button>
          <button className="v2-btn v2-btn-primary v2-btn-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.LawFirmPage.263.open-matter", "Open Matter", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.LawFirmPage.263.open-matter"><Plus size={13} /> Open Matter</button>
        </div>
      </div>
      <div className="v2-card">
        <div style={{ display: "flex", gap: ".3rem", padding: ".75rem 1.25rem", borderBottom: "1px solid var(--surface-border)" }}>
          {statuses.map((s) => (
            <button key={s} aria-label={s} className={`sector-pill${filter === s ? " active" : ""}`} onClick={() => setFilter(s)} type="button">{s}</button>
          ))}
        </div>
        <table className="v2-table">
          <thead><tr><th>Case #</th><th>Title</th><th>Client</th><th>Type</th><th>Court</th><th>Next Hearing</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}>
                <td className="v2-mono v2-text-xs v2-font-black" style={{ color: "#818cf8" }}>{c.id}</td>
                <td className="v2-font-bold" style={{ maxWidth: 200 }}>{c.title}</td>
                <td className="v2-text-muted">{c.client}</td>
                <td><span className="badge v2-badge-muted">{c.type}</span></td>
                <td className="v2-text-xs v2-text-muted">{c.court}</td>
                <td className="v2-text-xs">{c.nextHearing}</td>
                <td><span className={`badge ${STATUS_BADGE[c.status] || "v2-badge-muted"}`}>{c.status}</span></td>
                <td>
                  <div className="v2-flex v2-gap-1">
                    <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.LawFirmPage.286.button", "Button", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.LawFirmPage.286.button"><Eye size={13} /></button>
                    <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.LawFirmPage.287.button", "Button", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.LawFirmPage.287.button"><Edit2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Sub-page: Court Calendar ─────────────────────────────────────────────────
const LegalCalendar: React.FC = () => (
  <div className="v2-animate-page-enter">
    <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
      <h2 className="v2-text-xl v2-font-black">Court Calendar & Hearing Scheduler</h2>
      <button className="v2-btn v2-btn-primary v2-btn-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.LawFirmPage.304.schedule-hearing", "Schedule Hearing", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.LawFirmPage.304.schedule-hearing"><Plus size={13} /> Schedule Hearing</button>
    </div>
    <div className="metrics-grid kpi-grid-4 v2-mb-4">
      <KpiCard label="This Week"    value={DEMO_HEARINGS.length} desc="Court events" icon={<Calendar size={18} />} accent="#38bdf8" />
      <KpiCard label="Trials"       value="1 Active"             desc="On trial"     icon={<Gavel size={18} />}    accent="#818cf8" />
      <KpiCard label="Mentions"     value="2 Upcoming"           desc="Short hearings" icon={<Clock size={18} />} accent="#4ade80" />
      <KpiCard label="Deadlines"    value="3 Filing"             desc="This month"   icon={<AlertCircle size={18} />} accent="#fbbf24" />
    </div>
    <div className="v2-card">
      <div className="v2-card-header"><div className="v2-card-title">September 2026 — Court Diary</div></div>
      <table className="v2-table">
        <thead><tr><th>Date</th><th>Time</th><th>Event</th><th>Case</th><th>Court</th><th>Type</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {DEMO_HEARINGS.map((h) => (
            <tr key={h.id}>
              <td className="v2-font-black">{h.date}</td>
              <td className="v2-mono v2-text-xs">{h.time}</td>
              <td className="v2-font-bold">{h.title}</td>
              <td className="v2-mono v2-text-xs v2-text-muted">{h.caseId}</td>
              <td className="v2-text-xs v2-text-muted">{h.court}</td>
              <td><span className="badge v2-badge-muted">{h.type}</span></td>
              <td><span className={`badge ${STATUS_BADGE[h.status] || "v2-badge-muted"}`}>{h.status}</span></td>
              <td>
                <div className="v2-flex v2-gap-1">
                  <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.LawFirmPage.328.button", "Button", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.LawFirmPage.328.button"><Bell size={13} /></button>
                  <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.LawFirmPage.329.button", "Button", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.LawFirmPage.329.button"><Edit2 size={13} /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ─── Sub-page: Legal Tasks ────────────────────────────────────────────────────
const LegalTasks: React.FC = () => {
  const [filter, setFilter] = useState("All");
  const filters = ["All", "OVERDUE", "OPEN", "COMPLETED"];
  const filtered = DEMO_TASKS.filter((t) => filter === "All" || t.status === filter);
  return (
    <div className="v2-animate-page-enter">
      <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
        <h2 className="v2-text-xl v2-font-black">Legal Task Manager & Deadlines</h2>
        <button className="v2-btn v2-btn-primary v2-btn-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.LawFirmPage.349.add-task", "Add Task", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.LawFirmPage.349.add-task"><Plus size={13} /> Add Task</button>
      </div>
      <div className="v2-card">
        <div style={{ display: "flex", gap: ".3rem", padding: ".75rem 1.25rem", borderBottom: "1px solid var(--surface-border)" }}>
          {filters.map((f) => (
            <button key={f} aria-label={f} className={`sector-pill${filter === f ? " active" : ""}`} onClick={() => setFilter(f)} type="button">{f}</button>
          ))}
        </div>
        <table className="v2-table">
          <thead><tr><th>Task</th><th>Case</th><th>Due Date</th><th>Priority</th><th>Assignee</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id}>
                <td className="v2-font-bold">{t.title}</td>
                <td className="v2-mono v2-text-xs v2-text-muted">{t.caseId}</td>
                <td className={`v2-text-xs v2-font-black ${t.status === "OVERDUE" ? "" : ""}`} style={{ color: t.status === "OVERDUE" ? "var(--danger)" : "inherit" }}>{t.dueDate}</td>
                <td><span className={`badge ${t.priority === "HIGH" ? "v2-badge-danger" : t.priority === "MEDIUM" ? "v2-badge-warning" : "v2-badge-muted"}`}>{t.priority}</span></td>
                <td className="v2-text-xs v2-text-muted">{t.assignee}</td>
                <td><span className={`badge ${STATUS_BADGE[t.status] || "v2-badge-muted"}`}>{t.status}</span></td>
                <td>
                  <div className="v2-flex v2-gap-1">
                    {t.status !== "COMPLETED" && <button className="v2-btn v2-btn-success v2-btn-icon-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.LawFirmPage.370.button", "Button", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.LawFirmPage.370.button"><Check size={12} /></button>}
                    <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.LawFirmPage.371.button", "Button", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.LawFirmPage.371.button"><Edit2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Sub-page: Documents ──────────────────────────────────────────────────────
const LegalDocuments: React.FC = () => (
  <div className="v2-animate-page-enter">
    <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
      <h2 className="v2-text-xl v2-font-black">Case Document Repository</h2>
      <button className="v2-btn v2-btn-primary v2-btn-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.LawFirmPage.388.upload-document", "Upload Document", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.LawFirmPage.388.upload-document"><Plus size={13} /> Upload Document</button>
    </div>
    <div className="v2-card">
      <div className="v2-card-header">
        <div className="v2-flex v2-items-center v2-gap-2" style={{ flex: 1 }}>
          <Search size={13} style={{ color: "var(--muted)" }} />
          <input className="v2-input" style={{ border: "none", padding: ".3rem .4rem", flex: 1 }} placeholder="Search documents…" />
        </div>
        <button className="v2-btn v2-btn-secondary v2-btn-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.LawFirmPage.396.filter-by-case", "Filter by Case", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.LawFirmPage.396.filter-by-case"><Filter size={13} /> Filter by Case</button>
      </div>
      <table className="v2-table">
        <thead><tr><th>Document</th><th>Case</th><th>Type</th><th>Size</th><th>Uploaded</th><th>Actions</th></tr></thead>
        <tbody>
          {DEMO_DOCS.map((d) => (
            <tr key={d.id}>
              <td>
                <div className="v2-flex v2-items-center v2-gap-2">
                  <FileText size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
                  <span className="v2-text-sm v2-font-bold">{d.name}</span>
                </div>
              </td>
              <td className="v2-mono v2-text-xs v2-text-muted">{d.caseId}</td>
              <td><span className="badge v2-badge-muted">{d.type}</span></td>
              <td className="v2-text-xs v2-text-muted">{d.size}</td>
              <td className="v2-text-xs v2-text-muted">{d.uploaded}</td>
              <td>
                <div className="v2-flex v2-gap-1">
                  <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.LawFirmPage.415.button", "Button", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.LawFirmPage.415.button"><Download size={13} /></button>
                  <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.LawFirmPage.416.button", "Button", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.LawFirmPage.416.button"><Eye size={13} /></button>
                  <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.LawFirmPage.417.button", "Button", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.LawFirmPage.417.button" data-permission="LEGAL_DOCUMENT_DELETE"><Trash2 size={13} style={{ color: "var(--danger)" }} /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ─── Sub-page: Billing & Retainers ────────────────────────────────────────────
const LegalBilling: React.FC = () => {
  const [paidInvoices, setPaidInvoices] = useState<Set<string>>(() => new Set());
  const [paymentNotice, setPaymentNotice] = useState("");
  const totalBilled  = DEMO_BILLING.reduce((s, b) => s + b.amount, 0);
  const totalUnpaid  = DEMO_BILLING.filter((b) => b.status !== "PAID").reduce((s, b) => s + b.amount, 0);
  return (
    <div className="v2-animate-page-enter">
      <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
        <h2 className="v2-text-xl v2-font-black">Billing, Invoices & Retainers</h2>
        <div className="v2-flex v2-gap-2">
          <button className="v2-btn v2-btn-secondary v2-btn-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.LawFirmPage.437.time-entry", "Time Entry", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.LawFirmPage.437.time-entry"><Clock size={13} /> Time Entry</button>
          <button className="v2-btn v2-btn-primary v2-btn-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.LawFirmPage.438.new-invoice", "New Invoice", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.LawFirmPage.438.new-invoice"><Plus size={13} /> New Invoice</button>
        </div>
      </div>
      <div className="metrics-grid kpi-grid-4 v2-mb-4">
        <KpiCard label="Total Billed"    value={money(totalBilled)}   icon={<DollarSign size={18} />}  accent="#38bdf8" />
        <KpiCard label="Outstanding"     value={money(totalUnpaid)}   icon={<AlertCircle size={18} />} accent="#f87171" />
        <KpiCard label="Retainer Fund"   value={money(45200000)}      icon={<ShieldAlert size={18} />} accent="#4ade80" />
        <KpiCard label="Billable Hours"  value={`${DEMO_BILLING.reduce((s, b) => s + b.hours, 0)} hrs`} icon={<Clock size={18} />} accent="#818cf8" />
      </div>
      {paymentNotice && <div className="v2-card v2-mb-3" role="status"><div className="v2-card-body v2-text-sm v2-font-bold">{paymentNotice}</div></div>}
      <div className="v2-card">
        <div className="v2-card-header"><div className="v2-card-title">Invoice Register</div>
          <button className="v2-btn v2-btn-secondary v2-btn-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.LawFirmPage.449.export", "Export", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.LawFirmPage.449.export"><Download size={13} /> Export</button>
        </div>
        <table className="v2-table">
          <thead><tr><th>Invoice #</th><th>Client</th><th>Description</th><th>Hours</th><th>Amount</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {DEMO_BILLING.map((b) => {
              const isPaid = b.status === "PAID" || paidInvoices.has(b.id);
              return (
              <tr key={b.id}>
                <td className="v2-mono v2-text-xs">{b.id}</td>
                <td className="v2-font-bold">{b.client}</td>
                <td className="v2-text-xs v2-text-muted">{b.description}</td>
                <td>{b.hours}h</td>
                <td className="v2-font-black">{money(b.amount)}</td>
                <td className="v2-text-xs v2-text-muted">{b.date}</td>
                <td><span className={`badge ${STATUS_BADGE[isPaid ? "PAID" : b.status] || "v2-badge-muted"}`}>{isPaid ? "PAID" : b.status}</span></td>
                <td>
                  <div className="v2-flex v2-gap-1">
                    <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.LawFirmPage.465.button", "Button", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.LawFirmPage.465.button"><Eye size={13} /></button>
                    {!isPaid && <button className="v2-btn v2-btn-success v2-btn-sm" type="button" onClick={() => { void recordLawFirmPayment(b.id, b.amount).then((result) => { setPaidInvoices((prev) => new Set(prev).add(b.id)); setPaymentNotice(`Payment recorded for ${b.id} (${result.source})`); void runUiAction("ui.apps.web.src.pages.LawFirmPage.466.record-payment", "Record Payment", "MUTATION_INTENT"); }).catch((error) => { setPaymentNotice(error instanceof Error ? error.message : "Payment failed"); }); }} data-action-id="ui.apps.web.src.pages.LawFirmPage.466.record-payment">Record Payment</button>}
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Sub-page: Reports ────────────────────────────────────────────────────────
const LegalReports: React.FC = () => (
  <div className="v2-animate-page-enter">
    <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
      <h2 className="v2-text-xl v2-font-black">Legal Practice Reports</h2>
      <button className="v2-btn v2-btn-primary v2-btn-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.LawFirmPage.483.export-pdf", "Export PDF", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.LawFirmPage.483.export-pdf"><Download size={13} /> Export PDF</button>
    </div>
    <div className="v2-grid-2" style={{ gap: ".75rem" }}>
      {["Matter Status Report", "Client AR Aging", "Timesheet Summary", "Retainer Activity", "Court Diary Report", "Revenue by Practice Area"].map((r) => (
        <div key={r} className="v2-card" style={{ padding: "1rem 1.25rem", cursor: "pointer" }}>
          <div className="v2-flex v2-items-center v2-gap-3">
            <BarChart2 size={18} style={{ color: "var(--accent)", flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div className="v2-text-sm v2-font-black">{r}</div>
              <div className="v2-text-xs v2-text-muted">Export as CSV / PDF</div>
            </div>
            <ChevronRight size={14} style={{ color: "var(--muted)" }} />
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ─── Sub-page: Settings ───────────────────────────────────────────────────────
const LegalSettings: React.FC = () => (
  <div className="v2-animate-page-enter">
    <h2 className="v2-text-xl v2-font-black v2-mb-4">Law Firm Module Settings</h2>
    <div className="v2-card">
      <div className="v2-card-header"><div className="v2-card-title">Practice Configuration</div></div>
      <div className="v2-card-body v2-space-y-4">
        {[
          { label: "FIRM NAME", value: "Kamau & Associates Advocates" },
          { label: "LST REGISTRATION", value: "LST/ADV/2018/0042" },
          { label: "TRA TIN", value: "100-XXX-XXX" },
          { label: "DEFAULT HOURLY RATE (TZS)", value: "600,000" },
          { label: "CONFLICT CHECK POLICY", value: "Mandatory — All New Matters" },
          { label: "RETAINER MINIMUM THRESHOLD (TZS)", value: "1,000,000" },
        ].map((f) => (
          <div key={f.label}>
            <label className="v2-text-xs v2-font-black v2-text-muted" style={{ display: "block", marginBottom: ".3rem" }}>{f.label}</label>
            <input className="v2-input" defaultValue={f.value} />
          </div>
        ))}
        <button className="v2-btn v2-btn-primary v2-btn-sm" type="button" onClick={() => { const settings = Object.fromEntries(Array.from(document.querySelectorAll("input.v2-input")).map((el) => [(el as HTMLInputElement).previousElementSibling?.textContent || "SETTING", (el as HTMLInputElement).value])); void saveLawFirmSettings(settings).then(() => runUiAction("ui.apps.web.src.pages.LawFirmPage.522.save-settings", "Save Settings", "MUTATION_INTENT")); }} data-action-id="ui.apps.web.src.pages.LawFirmPage.522.save-settings"><CheckCircle size={13} /> Save Settings</button>
      </div>
    </div>
  </div>
);

// ─── Law Firm Module Entry Point ──────────────────────────────────────────────
export const LawFirmPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<LawTab>("Legal Dashboard");

  const renderTab = () => {
    switch (activeTab) {
      case "Legal Dashboard":       return <LegalDashboard onNav={setActiveTab} />;
      case "Clients":               return <LegalClients />;
      case "Cases":                 return <LegalCases />;
      case "Court Calendar":        return <LegalCalendar />;
      case "Legal Tasks":           return <LegalTasks />;
      case "Documents":             return <LegalDocuments />;
      case "Billing & Retainers":   return <LegalBilling />;
      case "Legal Reports":         return <LegalReports />;
      case "Legal Settings":        return <LegalSettings />;
      default:                      return <LegalDashboard onNav={setActiveTab} />;
    }
  };

  return (
    <div className="v2-animate-page-enter">
      {/* Module sub-nav */}
      <div style={{ display: "flex", gap: ".3rem", flexWrap: "wrap", marginBottom: "1rem", padding: ".5rem .65rem", background: "var(--surface-1)", borderRadius: "var(--radius-xl)", border: "1px solid var(--surface-border)" }}>
        {LAW_TABS.map((tab) => (
          <button
            key={tab}
            aria-label={tab}
            className={`sector-pill${activeTab === tab ? " active" : ""}`}
            onClick={() => setActiveTab(tab)}
            type="button"
          >
            {tab}
          </button>
        ))}
      </div>
      {renderTab()}
    </div>
  );
};