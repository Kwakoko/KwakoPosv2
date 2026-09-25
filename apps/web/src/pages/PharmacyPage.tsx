/**
 * KwakoPosv2 — Pharmacy Module Page
 * Sub-views: Dashboard, Pharmacy POS, Patients, Medicines, Batch & Expiry,
 * Prescriptions, Doctors, Drug Safety, Inventory, Insurance & NHIF,
 * Controlled Drugs, Reports, Settings
 * CSS: V2 design system only.
 */
import React, { useState } from "react";
import { runUiAction } from "../services/uiActionRegistry.js";
import { dispensePharmacyMedicine, persistPharmacyBatchAction } from "../services/verticalMutationService.js";
import {
  Pill, Users, FileText, AlertTriangle, DollarSign, Clock, Plus, Search,
  ArrowRight, ChevronRight, BarChart2, Download, Edit2, Eye, Trash2,
  CheckCircle, Check, Shield, ShieldAlert, Package, Activity, Tag,
  RefreshCw, Hash, Bell, Building, Filter,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const money = (v: number) =>
  v >= 1_000_000 ? `Tsh ${(v / 1_000_000).toFixed(1)}M`
  : v >= 1_000 ? `Tsh ${(v / 1_000).toFixed(0)}K`
  : `Tsh ${Math.round(v).toLocaleString()}`;

const PHARM_TABS = [
  "Pharmacy Dashboard", "Pharmacy POS", "Patients", "Medicines",
  "Batch & Expiry", "Prescriptions", "Doctors",
  "Drug Safety", "Pharmacy Inventory", "Insurance & NHIF",
  "Controlled Drugs", "Pharmacy Reports", "Pharmacy Settings",
] as const;
type PharmTab = typeof PHARM_TABS[number];

const KpiCard: React.FC<{
  label: string; value: string | number; desc?: string;
  icon: React.ReactNode; accent: string; onClick?: () => void;
}> = ({ label, value, desc, icon, accent, onClick }) => (
  <div
    className="kpi-card"
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
      <div className="kpi-card-icon-box" style={{ background: `${accent}18`, color: accent }}>{icon}</div>
    </div>
  </div>
);

// ─── Demo Data ────────────────────────────────────────────────────────────────
const DEMO_PATIENTS = [
  { id: "PAT-001", name: "Grace Mwandani",  age: 42, phone: "+255 712 001 001", diagnosis: "Hypertension",    lastVisit: "2026-08-28", status: "Active" },
  { id: "PAT-002", name: "Said Hamisi",     age: 67, phone: "+255 754 002 002", diagnosis: "Diabetes T2",     lastVisit: "2026-08-25", status: "Active" },
  { id: "PAT-003", name: "Amina Juma",      age: 29, phone: "+255 768 003 003", diagnosis: "Malaria",          lastVisit: "2026-08-30", status: "Active" },
  { id: "PAT-004", name: "Peter Ochieng",   age: 55, phone: "+255 712 004 004", diagnosis: "Arthritis",        lastVisit: "2026-08-10", status: "Inactive" },
];

const DEMO_MEDICINES = [
  { id: "MED-001", name: "Amlodipine 5mg",      category: "Cardiovascular", unit: "Tablet",  price: 1500,   stock: 1200, reorder: 200, controlled: false },
  { id: "MED-002", name: "Metformin 500mg",      category: "Endocrine",     unit: "Tablet",  price: 800,    stock: 2400, reorder: 300, controlled: false },
  { id: "MED-003", name: "Amoxicillin 500mg",    category: "Antibiotic",    unit: "Capsule", price: 1200,   stock: 800,  reorder: 200, controlled: false },
  { id: "MED-004", name: "Morphine 10mg/mL",     category: "Opioid",        unit: "Amp",     price: 12000,  stock: 48,   reorder: 20,  controlled: true  },
  { id: "MED-005", name: "Paracetamol 500mg",    category: "Analgesic",     unit: "Tablet",  price: 300,    stock: 5000, reorder: 500, controlled: false },
  { id: "MED-006", name: "Diazepam 5mg",         category: "Benzodiazepine",unit: "Tablet",  price: 4500,   stock: 120,  reorder: 30,  controlled: true  },
];

const DEMO_BATCHES = [
  { id: "BAT-2026-101", medicine: "Amoxicillin 500mg",  qty: 800,   expiry: "2026-10-15", daysLeft: 44, status: "Near Expiry" },
  { id: "BAT-2026-102", medicine: "Paracetamol 500mg",  qty: 5000,  expiry: "2028-06-30", daysLeft: 667, status: "Good" },
  { id: "BAT-2025-088", medicine: "Metformin 500mg",    qty: 200,   expiry: "2026-09-05", daysLeft: 4, status: "Critical" },
  { id: "BAT-2026-114", medicine: "Amlodipine 5mg",     qty: 1200,  expiry: "2027-03-20", daysLeft: 200, status: "Good" },
  { id: "BAT-2025-055", medicine: "Morphine 10mg",      qty: 12,    expiry: "2026-09-01", daysLeft: 0, status: "Expired" },
];

const DEMO_PRESCRIPTIONS = [
  { id: "RX-2026-001", patient: "Grace Mwandani", doctor: "Dr. Kamau",  medicines: "Amlodipine 5mg × 30",         date: "2026-08-28", status: "Dispensed" },
  { id: "RX-2026-002", patient: "Said Hamisi",    doctor: "Dr. Ouma",   medicines: "Metformin 500mg × 60, Glipizide 5mg × 30", date: "2026-08-25", status: "Dispensed" },
  { id: "RX-2026-003", patient: "Amina Juma",     doctor: "Dr. Kamau",  medicines: "Artemether 20mg × 6, Paracetamol 500mg × 12", date: "2026-08-30", status: "Pending" },
  { id: "RX-2026-004", patient: "New Patient",    doctor: "Dr. Masoud", medicines: "Amoxicillin 500mg × 21",      date: "2026-09-01", status: "Pending" },
];

const DEMO_CONTROLLED = [
  { id: "CD-001", medicine: "Morphine 10mg/mL",  batch: "BAT-2025-055", issue: "2026-08-20", patient: "Post-op — Ref: HC/2026/001", qty: 2, balance: 46, prescriber: "Dr. Masoud" },
  { id: "CD-002", medicine: "Diazepam 5mg",       batch: "BAT-2026-114", issue: "2026-08-22", patient: "Grace Mwandani — Ref: RX-2026-001", qty: 30, balance: 90, prescriber: "Dr. Kamau" },
  { id: "CD-003", medicine: "Tramadol 50mg",       batch: "BAT-2026-098", issue: "2026-08-28", patient: "Peter Ochieng — Ref: RX-2026-009",  qty: 14, balance: 146, prescriber: "Dr. Ouma" },
];

const BATCH_STATUS_COLOR: Record<string, string> = {
  Good: "v2-badge-success", "Near Expiry": "v2-badge-warning", Critical: "v2-badge-danger", Expired: "v2-badge-danger",
};
const PRESC_STATUS: Record<string, string> = {
  Dispensed: "v2-badge-success", Pending: "v2-badge-warning", Cancelled: "v2-badge-danger",
};

// ─── Sub-page: Pharmacy Dashboard ────────────────────────────────────────────
const PharmDashboard: React.FC<{ onNav: (tab: PharmTab) => void }> = ({ onNav }) => {
  const nearExpiry  = DEMO_BATCHES.filter((b) => b.daysLeft <= 90 && b.daysLeft > 0).length;
  const expired     = DEMO_BATCHES.filter((b) => b.daysLeft <= 0).length;
  const pending     = DEMO_PRESCRIPTIONS.filter((p) => p.status === "Pending").length;

  return (
    <div className="v2-animate-page-enter">
      {/* Hero */}
      <div className="v2-card v2-mb-4" style={{ background: "linear-gradient(135deg, #064e3b 0%, #065f46 60%, #064e3b 100%)", border: "1px solid #05966933" }}>
        <div className="v2-card-body v2-flex v2-items-center v2-gap-4">
          <div style={{ width: 48, height: 48, borderRadius: "var(--radius-xl)", background: "rgba(16,185,129,.2)", border: "1px solid rgba(16,185,129,.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Pill size={22} style={{ color: "#34d399" }} />
          </div>
          <div style={{ flex: 1 }}>
            <h1 className="v2-text-xl v2-font-black" style={{ color: "#fff", letterSpacing: "-.02em" }}>Clinical Pharmacy & FEFO Dispensing</h1>
            <p className="v2-text-xs" style={{ color: "#6ee7b7", marginTop: ".2rem" }}>FEFO-compliant dispensing · Batch monitoring · Controlled drug register · NHIF claims</p>
          </div>
          <span className="badge v2-badge-success">PHARMACY</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="metrics-grid kpi-grid-4 v2-mb-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}>
        <KpiCard label="Today Dispensed" value={money(6180000)}       desc="FEFO-dispensed"       icon={<DollarSign size={18} />}   accent="#10b981" onClick={() => onNav("Pharmacy POS")} />
        <KpiCard label="Active Patients" value={DEMO_PATIENTS.filter((p) => p.status === "Active").length} desc="In register" icon={<Users size={18} />} accent="#38bdf8" onClick={() => onNav("Patients")} />
        <KpiCard label="Prescriptions"   value={`${pending} Pending`} desc="Awaiting dispensing"  icon={<FileText size={18} />}     accent="#818cf8" onClick={() => onNav("Prescriptions")} />
        <KpiCard label="Near Expiry"     value={`${nearExpiry} Batches`} desc="< 90 days"         icon={<AlertTriangle size={18} />}accent="#fbbf24" onClick={() => onNav("Batch & Expiry")} />
        <KpiCard label="Expired Batches" value={expired}               desc="Require disposal"     icon={<Trash2 size={18} />}       accent="#f87171" onClick={() => onNav("Batch & Expiry")} />
        <KpiCard label="Medicines"       value={DEMO_MEDICINES.length} desc="SKUs registered"      icon={<Package size={18} />}      accent="#4ade80" onClick={() => onNav("Medicines")} />
      </div>

      {/* Prescriptions + Expiry alerts */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1rem" }}>
        <div className="v2-card">
          <div className="v2-card-header">
            <div className="v2-flex v2-items-center v2-gap-2"><FileText size={15} style={{ color: "#818cf8" }} /><div className="v2-card-title">Recent Prescriptions</div></div>
            <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => onNav("Prescriptions")} type="button">View all <ArrowRight size={13} /></button>
          </div>
          <table className="v2-table">
            <thead><tr><th>RX #</th><th>Patient</th><th>Doctor</th><th>Medicines</th><th>Date</th><th>Status</th></tr></thead>
            <tbody>
              {DEMO_PRESCRIPTIONS.map((p) => (
                <tr key={p.id}>
                  <td className="v2-mono v2-text-xs">{p.id}</td>
                  <td className="v2-font-bold">{p.patient}</td>
                  <td className="v2-text-xs v2-text-muted">{p.doctor}</td>
                  <td className="v2-text-xs v2-text-muted" style={{ maxWidth: 200 }}>{p.medicines}</td>
                  <td className="v2-text-xs v2-text-muted">{p.date}</td>
                  <td><span className={`badge ${PRESC_STATUS[p.status] || "v2-badge-muted"}`}>{p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="v2-card">
          <div className="v2-card-header">
            <div className="v2-flex v2-items-center v2-gap-2"><AlertTriangle size={15} style={{ color: "#fbbf24" }} /><div className="v2-card-title">Expiry Alerts (FEFO)</div></div>
            <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => onNav("Batch & Expiry")} type="button">Manage <ArrowRight size={13} /></button>
          </div>
          <div className="v2-card-body" style={{ padding: ".65rem" }}>
            <div className="v2-space-y-4">
              {DEMO_BATCHES.filter((b) => b.daysLeft <= 90).map((b) => (
                <div key={b.id} className="v2-card" style={{ background: "var(--surface-2)", padding: ".65rem .85rem" }}>
                  <div className="v2-flex v2-items-center v2-justify-between v2-mb-1">
                    <span className={`badge ${BATCH_STATUS_COLOR[b.status]}`}>{b.status}</span>
                    <span className="v2-text-xs v2-text-muted">{b.daysLeft}d left</span>
                  </div>
                  <div className="v2-text-xs v2-font-black">{b.medicine}</div>
                  <div className="v2-text-xs v2-text-muted">Batch: {b.id} · Qty: {b.qty} · Exp: {b.expiry}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Sub-page: Patients ───────────────────────────────────────────────────────
const PatientsPage: React.FC = () => {
  const [search, setSearch] = useState("");
  const filtered = DEMO_PATIENTS.filter((p) => !search || `${p.name} ${p.diagnosis}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="v2-animate-page-enter">
      <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
        <h2 className="v2-text-xl v2-font-black">Patient Register</h2>
        <button className="v2-btn v2-btn-primary v2-btn-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.PharmacyPage.187.new-patient", "New Patient", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.PharmacyPage.187.new-patient"><Plus size={13} /> New Patient</button>
      </div>
      <div className="v2-card">
        <div className="v2-card-header">
          <div className="v2-flex v2-items-center v2-gap-2" style={{ flex: 1 }}>
            <Search size={13} style={{ color: "var(--muted)" }} />
            <input className="v2-input" style={{ border: "none", padding: ".3rem .4rem", flex: 1 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search patients…" />
          </div>
        </div>
        <table className="v2-table">
          <thead><tr><th>Patient ID</th><th>Name</th><th>Age</th><th>Phone</th><th>Diagnosis</th><th>Last Visit</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id}>
                <td className="v2-mono v2-text-xs">{p.id}</td>
                <td className="v2-font-bold">{p.name}</td>
                <td>{p.age}</td>
                <td className="v2-text-muted">{p.phone}</td>
                <td><span className="badge v2-badge-muted">{p.diagnosis}</span></td>
                <td className="v2-text-xs v2-text-muted">{p.lastVisit}</td>
                <td><span className={`badge ${p.status === "Active" ? "v2-badge-success" : "v2-badge-muted"}`}>{p.status}</span></td>
                <td>
                  <div className="v2-flex v2-gap-1">
                    <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.PharmacyPage.210.button", "Button", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.PharmacyPage.210.button"><Eye size={13} /></button>
                    <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.PharmacyPage.211.button", "Button", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.PharmacyPage.211.button"><FileText size={13} /></button>
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

// ─── Sub-page: Medicines Master ───────────────────────────────────────────────
const MedicinesPage: React.FC = () => {
  const [search, setSearch] = useState("");
  const filtered = DEMO_MEDICINES.filter((m) => !search || `${m.name} ${m.category}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="v2-animate-page-enter">
      <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
        <h2 className="v2-text-xl v2-font-black">Medicines Master & Price List</h2>
        <div className="v2-flex v2-gap-2">
          <button className="v2-btn v2-btn-secondary v2-btn-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.PharmacyPage.232.price-list", "Price List", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.PharmacyPage.232.price-list"><Tag size={13} /> Price List</button>
          <button className="v2-btn v2-btn-primary v2-btn-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.PharmacyPage.233.add-medicine", "Add Medicine", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.PharmacyPage.233.add-medicine"><Plus size={13} /> Add Medicine</button>
        </div>
      </div>
      <div className="v2-card">
        <div className="v2-card-header">
          <div className="v2-flex v2-items-center v2-gap-2" style={{ flex: 1 }}>
            <Search size={13} style={{ color: "var(--muted)" }} />
            <input className="v2-input" style={{ border: "none", padding: ".3rem .4rem", flex: 1 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search medicines…" />
          </div>
        </div>
        <table className="v2-table">
          <thead><tr><th>Medicine ID</th><th>Name</th><th>Category</th><th>Unit</th><th>Selling Price</th><th>Stock</th><th>Controlled</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id}>
                <td className="v2-mono v2-text-xs">{m.id}</td>
                <td className="v2-font-bold">{m.name}</td>
                <td><span className="badge v2-badge-muted">{m.category}</span></td>
                <td className="v2-text-xs v2-text-muted">{m.unit}</td>
                <td className="v2-font-black">{money(m.price)}</td>
                <td style={{ color: m.stock < m.reorder ? "var(--danger)" : "inherit" }}>{m.stock}</td>
                <td>{m.controlled ? <span className="badge v2-badge-danger">CD</span> : <span className="badge v2-badge-muted">—</span>}</td>
                <td>
                  <div className="v2-flex v2-gap-1">
                    <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.PharmacyPage.257.button", "Button", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.PharmacyPage.257.button"><Edit2 size={13} /></button>
                    <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.PharmacyPage.258.button", "Button", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.PharmacyPage.258.button"><Tag size={13} /></button>
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

// ─── Sub-page: Batch & Expiry ─────────────────────────────────────────────────
const BatchExpiryPage: React.FC<{ onMutation?: (message: string) => void }> = ({ onMutation }) => (
  <div className="v2-animate-page-enter">
    <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
      <h2 className="v2-text-xl v2-font-black">Batch & Expiry Management (FEFO)</h2>
      <div className="v2-flex v2-gap-2">
        <button className="v2-btn v2-btn-danger v2-btn-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.PharmacyPage.276.expired-disposal", "Expired Disposal", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.PharmacyPage.276.expired-disposal">Expired Disposal</button>
        <button className="v2-btn v2-btn-primary v2-btn-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.PharmacyPage.277.add-batch", "Add Batch", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.PharmacyPage.277.add-batch"><Plus size={13} /> Add Batch</button>
      </div>
    </div>
    <div className="metrics-grid kpi-grid-4 v2-mb-4">
      <KpiCard label="Total Batches"    value={DEMO_BATCHES.length}                                           icon={<Package size={18} />}      accent="#38bdf8" />
      <KpiCard label="Good Batches"     value={DEMO_BATCHES.filter((b) => b.status === "Good").length}        icon={<CheckCircle size={18} />}  accent="#4ade80" />
      <KpiCard label="Near Expiry"      value={DEMO_BATCHES.filter((b) => b.status === "Near Expiry").length} icon={<AlertTriangle size={18} />} accent="#fbbf24" />
      <KpiCard label="Expired/Critical" value={DEMO_BATCHES.filter((b) => ["Critical","Expired"].includes(b.status)).length} icon={<Trash2 size={18} />} accent="#f87171" />
    </div>
    <div className="v2-card">
      <div className="v2-card-header"><div className="v2-card-title">Batch Register (FEFO Priority Order)</div></div>
      <table className="v2-table">
        <thead><tr><th>Batch #</th><th>Medicine</th><th>Qty</th><th>Expiry Date</th><th>Days Left</th><th>FEFO Status</th><th>Actions</th></tr></thead>
        <tbody>
          {[...DEMO_BATCHES].sort((a, b) => a.daysLeft - b.daysLeft).map((b, i) => (
            <tr key={b.id}>
              <td className="v2-mono v2-text-xs">{b.id}</td>
              <td className="v2-font-bold">{b.medicine}</td>
              <td>{b.qty}</td>
              <td className="v2-text-xs">{b.expiry}</td>
              <td style={{ color: b.daysLeft <= 14 ? "var(--danger)" : b.daysLeft <= 90 ? "var(--warning)" : "inherit", fontWeight: b.daysLeft <= 90 ? 700 : 400 }}>
                {b.daysLeft}d
              </td>
              <td>
                <span className={`badge ${BATCH_STATUS_COLOR[b.status]}`}>
                  {b.daysLeft <= 0 ? "EXPIRED" : i === 0 ? "FEFO P1" : `${b.status}`}
                </span>
              </td>
              <td>
                <div className="v2-flex v2-gap-1">
                  <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.PharmacyPage.307.button", "Button", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.PharmacyPage.307.button"><Eye size={13} /></button>
                  {b.daysLeft <= 0 && <button className="v2-btn v2-btn-danger v2-btn-sm" type="button" onClick={() => { void persistPharmacyBatchAction("DISPOSE_BATCH", { status: "EXPIRED", source: "PHARMACY_BATCH_REGISTER" }).then((id) => { onMutation?.(`Batch disposal queued (${id})`); return runUiAction("ui.apps.web.src.pages.PharmacyPage.308.dispose", "Dispose", "MUTATION_INTENT"); }); }} data-action-id="ui.apps.web.src.pages.PharmacyPage.308.dispose">Dispose</button>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ─── Sub-page: Prescriptions ──────────────────────────────────────────────────
const PrescriptionsPage: React.FC<{ onMutation?: (message: string) => void }> = ({ onMutation }) => (
  <div className="v2-animate-page-enter">
    <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
      <h2 className="v2-text-xl v2-font-black">Prescription Management</h2>
      <button className="v2-btn v2-btn-primary v2-btn-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.PharmacyPage.324.new-prescription", "New Prescription", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.PharmacyPage.324.new-prescription"><Plus size={13} /> New Prescription</button>
    </div>
    <div className="v2-card">
      <div className="v2-card-header"><div className="v2-card-title">Prescription Register</div></div>
      <table className="v2-table">
        <thead><tr><th>RX #</th><th>Patient</th><th>Prescriber</th><th>Medicines</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {DEMO_PRESCRIPTIONS.map((p) => (
            <tr key={p.id}>
              <td className="v2-mono v2-text-xs">{p.id}</td>
              <td className="v2-font-bold">{p.patient}</td>
              <td className="v2-text-muted">{p.doctor}</td>
              <td className="v2-text-xs" style={{ maxWidth: 240 }}>{p.medicines}</td>
              <td className="v2-text-xs v2-text-muted">{p.date}</td>
              <td><span className={`badge ${PRESC_STATUS[p.status] || "v2-badge-muted"}`}>{p.status}</span></td>
              <td>
                <div className="v2-flex v2-gap-1">
                  <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.PharmacyPage.341.button", "Button", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.PharmacyPage.341.button"><Eye size={13} /></button>
                  {p.status === "Pending" && <button className="v2-btn v2-btn-success v2-btn-sm" type="button" onClick={() => { const firstMedicine = DEMO_MEDICINES[0]; void dispensePharmacyMedicine({ medicineId: firstMedicine?.id || "", quantityRequired: 1 }).then((result) => { onMutation?.(`Dispense recorded (${result.source})`); return runUiAction("ui.apps.web.src.pages.PharmacyPage.342.dispense", "Dispense", "MUTATION_INTENT"); }); }} data-action-id="ui.apps.web.src.pages.PharmacyPage.342.dispense">Dispense</button>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ─── Sub-page: Controlled Drugs ───────────────────────────────────────────────
const ControlledDrugsPage: React.FC = () => (
  <div className="v2-animate-page-enter">
    <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
      <h2 className="v2-text-xl v2-font-black">Controlled Drug Register</h2>
      <div className="v2-flex v2-items-center v2-gap-2">
        <span className="badge v2-badge-danger"><Shield size={12} /> Regulatory Compliance</span>
        <button className="v2-btn v2-btn-primary v2-btn-sm" type="button" onClick={() => { void persistPharmacyBatchAction("RECORD_CONTROLLED_ISSUE", { reference: "CONTROLLED_DRUG_LEDGER", quantity: 1 }).then(() => runUiAction("ui.apps.web.src.pages.PharmacyPage.360.record-issue", "Record Issue", "MUTATION_INTENT")); }} data-action-id="ui.apps.web.src.pages.PharmacyPage.360.record-issue"><Plus size={13} /> Record Issue</button>
      </div>
    </div>
    <div className="metrics-grid kpi-grid-4 v2-mb-4">
      <KpiCard label="CD Medicines"   value={DEMO_MEDICINES.filter((m) => m.controlled).length} icon={<Shield size={18} />}       accent="#f87171" />
      <KpiCard label="Issues Today"   value={DEMO_CONTROLLED.length}                             icon={<Activity size={18} />}     accent="#fbbf24" />
      <KpiCard label="Stock Balance"  value="156 Units"                                          icon={<Package size={18} />}      accent="#38bdf8" />
      <KpiCard label="Compliance"     value="100%"                                               icon={<CheckCircle size={18} />}  accent="#4ade80" />
    </div>
    <div className="v2-card">
      <div className="v2-card-header">
        <div className="v2-card-title">Controlled Drug Dispensing Ledger</div>
        <button className="v2-btn v2-btn-secondary v2-btn-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.PharmacyPage.372.export-msd-report", "Export MSD Report", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.PharmacyPage.372.export-msd-report"><Download size={13} /> Export MSD Report</button>
      </div>
      <table className="v2-table">
        <thead><tr><th>Record ID</th><th>Medicine</th><th>Batch</th><th>Issue Date</th><th>Patient / Reference</th><th>Qty Issued</th><th>Balance</th><th>Prescriber</th></tr></thead>
        <tbody>
          {DEMO_CONTROLLED.map((c) => (
            <tr key={c.id}>
              <td className="v2-mono v2-text-xs">{c.id}</td>
              <td className="v2-font-bold"><span className="badge v2-badge-danger" style={{ fontSize: ".6rem", marginRight: ".35rem" }}>CD</span>{c.medicine}</td>
              <td className="v2-mono v2-text-xs v2-text-muted">{c.batch}</td>
              <td className="v2-text-xs">{c.issue}</td>
              <td className="v2-text-xs v2-text-muted">{c.patient}</td>
              <td className="v2-font-black">{c.qty}</td>
              <td>{c.balance}</td>
              <td className="v2-text-xs">{c.prescriber}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ─── Generic stub sub-page ────────────────────────────────────────────────────
const PharmStub: React.FC<{ title: string }> = ({ title }) => (
  <div className="v2-animate-page-enter">
    <h2 className="v2-text-xl v2-font-black v2-mb-4">{title}</h2>
    <div className="v2-card">
      <div className="v2-empty">
        <div className="v2-empty-icon"><Pill size={22} /></div>
        <p className="v2-empty-title">{title}</p>
        <p className="v2-empty-desc">Full feature panel — coming in Phase 7 expansion.</p>
      </div>
    </div>
  </div>
);

// ─── Pharmacy Module Entry Point ──────────────────────────────────────────────
export const PharmacyPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<PharmTab>("Pharmacy Dashboard");
  const [mutationNotice, setMutationNotice] = useState<string>("");

  const renderTab = () => {
    switch (activeTab) {
      case "Pharmacy Dashboard":  return <PharmDashboard onNav={setActiveTab} />;
      case "Patients":            return <PatientsPage />;
      case "Medicines":           return <MedicinesPage />;
      case "Batch & Expiry":      return <BatchExpiryPage onMutation={setMutationNotice} />;
      case "Prescriptions":       return <PrescriptionsPage onMutation={setMutationNotice} />;
      case "Controlled Drugs":    return <ControlledDrugsPage />;
      default:                    return <PharmStub title={activeTab} />;
    }
  };

  return (
    <div className="v2-animate-page-enter">
      <div style={{ display: "flex", gap: ".3rem", flexWrap: "wrap", marginBottom: "1rem", padding: ".5rem .65rem", background: "var(--surface-1)", borderRadius: "var(--radius-xl)", border: "1px solid var(--surface-border)", overflowX: "auto" }}>
        {PHARM_TABS.map((tab) => (
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
      {mutationNotice && <div className="v2-card v2-mb-3" role="status"><div className="v2-card-body v2-text-sm v2-font-bold">{mutationNotice}</div></div>}
      {renderTab()}
    </div>
  );
};
