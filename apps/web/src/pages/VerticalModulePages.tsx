/**
 * KwakoPosv2 — Vertical Module Pages
 * Poultry & Livestock, Fleet Management, Workforce & Payroll, Telecom
 * CSS: V2 design system classes only.
 */
import React, { useState } from "react";
import { runUiAction } from "../services/uiActionRegistry.js";
import { persistFleetFueling } from "../services/verticalMutationService.js";
import {
  Egg, Truck, Users, Radio, Activity, AlertTriangle, DollarSign,
  Plus, Search, Download, Edit2, Eye, CheckCircle, Clock, BarChart2,
  ArrowRight, ChevronRight, FileText, Tag, Hash, MapPin, Fuel,
  Calendar, Check, X, RefreshCw, Building, Phone, Layers, Car,
  Wifi, Package, ShieldAlert, Sparkles, Bell, Navigation,
} from "lucide-react";

const money = (v: number) =>
  v >= 1_000_000 ? `Tsh ${(v / 1_000_000).toFixed(1)}M`
  : v >= 1_000 ? `Tsh ${(v / 1_000).toFixed(0)}K`
  : `Tsh ${Math.round(v).toLocaleString()}`;

const KpiCard: React.FC<{
  label: string; value: string | number; desc?: string;
  icon: React.ReactNode; accent: string; onClick?: () => void;
}> = ({ label, value, desc, icon, accent, onClick }) => (
  <div className="kpi-card" onClick={onClick} style={onClick ? { cursor: "pointer" } : undefined} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}>
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

const Empty: React.FC<{ icon?: React.ReactNode; message: string; action?: React.ReactNode }> = ({ icon, message, action }) => (
  <div className="v2-empty">
    <div className="v2-empty-icon">{icon || <FileText size={22} />}</div>
    <p className="v2-empty-title">{message}</p>
    {action && <div style={{ marginTop: ".75rem" }}>{action}</div>}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// POULTRY & LIVESTOCK MODULE
// ═══════════════════════════════════════════════════════════════════════════════

const POULTRY_TABS = ["Flock Dashboard", "Flock Batches", "Daily Production", "Feed Management", "Mortality & Health", "Sales & Revenue", "Poultry Reports"] as const;
type PoultryTab = typeof POULTRY_TABS[number];

const DEMO_FLOCKS = [
  { id: "FL-001", name: "Layer Flock A", breed: "ISA Brown",   count: 5000, age: 28, fcr: 1.52, dailyEggs: 4600, mortality: 2, status: "Active" },
  { id: "FL-002", name: "Broiler Batch 8", breed: "Cobb 500", count: 3000, age: 35, fcr: 1.62, dailyEggs: 0,    mortality: 5, status: "Active" },
  { id: "FL-003", name: "Layer Flock B", breed: "Lohmann",    count: 4000, age: 14, fcr: 1.48, dailyEggs: 3200, mortality: 1, status: "Active" },
  { id: "FL-004", name: "Broiler Batch 7", breed: "Ross 308", count: 500,  age: 42, fcr: 1.58, dailyEggs: 0,    mortality: 12, status: "Sold Out" },
];

const DEMO_FEED_STOCK = [
  { id: "FEED-001", name: "Layer Mash",       qty: "12,400 kg", costPerKg: 1800, reorder: 5000, status: "Good" },
  { id: "FEED-002", name: "Broiler Starter",  qty: "3,200 kg",  costPerKg: 2100, reorder: 2000, status: "Good" },
  { id: "FEED-003", name: "Broiler Finisher", qty: "800 kg",    costPerKg: 1950, reorder: 2000, status: "Low" },
  { id: "FEED-004", name: "Pre-mix Vitamins", qty: "45 kg",     costPerKg: 18000, reorder: 20,  status: "Low" },
];

const PoultryDashboard: React.FC<{ onNav: (t: PoultryTab) => void }> = ({ onNav }) => (
  <div className="v2-animate-page-enter">
    <div className="v2-card v2-mb-4" style={{ background: "linear-gradient(135deg, #1c1917 0%, #292524 60%, #1c1917 100%)", border: "1px solid #d97706aa" }}>
      <div className="v2-card-body v2-flex v2-items-center v2-gap-4">
        <div style={{ width: 48, height: 48, borderRadius: "var(--radius-xl)", background: "rgba(217,119,6,.2)", border: "1px solid rgba(217,119,6,.35)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Egg size={22} style={{ color: "#fbbf24" }} />
        </div>
        <div style={{ flex: 1 }}>
          <h1 className="v2-text-xl v2-font-black" style={{ color: "#fff", letterSpacing: "-.02em" }}>Poultry & Livestock Production</h1>
          <p className="v2-text-xs" style={{ color: "#fcd34d", marginTop: ".2rem" }}>Flock management · Daily production · FCR tracking · Feed & mortality analytics</p>
        </div>
        <span className="badge v2-badge-warning">POULTRY</span>
      </div>
    </div>
    <div className="metrics-grid kpi-grid-4 v2-mb-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}>
      <KpiCard label="Active Flocks"   value={DEMO_FLOCKS.filter((f) => f.status === "Active").length}                  desc={`${DEMO_FLOCKS.reduce((s, f) => s + f.count, 0).toLocaleString()} birds`} icon={<Egg size={18} />}           accent="#fbbf24" onClick={() => onNav("Flock Batches")} />
      <KpiCard label="Daily Eggs"      value={`${DEMO_FLOCKS.reduce((s, f) => s + f.dailyEggs, 0).toLocaleString()}`}   desc="Total production"           icon={<Activity size={18} />}    accent="#38bdf8" onClick={() => onNav("Daily Production")} />
      <KpiCard label="Avg FCR"         value="1.55"                                                                       desc="Feed Conversion Ratio"       icon={<BarChart2 size={18} />}   accent="#4ade80" />
      <KpiCard label="Feed Stock Alert" value={`${DEMO_FEED_STOCK.filter((f) => f.status === "Low").length} Low`}        desc="Needs replenishment"         icon={<AlertTriangle size={18} />} accent="#f87171" onClick={() => onNav("Feed Management")} />
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1rem" }}>
      <div className="v2-card">
        <div className="v2-card-header">
          <div className="v2-card-title">Active Flock Batches</div>
          <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => onNav("Flock Batches")} type="button">View all <ArrowRight size={13} /></button>
        </div>
        <table className="v2-table">
          <thead><tr><th>Flock</th><th>Breed</th><th>Birds</th><th>Age (wk)</th><th>Daily Eggs</th><th>FCR</th><th>Status</th></tr></thead>
          <tbody>
            {DEMO_FLOCKS.map((f) => (
              <tr key={f.id}>
                <td className="v2-font-bold">{f.name}</td>
                <td className="v2-text-xs v2-text-muted">{f.breed}</td>
                <td>{f.count.toLocaleString()}</td>
                <td>{f.age}wk</td>
                <td className="v2-font-black" style={{ color: f.dailyEggs > 0 ? "var(--success)" : "var(--muted)" }}>{f.dailyEggs > 0 ? f.dailyEggs.toLocaleString() : "—"}</td>
                <td>{f.fcr}</td>
                <td><span className={`badge ${f.status === "Active" ? "v2-badge-success" : "v2-badge-muted"}`}>{f.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="v2-card">
        <div className="v2-card-header"><div className="v2-card-title">Feed Stock Status</div></div>
        <div className="v2-card-body" style={{ padding: ".65rem" }}>
          <div className="v2-space-y-4">
            {DEMO_FEED_STOCK.map((f) => (
              <div key={f.id} className="v2-card" style={{ background: "var(--surface-2)", padding: ".65rem .85rem" }}>
                <div className="v2-flex v2-items-center v2-justify-between v2-mb-1">
                  <span className="v2-text-xs v2-font-black">{f.name}</span>
                  <span className={`badge ${f.status === "Low" ? "v2-badge-danger" : "v2-badge-success"}`}>{f.status}</span>
                </div>
                <div className="v2-text-xs v2-text-muted">{f.qty} · {money(f.costPerKg)}/kg</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

const PoultryStub: React.FC<{ title: string }> = ({ title }) => (
  <div className="v2-animate-page-enter">
    <h2 className="v2-text-xl v2-font-black v2-mb-4">{title}</h2>
    <div className="v2-card"><Empty icon={<Egg size={22} />} message={title} action={<span className="badge v2-badge-warning">Poultry Module — Phase 7</span>} /></div>
  </div>
);

export const PoultryLivestockPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<PoultryTab>("Flock Dashboard");
  return (
    <div className="v2-animate-page-enter">
      <div style={{ display: "flex", gap: ".3rem", flexWrap: "wrap", marginBottom: "1rem", padding: ".5rem .65rem", background: "var(--surface-1)", borderRadius: "var(--radius-xl)", border: "1px solid var(--surface-border)" }}>
        {POULTRY_TABS.map((tab) => (
          <button key={tab} aria-label={tab} className={`sector-pill${activeTab === tab ? " active" : ""}`} onClick={() => setActiveTab(tab)} type="button">{tab}</button>
        ))}
      </div>
      {activeTab === "Flock Dashboard" ? <PoultryDashboard onNav={setActiveTab} /> : <PoultryStub title={activeTab} />}
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// FLEET MANAGEMENT MODULE
// ═══════════════════════════════════════════════════════════════════════════════

const FLEET_TABS = ["Fleet Dashboard", "Vehicles", "Trip Dispatch", "Fuel Records", "Maintenance", "Drivers", "Fleet Reports"] as const;
type FleetTab = typeof FLEET_TABS[number];

const DEMO_VEHICLES = [
  { id: "VEH-001", plate: "T 123 ABC", model: "Toyota Land Cruiser",  type: "4WD",      driver: "Ali Hassan",   status: "In Transit", km: 124500, fuel: 80 },
  { id: "VEH-002", plate: "T 456 DEF", model: "Mitsubishi Canter 5T", type: "Truck",    driver: "Peter Kamau",  status: "Available",  km: 87200,  fuel: 60 },
  { id: "VEH-003", plate: "T 789 GHI", model: "Isuzu FVR 26T",        type: "HGV",      driver: "Unassigned",   status: "Workshop",   km: 215600, fuel: 25 },
  { id: "VEH-004", plate: "T 321 JKL", model: "Toyota Hiace",          type: "Van",      driver: "Grace Ouma",   status: "Available",  km: 62100,  fuel: 90 },
  { id: "VEH-005", plate: "T 654 MNO", model: "Bajaj RE Auto",         type: "3-Wheeler",driver: "Said Juma",    status: "In Transit", km: 32400,  fuel: 55 },
];

const DEMO_TRIPS = [
  { id: "TRIP-2026-001", vehicle: "T 123 ABC", driver: "Ali Hassan",  from: "Dar es Salaam", to: "Mwanza",         km: 1060, status: "In Progress", departure: "2026-08-31 06:00" },
  { id: "TRIP-2026-002", vehicle: "T 456 DEF", driver: "Peter Kamau", from: "Dar es Salaam", to: "Arusha",         km: 648,  status: "Completed",   departure: "2026-08-30 07:30" },
  { id: "TRIP-2026-003", vehicle: "T 654 MNO", driver: "Said Juma",   from: "Kariakoo",      to: "Kimara",         km: 18,   status: "In Progress", departure: "2026-09-01 08:15" },
];

const DEMO_FUEL = [
  { id: "FUEL-001", vehicle: "T 123 ABC", date: "2026-08-29", liters: 120, pricePerL: 2850, total: 342000, station: "Total Ubungo", odometer: 124150 },
  { id: "FUEL-002", vehicle: "T 456 DEF", date: "2026-08-28", liters: 80,  pricePerL: 2850, total: 228000, station: "Shell Kariakoo", odometer: 87050 },
  { id: "FUEL-003", vehicle: "T 321 JKL", date: "2026-09-01", liters: 45,  pricePerL: 2860, total: 128700, station: "Oryx Posta",  odometer: 62080 },
];

const VEH_STATUS: Record<string, string> = {
  "In Transit": "v2-badge-accent", Available: "v2-badge-success", Workshop: "v2-badge-danger", Idle: "v2-badge-muted",
};

const FleetDashboard: React.FC<{ onNav: (t: FleetTab) => void }> = ({ onNav }) => (
  <div className="v2-animate-page-enter">
    <div className="v2-card v2-mb-4" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0f172a 100%)", border: "1px solid #38bdf833" }}>
      <div className="v2-card-body v2-flex v2-items-center v2-gap-4">
        <div style={{ width: 48, height: 48, borderRadius: "var(--radius-xl)", background: "rgba(56,189,248,.15)", border: "1px solid rgba(56,189,248,.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Truck size={22} style={{ color: "#38bdf8" }} />
        </div>
        <div style={{ flex: 1 }}>
          <h1 className="v2-text-xl v2-font-black" style={{ color: "#fff", letterSpacing: "-.02em" }}>Vehicle Fleet & Logistics Command</h1>
          <p className="v2-text-xs" style={{ color: "#7dd3fc", marginTop: ".2rem" }}>Real-time vehicle tracking · Trip dispatch · Fuel management · Maintenance scheduling</p>
        </div>
        <span className="badge v2-badge-info">FLEET</span>
      </div>
    </div>
    <div className="metrics-grid kpi-grid-4 v2-mb-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}>
      <KpiCard label="Active Vehicles"   value={`${DEMO_VEHICLES.filter((v) => v.status !== "Workshop").length}/${DEMO_VEHICLES.length}`} desc="Fleet availability" icon={<Car size={18} />}         accent="#38bdf8" onClick={() => onNav("Vehicles")} />
      <KpiCard label="Active Trips"      value={DEMO_TRIPS.filter((t) => t.status === "In Progress").length}                               desc="In transit"           icon={<Navigation size={18} />}  accent="#4ade80" onClick={() => onNav("Trip Dispatch")} />
      <KpiCard label="Fuel This Month"   value="1,420 L"                                                                                   desc={money(DEMO_FUEL.reduce((s, f) => s + f.total, 0))} icon={<Fuel size={18} />} accent="#fbbf24" onClick={() => onNav("Fuel Records")} />
      <KpiCard label="Maintenance Due"   value="2 Vehicles"                                                                                desc="Scheduled service"    icon={<AlertTriangle size={18} />} accent="#f87171" onClick={() => onNav("Maintenance")} />
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1rem" }}>
      <div className="v2-card">
        <div className="v2-card-header">
          <div className="v2-card-title">Fleet Status — Live</div>
          <button className="v2-btn v2-btn-primary v2-btn-sm" onClick={() => onNav("Trip Dispatch")} type="button"><Plus size={13} /> Dispatch Trip</button>
        </div>
        <table className="v2-table">
          <thead><tr><th>Plate</th><th>Vehicle</th><th>Type</th><th>Driver</th><th>Status</th><th>Fuel%</th></tr></thead>
          <tbody>
            {DEMO_VEHICLES.map((v) => (
              <tr key={v.id}>
                <td className="v2-mono v2-font-black v2-text-xs">{v.plate}</td>
                <td className="v2-text-sm v2-font-bold">{v.model}</td>
                <td><span className="badge v2-badge-muted">{v.type}</span></td>
                <td className="v2-text-muted">{v.driver}</td>
                <td><span className={`badge ${VEH_STATUS[v.status] || "v2-badge-muted"}`}>{v.status}</span></td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
                    <div style={{ flex: 1, height: 6, background: "var(--surface-border)", borderRadius: 99 }}>
                      <div style={{ width: `${v.fuel}%`, height: "100%", borderRadius: 99, background: v.fuel < 30 ? "var(--danger)" : v.fuel < 60 ? "var(--warning)" : "var(--success)" }} />
                    </div>
                    <span className="v2-text-xs v2-text-muted">{v.fuel}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="v2-card">
        <div className="v2-card-header"><div className="v2-card-title">Active Trips</div></div>
        <div className="v2-card-body" style={{ padding: ".65rem" }}>
          <div className="v2-space-y-4">
            {DEMO_TRIPS.map((t) => (
              <div key={t.id} className="v2-card" style={{ background: "var(--surface-2)", padding: ".65rem .85rem" }}>
                <div className="v2-flex v2-items-center v2-justify-between v2-mb-1">
                  <span className="v2-mono v2-text-xs v2-font-black">{t.vehicle}</span>
                  <span className={`badge ${t.status === "In Progress" ? "v2-badge-accent" : "v2-badge-success"}`}>{t.status}</span>
                </div>
                <div className="v2-text-xs v2-font-black">{t.from} → {t.to}</div>
                <div className="v2-text-xs v2-text-muted">{t.driver} · {t.km} km · {t.departure}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

const FleetStub: React.FC<{ title: string }> = ({ title }) => (
  <div className="v2-animate-page-enter">
    <h2 className="v2-text-xl v2-font-black v2-mb-4">{title}</h2>
    {title === "Fuel Records" ? (
      <div className="v2-card">
        <div className="v2-card-header"><div className="v2-card-title">Fuel Ledger</div>
          <button className="v2-btn v2-btn-primary v2-btn-sm" type="button" onClick={() => { void persistFleetFueling({ source: "FUEL_LEDGER", liters: 1, pricePerL: 0 }).then(() => runUiAction("ui.apps.web.src.pages.VerticalModulePages.258.record-fueling", "Record Fueling", "MUTATION_INTENT")); }} data-action-id="ui.apps.web.src.pages.VerticalModulePages.258.record-fueling"><Plus size={13} /> Record Fueling</button>
        </div>
        <table className="v2-table">
          <thead><tr><th>Record</th><th>Vehicle</th><th>Date</th><th>Liters</th><th>Price/L</th><th>Total</th><th>Station</th><th>Odometer</th></tr></thead>
          <tbody>
            {DEMO_FUEL.map((f) => (
              <tr key={f.id}>
                <td className="v2-mono v2-text-xs">{f.id}</td>
                <td className="v2-mono v2-text-xs v2-font-black">{f.vehicle}</td>
                <td className="v2-text-xs v2-text-muted">{f.date}</td>
                <td className="v2-font-black">{f.liters} L</td>
                <td className="v2-text-muted">{money(f.pricePerL)}</td>
                <td className="v2-font-black">{money(f.total)}</td>
                <td className="v2-text-xs v2-text-muted">{f.station}</td>
                <td className="v2-text-xs v2-text-muted">{f.odometer.toLocaleString()} km</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <div className="v2-card"><Empty icon={<Truck size={22} />} message={title} action={<span className="badge v2-badge-info">Fleet Module — Phase 7</span>} /></div>
    )}
  </div>
);

export const FleetPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<FleetTab>("Fleet Dashboard");
  return (
    <div className="v2-animate-page-enter">
      <div style={{ display: "flex", gap: ".3rem", flexWrap: "wrap", marginBottom: "1rem", padding: ".5rem .65rem", background: "var(--surface-1)", borderRadius: "var(--radius-xl)", border: "1px solid var(--surface-border)" }}>
        {FLEET_TABS.map((tab) => (
          <button key={tab} aria-label={tab} className={`sector-pill${activeTab === tab ? " active" : ""}`} onClick={() => setActiveTab(tab)} type="button">{tab}</button>
        ))}
      </div>
      {activeTab === "Fleet Dashboard" ? <FleetDashboard onNav={setActiveTab} /> : <FleetStub title={activeTab} />}
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// WORKFORCE & PAYROLL MODULE
// ═══════════════════════════════════════════════════════════════════════════════

const WORKFORCE_TABS = ["HR Dashboard", "Employees", "Attendance & Leave", "Payroll Run", "Shifts & Scheduling", "Performance", "HR Reports"] as const;
type WorkforceTab = typeof WORKFORCE_TABS[number];

const DEMO_EMPLOYEES = [
  { id: "EMP-001", name: "Alice Njeri",     dept: "Sales",         position: "Senior Cashier",    salary: 1200000, status: "Active",   clockedIn: true },
  { id: "EMP-002", name: "Bernard Ochieng", dept: "Warehouse",     position: "Stock Controller",  salary: 980000,  status: "Active",   clockedIn: true },
  { id: "EMP-003", name: "Catherine Juma",  dept: "Management",    position: "Branch Manager",    salary: 2800000, status: "Active",   clockedIn: true },
  { id: "EMP-004", name: "David Mwangi",    dept: "Delivery",      position: "Delivery Rider",    salary: 750000,  status: "Active",   clockedIn: false },
  { id: "EMP-005", name: "Esther Kamau",    dept: "Finance",       position: "Accountant",        salary: 1800000, status: "Active",   clockedIn: true },
  { id: "EMP-006", name: "Francis Hassan",  dept: "IT",            position: "Systems Admin",     salary: 2200000, status: "On Leave", clockedIn: false },
];

const HRDashboard: React.FC<{ onNav: (t: WorkforceTab) => void }> = ({ onNav }) => {
  const totalPayroll = DEMO_EMPLOYEES.filter((e) => e.status === "Active").reduce((s, e) => s + e.salary, 0);
  const clockedIn    = DEMO_EMPLOYEES.filter((e) => e.clockedIn).length;
  return (
    <div className="v2-animate-page-enter">
      <div className="v2-card v2-mb-4" style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #1a1a2e 100%)", border: "1px solid #818cf833" }}>
        <div className="v2-card-body v2-flex v2-items-center v2-gap-4">
          <div style={{ width: 48, height: 48, borderRadius: "var(--radius-xl)", background: "rgba(129,140,248,.15)", border: "1px solid rgba(129,140,248,.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Users size={22} style={{ color: "#a5b4fc" }} />
          </div>
          <div style={{ flex: 1 }}>
            <h1 className="v2-text-xl v2-font-black" style={{ color: "#fff", letterSpacing: "-.02em" }}>Workforce Management & Payroll</h1>
            <p className="v2-text-xs" style={{ color: "#c7d2fe", marginTop: ".2rem" }}>Employee directory · Clock in/out · Payroll runs · Leave management · Performance reviews</p>
          </div>
          <span className="badge v2-badge-accent">WORKFORCE</span>
        </div>
      </div>
      <div className="metrics-grid kpi-grid-4 v2-mb-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}>
        <KpiCard label="Total Staff"     value={DEMO_EMPLOYEES.length}                              desc="All departments"       icon={<Users size={18} />}        accent="#818cf8" onClick={() => onNav("Employees")} />
        <KpiCard label="Clocked In"      value={`${clockedIn}/${DEMO_EMPLOYEES.length}`}            desc="Present today"         icon={<CheckCircle size={18} />}  accent="#4ade80" onClick={() => onNav("Attendance & Leave")} />
        <KpiCard label="Monthly Payroll" value={money(totalPayroll)}                                desc="Total gross"           icon={<DollarSign size={18} />}   accent="#38bdf8" onClick={() => onNav("Payroll Run")} />
        <KpiCard label="On Leave"        value={DEMO_EMPLOYEES.filter((e) => e.status === "On Leave").length} desc="Approved leave" icon={<Calendar size={18} />} accent="#fbbf24" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1rem" }}>
        <div className="v2-card">
          <div className="v2-card-header">
            <div className="v2-card-title">Employee Directory</div>
            <div className="v2-flex v2-gap-2">
              <button className="v2-btn v2-btn-primary v2-btn-sm" onClick={() => onNav("Employees")} type="button">Full Directory <ArrowRight size={13} /></button>
            </div>
          </div>
          <table className="v2-table">
            <thead><tr><th>ID</th><th>Name</th><th>Department</th><th>Position</th><th>Salary</th><th>Status</th></tr></thead>
            <tbody>
              {DEMO_EMPLOYEES.map((e) => (
                <tr key={e.id}>
                  <td className="v2-mono v2-text-xs">{e.id}</td>
                  <td className="v2-font-bold">{e.name}</td>
                  <td><span className="badge v2-badge-muted">{e.dept}</span></td>
                  <td className="v2-text-xs v2-text-muted">{e.position}</td>
                  <td className="v2-font-black">{money(e.salary)}</td>
                  <td><span className={`badge ${e.status === "Active" ? "v2-badge-success" : "v2-badge-warning"}`}>{e.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="v2-card">
          <div className="v2-card-header"><div className="v2-card-title">Today's Attendance</div></div>
          <div className="v2-card-body" style={{ padding: ".65rem" }}>
            <div className="v2-space-y-4">
              {DEMO_EMPLOYEES.map((e) => (
                <div key={e.id} className="v2-flex v2-items-center v2-gap-2">
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: e.clockedIn ? "var(--accent-muted)" : "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span className="v2-text-xs v2-font-black" style={{ color: e.clockedIn ? "var(--accent)" : "var(--muted)" }}>
                      {e.name.split(" ").map((n) => n[0]).join("")}
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="v2-text-xs v2-font-black v2-truncate">{e.name}</div>
                    <div className="v2-text-xs v2-text-muted">{e.dept}</div>
                  </div>
                  <span className={`badge ${e.clockedIn ? "v2-badge-success" : e.status === "On Leave" ? "v2-badge-warning" : "v2-badge-muted"}`} style={{ fontSize: ".6rem" }}>
                    {e.clockedIn ? "IN" : e.status === "On Leave" ? "LEAVE" : "OUT"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const WorkforceStub: React.FC<{ title: string }> = ({ title }) => (
  <div className="v2-animate-page-enter">
    <h2 className="v2-text-xl v2-font-black v2-mb-4">{title}</h2>
    <div className="v2-card"><Empty icon={<Users size={22} />} message={title} action={<span className="badge v2-badge-accent">Workforce Module — Phase 7</span>} /></div>
  </div>
);

export const WorkforcePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<WorkforceTab>("HR Dashboard");
  return (
    <div className="v2-animate-page-enter">
      <div style={{ display: "flex", gap: ".3rem", flexWrap: "wrap", marginBottom: "1rem", padding: ".5rem .65rem", background: "var(--surface-1)", borderRadius: "var(--radius-xl)", border: "1px solid var(--surface-border)" }}>
        {WORKFORCE_TABS.map((tab) => (
          <button key={tab} aria-label={tab} className={`sector-pill${activeTab === tab ? " active" : ""}`} onClick={() => setActiveTab(tab)} type="button">{tab}</button>
        ))}
      </div>
      {activeTab === "HR Dashboard" ? <HRDashboard onNav={setActiveTab} /> : <WorkforceStub title={activeTab} />}
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════════════════════
// TELECOM & AIRTIME MODULE
// ═══════════════════════════════════════════════════════════════════════════════

const TELECOM_TABS = ["Telecom Dashboard", "Airtime Sales", "Data Bundles", "Agent Network", "Float Management", "M-Pesa / Tigo", "Telecom Reports"] as const;
type TelecomTab = typeof TELECOM_TABS[number];

const DEMO_AGENTS = [
  { id: "AGT-001", name: "Ali Khamis",     zone: "Kariakoo",    balance: 2400000, sales: 1820000, status: "Active", lastActive: "2026-09-01 07:45" },
  { id: "AGT-002", name: "Rehema Said",    zone: "Mwenge",      balance: 1800000, sales: 2100000, status: "Active", lastActive: "2026-09-01 08:12" },
  { id: "AGT-003", name: "Baraka Juma",    zone: "Ubungo",      balance: 3200000, sales: 940000,  status: "Active", lastActive: "2026-09-01 06:58" },
  { id: "AGT-004", name: "Fatuma Rashidi", zone: "Temeke",      balance: 500000,  sales: 420000,  status: "Low Float", lastActive: "2026-09-01 07:20" },
  { id: "AGT-005", name: "Omar Hassan",    zone: "Kinondoni",   balance: 0,       sales: 0,       status: "Suspended",  lastActive: "2026-08-28 14:00" },
];

const DEMO_TELECOM_SALES = [
  { id: "TS-001", type: "Airtime", network: "Vodacom", amount: 10000, agent: "Ali Khamis",     time: "08:14" },
  { id: "TS-002", type: "Bundle",  network: "Airtel",  amount: 5000,  agent: "Rehema Said",    time: "08:11" },
  { id: "TS-003", type: "Airtime", network: "Tigo",    amount: 20000, agent: "Baraka Juma",    time: "07:58" },
  { id: "TS-004", type: "M-Pesa",  network: "Vodacom", amount: 150000,agent: "Ali Khamis",     time: "07:45" },
];

const AGT_STATUS: Record<string, string> = {
  Active: "v2-badge-success", "Low Float": "v2-badge-warning", Suspended: "v2-badge-danger",
};

const TelecomDashboard: React.FC<{ onNav: (t: TelecomTab) => void }> = ({ onNav }) => {
  const totalSold      = 14200000;
  const totalFloat     = DEMO_AGENTS.reduce((s, a) => s + a.balance, 0);
  const lowFloatAgents = DEMO_AGENTS.filter((a) => a.status === "Low Float").length;

  return (
    <div className="v2-animate-page-enter">
      <div className="v2-card v2-mb-4" style={{ background: "linear-gradient(135deg, #0d1117 0%, #161b22 60%, #0d1117 100%)", border: "1px solid #22d3ee33" }}>
        <div className="v2-card-body v2-flex v2-items-center v2-gap-4">
          <div style={{ width: 48, height: 48, borderRadius: "var(--radius-xl)", background: "rgba(34,211,238,.12)", border: "1px solid rgba(34,211,238,.28)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Radio size={22} style={{ color: "#22d3ee" }} />
          </div>
          <div style={{ flex: 1 }}>
            <h1 className="v2-text-xl v2-font-black" style={{ color: "#fff", letterSpacing: "-.02em" }}>Telecom & Airtime Distribution</h1>
            <p className="v2-text-xs" style={{ color: "#67e8f9", marginTop: ".2rem" }}>Agent network management · Float top-up · Airtime + bundle sales · M-Pesa / Tigo / Airtel</p>
          </div>
          <span className="badge v2-badge-info">TELECOM</span>
        </div>
      </div>
      <div className="metrics-grid kpi-grid-4 v2-mb-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}>
        <KpiCard label="Active Agents"   value={DEMO_AGENTS.filter((a) => a.status === "Active").length}    desc="In network"           icon={<Users size={18} />}      accent="#22d3ee" onClick={() => onNav("Agent Network")} />
        <KpiCard label="Airtime Sold"    value={money(totalSold)}                                            desc="Today's revenue"       icon={<Radio size={18} />}      accent="#4ade80" onClick={() => onNav("Airtime Sales")} />
        <KpiCard label="Total Float"     value={money(totalFloat)}                                           desc="Agent balances"        icon={<DollarSign size={18} />} accent="#818cf8" onClick={() => onNav("Float Management")} />
        <KpiCard label="Low Float Agents" value={`${lowFloatAgents} Agents`}                                desc="Need top-up"           icon={<AlertTriangle size={18} />} accent="#fbbf24" onClick={() => onNav("Float Management")} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div className="v2-card">
          <div className="v2-card-header">
            <div className="v2-card-title">Agent Network Status</div>
            <button className="v2-btn v2-btn-primary v2-btn-sm" onClick={() => onNav("Agent Network")} type="button">Manage <ArrowRight size={13} /></button>
          </div>
          <table className="v2-table">
            <thead><tr><th>Agent</th><th>Zone</th><th>Float Balance</th><th>Today Sales</th><th>Status</th></tr></thead>
            <tbody>
              {DEMO_AGENTS.map((a) => (
                <tr key={a.id}>
                  <td className="v2-font-bold">{a.name}</td>
                  <td><span className="badge v2-badge-muted">{a.zone}</span></td>
                  <td className="v2-font-black" style={{ color: a.balance < 500000 ? "var(--danger)" : "inherit" }}>{money(a.balance)}</td>
                  <td className="v2-text-muted">{money(a.sales)}</td>
                  <td><span className={`badge ${AGT_STATUS[a.status] || "v2-badge-muted"}`}>{a.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="v2-card">
          <div className="v2-card-header">
            <div className="v2-card-title">Recent Transactions</div>
            <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => onNav("Airtime Sales")} type="button">View all <ArrowRight size={13} /></button>
          </div>
          <div className="v2-card-body" style={{ padding: ".65rem" }}>
            <div className="v2-space-y-4">
              {DEMO_TELECOM_SALES.map((s) => (
                <div key={s.id} className="v2-card" style={{ background: "var(--surface-2)", padding: ".65rem .85rem" }}>
                  <div className="v2-flex v2-items-center v2-justify-between v2-mb-1">
                    <div className="v2-flex v2-items-center v2-gap-2">
                      <span className={`badge ${s.type === "M-Pesa" ? "v2-badge-success" : s.type === "Bundle" ? "v2-badge-accent" : "v2-badge-info"}`} style={{ fontSize: ".6rem" }}>{s.type}</span>
                      <span className="v2-text-xs v2-text-muted">{s.network}</span>
                    </div>
                    <span className="v2-text-xs v2-font-black">{money(s.amount)}</span>
                  </div>
                  <div className="v2-text-xs v2-text-muted">{s.agent} · {s.time}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const TelecomStub: React.FC<{ title: string }> = ({ title }) => (
  <div className="v2-animate-page-enter">
    <h2 className="v2-text-xl v2-font-black v2-mb-4">{title}</h2>
    <div className="v2-card"><Empty icon={<Radio size={22} />} message={title} action={<span className="badge v2-badge-info">Telecom Module — Phase 7</span>} /></div>
  </div>
);

export const TelecomPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TelecomTab>("Telecom Dashboard");
  return (
    <div className="v2-animate-page-enter">
      <div style={{ display: "flex", gap: ".3rem", flexWrap: "wrap", marginBottom: "1rem", padding: ".5rem .65rem", background: "var(--surface-1)", borderRadius: "var(--radius-xl)", border: "1px solid var(--surface-border)" }}>
        {TELECOM_TABS.map((tab) => (
          <button key={tab} aria-label={tab} className={`sector-pill${activeTab === tab ? " active" : ""}`} onClick={() => setActiveTab(tab)} type="button">{tab}</button>
        ))}
      </div>
      {activeTab === "Telecom Dashboard" ? <TelecomDashboard onNav={setActiveTab} /> : <TelecomStub title={activeTab} />}
    </div>
  );
};
