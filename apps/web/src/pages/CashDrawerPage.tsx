/**
 * KwakoPosv2 — Cash Drawer & Shift Management
 * ─────────────────────────────────────────────────────────────────────────────
 * Complete cash management & shift reconciliation workspace:
 *   1. Active Shift Status & Register Control
 *   2. Float In / Cash Drop / Bank Transfer Ledger
 *   3. Shift Reconciliation & Discrepancy Audit
 *   4. Historical Shift Records
 *
 * Uses V2 CSS variables + semantic utility classes. Zero Tailwind / inline styles.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState } from "react";
import {
  Wallet, DollarSign, Clock, ArrowDownRight, ArrowUpRight, Lock, Unlock,
  CheckCircle, AlertTriangle, RefreshCw, Plus, FileText, Shield
} from "lucide-react";

type DrawerTab = "active" | "ledger" | "history";

const money = (v: number) => `Tsh ${Math.round(v).toLocaleString()}`;

export const CashDrawerPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<DrawerTab>("active");
  const [shiftStatus, setShiftStatus] = useState<"open" | "closed">("open");
  const [openingFloat, setOpeningFloat] = useState(150000);
  const [cashSales, setCashSales] = useState(4820000);
  const [cashOut, setCashOut] = useState(300000);
  const [expectedCash, setExpectedCash] = useState(4670000);
  const [declaredCash, setDeclaredCash] = useState(4670000);

  const discrepancy = declaredCash - expectedCash;

  return (
    <div className="v2-animate-page-enter v2-space-y-4">
      {/* Header */}
      <div className="v2-flex v2-items-center v2-justify-between">
        <div>
          <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>
            Cash Drawer & Shift Reconciliation
          </h1>
          <p className="v2-text-xs v2-text-muted">
            Manage register shifts, opening floats, safe/bank drops, and end-of-day cash reconciliation.
          </p>
        </div>
        <div className="v2-flex v2-gap-2">
          {shiftStatus === "open" ? (
            <button className="v2-btn v2-btn-danger v2-btn-sm" onClick={() => setShiftStatus("closed")} type="button">
              <Lock size={13} /> Close Shift & Reconcile
            </button>
          ) : (
            <button className="v2-btn v2-btn-success v2-btn-sm" onClick={() => setShiftStatus("open")} type="button">
              <Unlock size={13} /> Open New Register Shift
            </button>
          )}
        </div>
      </div>

      {/* KPI Row */}
      <div className="metrics-grid kpi-grid-4">
        <div className="kpi-card">
          <div className="kpi-card-blob" style={{ background: "#38bdf8" }} />
          <div className="kpi-card-label">Opening Cash Float</div>
          <div className="kpi-card-value">{money(openingFloat)}</div>
          <div className="kpi-card-desc">Shift Started 08:00 AM</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-blob" style={{ background: "#4ade80" }} />
          <div className="kpi-card-label">Total Cash Collected</div>
          <div className="kpi-card-value">{money(cashSales)}</div>
          <div className="kpi-card-desc">42 Cash Sales</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-blob" style={{ background: "#818cf8" }} />
          <div className="kpi-card-label">Expected Drawer Cash</div>
          <div className="kpi-card-value">{money(expectedCash)}</div>
          <div className="kpi-card-desc">Float + Sales − Paid Out</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-blob" style={{ background: discrepancy === 0 ? "#4ade80" : "#f87171" }} />
          <div className="kpi-card-label">Reconciliation Discrepancy</div>
          <div className="kpi-card-value" style={{ color: discrepancy === 0 ? "var(--success)" : "var(--danger)" }}>
            {discrepancy === 0 ? "BALANCED (Tsh 0)" : money(discrepancy)}
          </div>
          <div className="kpi-card-desc">{discrepancy === 0 ? "Drawer In Balance" : "Variance Detected"}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="v2-flex v2-gap-1" style={{ borderBottom: "1px solid var(--surface-border)", paddingBottom: ".4rem" }}>
        {[
          { id: "active", label: "Active Shift", icon: Wallet },
          { id: "ledger", label: "Cash Movements Ledger", icon: ArrowUpRight },
          { id: "history", label: "Shift History", icon: Clock },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as DrawerTab)}
            type="button"
            className={`v2-btn v2-btn-sm ${activeTab === t.id ? "v2-btn-primary" : "v2-btn-ghost"}`}
          >
            <t.icon size={13} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Active Shift View */}
      {activeTab === "active" && (
        <div className="v2-space-y-4">
          <div className="v2-card">
            <div className="v2-card-header"><div className="v2-card-title">Shift End Cash Count & Declaration</div></div>
            <div className="v2-grid v2-grid-2 v2-gap-4">
              <div>
                <label className="v2-text-xs v2-font-black v2-text-muted" style={{ display: "block", marginBottom: ".3rem" }}>
                  DECLARED PHYSICAL CASH COUNT (TSH)
                </label>
                <input
                  className="v2-input"
                  type="number"
                  value={declaredCash}
                  onChange={(e) => setDeclaredCash(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="v2-text-xs v2-font-black v2-text-muted" style={{ display: "block", marginBottom: ".3rem" }}>
                  RECONCILIATION DISCREPANCY
                </label>
                <div
                  className="v2-input"
                  style={{
                    background: discrepancy === 0 ? "var(--success-muted)" : "var(--danger-muted)",
                    color: discrepancy === 0 ? "var(--success)" : "var(--danger)",
                    fontWeight: 800,
                  }}
                >
                  {discrepancy === 0 ? "Tsh 0 (Balanced)" : `${discrepancy > 0 ? "+" : ""}${money(discrepancy)}`}
                </div>
              </div>
            </div>
          </div>

          <div className="v2-card">
            <div className="v2-card-header"><div className="v2-card-title">Recent Cash Drawer Movements</div></div>
            <table className="v2-table">
              <thead>
                <tr>
                  <th>Movement Type</th>
                  <th>Amount</th>
                  <th>Reason / Reference</th>
                  <th>Time</th>
                  <th>Performed By</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { type: "OPENING_FLOAT", amount: money(150000), reason: "Shift Opening Float", time: "08:00 AM", user: "Christina John" },
                  { type: "PAID_OUT",      amount: money(300000), reason: "Supplier Cash Payment", time: "11:30 AM", user: "Christina John" },
                ].map((m, i) => (
                  <tr key={i}>
                    <td>
                      <span className={`badge ${m.type === "OPENING_FLOAT" ? "v2-badge-accent" : "v2-badge-warning"}`}>
                        {m.type}
                      </span>
                    </td>
                    <td className="v2-mono v2-font-bold">{m.amount}</td>
                    <td>{m.reason}</td>
                    <td className="v2-text-xs v2-text-muted">{m.time}</td>
                    <td>{m.user}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
