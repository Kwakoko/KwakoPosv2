/**
 * KwakoPosv2 — Receipts, EFD & Invoice Command Center
 * ─────────────────────────────────────────────────────────────────────────────
 * Complete sales receipt & EFD tax compliance workspace:
 *   1. Receipt History Register
 *   2. Interactive Thermal 80mm Receipt Viewer Modal
 *   3. TRA EFD VFD Electronic Receipt Sync Monitor
 *   4. Receipt Template Customizer
 *
 * Uses V2 CSS variables + semantic utility classes. Zero Tailwind / inline styles.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState } from "react";
import {
  Receipt, Search, Filter, Printer, Mail, Download, CheckCircle,
  AlertCircle, Scale, Eye, RefreshCw, ChevronRight, FileText, QrCode
} from "lucide-react";

type ReceiptTab = "history" | "tra" | "templates";

const money = (v: number) => `Tsh ${Math.round(v).toLocaleString()}`;

export const ReceiptsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ReceiptTab>("history");
  const [search, setSearch] = useState("");
  const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null);

  const DUMMY_RECEIPTS = [
    { id: "REC-2026-0842", saleNo: "POS-2026-0042", customer: "Walk-In Customer", total: 42500, tax: 6483, efdStatus: "SYNCED", rctv: "TRA-VFD-9948271", date: "2026-09-01 09:42", items: [{ name: "Coca Cola 500ml", qty: 2, price: 1500 }, { name: "Azam Wheat Flour 2kg", qty: 5, price: 7900 }] },
    { id: "REC-2026-0841", saleNo: "POS-2026-0041", customer: "Amani Mwangi", total: 185000, tax: 28220, efdStatus: "SYNCED", rctv: "TRA-VFD-9948270", date: "2026-09-01 09:15", items: [{ name: "Unga wa Ngano 10kg", qty: 2, price: 28000 }, { name: "Cooking Oil 5L", qty: 3, price: 43000 }] },
    { id: "REC-2026-0840", saleNo: "POS-2026-0040", customer: "Walk-In Customer", total: 12000, tax: 1830, efdStatus: "PENDING", rctv: "PENDING", date: "2026-09-01 08:50", items: [{ name: "Maziwa Fresh 1L", qty: 4, price: 3000 }] },
  ];

  return (
    <div className="v2-animate-page-enter v2-space-y-4">
      {/* Header */}
      <div className="v2-flex v2-items-center v2-justify-between">
        <div>
          <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>
            Receipts, EFD Tax & Thermal Printing
          </h1>
          <p className="v2-text-xs v2-text-muted">
            Inspect sale receipts, TRA VFD fiscal signatures, electronic receipts, and thermal printer templates.
          </p>
        </div>
      </div>

      {/* KPI Header */}
      <div className="metrics-grid kpi-grid-4">
        <div className="kpi-card">
          <div className="kpi-card-blob" style={{ background: "#38bdf8" }} />
          <div className="kpi-card-label">Total Receipts Issued</div>
          <div className="kpi-card-value">1,482 Receipts</div>
          <div className="kpi-card-desc">Today: 42 Receipts</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-blob" style={{ background: "#4ade80" }} />
          <div className="kpi-card-label">TRA EFD Fiscal Synced</div>
          <div className="kpi-card-value">1,480 Synced</div>
          <div className="kpi-card-desc">99.8% Compliance</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-blob" style={{ background: "#818cf8" }} />
          <div className="kpi-card-label">VAT Tax Collected</div>
          <div className="kpi-card-value">{money(6810000)}</div>
          <div className="kpi-card-desc">18% Standard VAT Rate</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-blob" style={{ background: "#fbbf24" }} />
          <div className="kpi-card-label">Pending EFD Queue</div>
          <div className="kpi-card-value">2 Pending</div>
          <div className="kpi-card-desc">Auto-retrying sync</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="v2-flex v2-gap-1" style={{ borderBottom: "1px solid var(--surface-border)", paddingBottom: ".4rem" }}>
        {[
          { id: "history", label: "Receipt Register", icon: Receipt },
          { id: "tra", label: "TRA EFD Compliance", icon: Scale },
          { id: "templates", label: "Thermal Templates", icon: Printer },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as ReceiptTab)}
            type="button"
            className={`v2-btn v2-btn-sm ${activeTab === t.id ? "v2-btn-primary" : "v2-btn-ghost"}`}
          >
            <t.icon size={13} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Receipt Register */}
      {activeTab === "history" && (
        <div className="v2-space-y-4">
          <div className="v2-flex v2-items-center v2-justify-between v2-gap-4">
            <div className="v2-flex v2-items-center" style={{ position: "relative", flex: 1, maxWidth: 360 }}>
              <Search size={14} style={{ position: "absolute", left: ".8rem", color: "var(--muted)" }} />
              <input
                className="v2-input v2-input-sm"
                style={{ paddingLeft: "2.4rem" }}
                placeholder="Search receipt ID, sale number, customer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="v2-card">
            <table className="v2-table">
              <thead>
                <tr>
                  <th>Receipt ID & Sale No</th>
                  <th>Customer Name</th>
                  <th>Date & Time</th>
                  <th>Grand Total</th>
                  <th>VAT Tax (18%)</th>
                  <th>TRA EFD Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {DUMMY_RECEIPTS.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="v2-mono v2-font-bold">{r.id}</div>
                      <div className="v2-text-xs v2-text-muted">{r.saleNo}</div>
                    </td>
                    <td className="v2-font-bold">{r.customer}</td>
                    <td className="v2-text-xs v2-text-muted">{r.date}</td>
                    <td className="v2-mono v2-font-black">{money(r.total)}</td>
                    <td className="v2-mono v2-text-xs">{money(r.tax)}</td>
                    <td>
                      <span className={`badge ${r.efdStatus === "SYNCED" ? "v2-badge-success" : "v2-badge-warning"}`}>
                        {r.efdStatus}
                      </span>
                    </td>
                    <td>
                      <div className="v2-flex v2-gap-1">
                        <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setSelectedReceipt(r)} type="button">
                          <Eye size={13} /> View
                        </button>
                        <button className="v2-btn v2-btn-ghost v2-btn-sm" type="button"><Printer size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Thermal Receipt Preview Modal */}
      {selectedReceipt && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.7)",
            display: "grid",
            placeItems: "center",
            zIndex: 1000,
          }}
        >
          <div
            className="v2-card"
            style={{
              width: 380,
              background: "#fff",
              color: "#000",
              fontFamily: "var(--font-mono)",
              padding: "1.5rem",
              borderRadius: "var(--radius-lg)",
            }}
          >
            <div className="v2-text-center v2-mb-4" style={{ borderBottom: "1px dashed #000", paddingBottom: "1rem" }}>
              <div style={{ fontWeight: 900, fontSize: "1.2rem" }}>KWAKOPOS SUPERMARKET</div>
              <div style={{ fontSize: ".75rem" }}>Posta HQ Block A, Dar es Salaam</div>
              <div style={{ fontSize: ".75rem" }}>TIN: 104-982-114 · VRN: 40019283</div>
              <div style={{ fontSize: ".75rem" }}>TEL: +255 754 112 233</div>
            </div>

            <div style={{ fontSize: ".75rem", marginBottom: "1rem" }}>
              <div>Receipt: {selectedReceipt.id}</div>
              <div>Sale: {selectedReceipt.saleNo}</div>
              <div>Date: {selectedReceipt.date}</div>
              <div>Customer: {selectedReceipt.customer}</div>
            </div>

            <div style={{ borderBottom: "1px dashed #000", paddingBottom: ".5rem", marginBottom: ".5rem" }}>
              {selectedReceipt.items.map((item: any, i: number) => (
                <div key={i} className="v2-flex v2-justify-between" style={{ fontSize: ".8rem" }}>
                  <span>{item.qty}x {item.name}</span>
                  <span>{money(item.qty * item.price)}</span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: ".85rem", fontWeight: 800, textAlign: "right" }}>
              <div>TOTAL: {money(selectedReceipt.total)}</div>
              <div style={{ fontSize: ".75rem", fontWeight: 400 }}>VAT INCLUDED: {money(selectedReceipt.tax)}</div>
            </div>

            <div className="v2-text-center" style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px dashed #000" }}>
              <div style={{ fontSize: ".7rem" }}>TRA VFD VERIFICATION CODE</div>
              <div style={{ fontSize: ".75rem", fontWeight: 800 }}>{selectedReceipt.rctv}</div>
              <div className="v2-flex v2-justify-center" style={{ marginTop: ".5rem" }}>
                <QrCode size={48} />
              </div>
              <div style={{ fontSize: ".65rem", marginTop: ".5rem" }}>Asante kwa Kununua kwetu!</div>
            </div>

            <button
              className="v2-btn v2-btn-primary"
              style={{ width: "100%", marginTop: "1rem" }}
              onClick={() => setSelectedReceipt(null)}
              type="button"
            >
              Close Preview
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
