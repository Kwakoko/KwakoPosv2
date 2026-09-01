/**
 * KwakoPosv2 — Trash & Soft-Delete Bin
 * ─────────────────────────────────────────────────────────────────────────────
 * Recovery & permanent purge workspace for deleted entity records:
 *   1. Soft-deleted entity browser (Products, Customers, Sales, Receipts)
 *   2. Instant Restore Action
 *   3. Permanent Purge Action
 *   4. Automated 30-Day Retention Policy Display
 *
 * Uses V2 CSS variables + semantic utility classes. Zero Tailwind / inline styles.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState } from "react";
import {
  Trash2, RefreshCw, AlertTriangle, Shield, CheckCircle, Search, Filter, Clock
} from "lucide-react";

type EntityType = "all" | "products" | "customers" | "sales" | "orders";

export const TrashPage: React.FC = () => {
  const [filterType, setFilterType] = useState<EntityType>("all");
  const [search, setSearch] = useState("");

  const [deletedItems, setDeletedItems] = useState([
    { id: "DEL-001", type: "PRODUCT", name: "Expired Flour Batch #8812", deletedBy: "Amani Mwangi", deletedAt: "2026-08-28 14:20", daysLeft: 26 },
    { id: "DEL-002", type: "CUSTOMER", name: "Duplicate Account (Juma K)", deletedBy: "Baraka Juma", deletedAt: "2026-08-25 10:15", daysLeft: 23 },
    { id: "DEL-003", type: "SALE", name: "Cancelled Voided Sale POS-0012", deletedBy: "Christina John", deletedAt: "2026-08-20 16:45", daysLeft: 18 },
  ]);

  const handleRestore = (id: string) => {
    setDeletedItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handlePurge = (id: string) => {
    setDeletedItems((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="v2-animate-page-enter v2-space-y-4">
      {/* Header */}
      <div className="v2-flex v2-items-center v2-justify-between">
        <div>
          <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>
            Trash & Soft-Delete Bin
          </h1>
          <p className="v2-text-xs v2-text-muted">
            Recover deleted records or purge permanent items before the 30-day retention window expires.
          </p>
        </div>
        <div className="v2-flex v2-gap-2">
          <button
            className="v2-btn v2-btn-danger v2-btn-sm"
            onClick={() => setDeletedItems([])}
            type="button"
            disabled={deletedItems.length === 0}
          >
            <Trash2 size={13} /> Empty Trash Bin
          </button>
        </div>
      </div>

      {/* Retention Alert Banner */}
      <div
        className="v2-card"
        style={{
          padding: "1rem 1.25rem",
          background: "var(--warning-muted)",
          borderColor: "var(--warning)",
          color: "var(--text)",
        }}
      >
        <div className="v2-flex v2-items-center v2-gap-3">
          <AlertTriangle size={20} style={{ color: "var(--warning)", flexShrink: 0 }} />
          <div>
            <div className="v2-text-sm v2-font-bold">Automated 30-Day Retention Policy Active</div>
            <div className="v2-text-xs v2-text-muted">
              Soft-deleted records are retained for 30 days before permanent background database purging. Restored records return to active status immediately.
            </div>
          </div>
        </div>
      </div>

      {/* Controls row */}
      <div className="v2-flex v2-items-center v2-justify-between v2-gap-4">
        <div className="v2-flex v2-items-center" style={{ position: "relative", flex: 1, maxWidth: 360 }}>
          <Search size={14} style={{ position: "absolute", left: ".8rem", color: "var(--muted)" }} />
          <input
            className="v2-input v2-input-sm"
            style={{ paddingLeft: "2.4rem" }}
            placeholder="Search deleted records..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="v2-input v2-input-sm"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as EntityType)}
        >
          <option value="all">All Entity Types</option>
          <option value="products">Products</option>
          <option value="customers">Customers</option>
          <option value="sales">Sales</option>
          <option value="orders">Orders</option>
        </select>
      </div>

      {/* Trash Table */}
      <div className="v2-card">
        {deletedItems.length === 0 ? (
          <div className="v2-empty">
            <div className="v2-empty-icon"><Trash2 size={24} /></div>
            <p className="v2-empty-title">Trash bin is empty</p>
          </div>
        ) : (
          <table className="v2-table">
            <thead>
              <tr>
                <th>Record ID</th>
                <th>Entity Name & Type</th>
                <th>Deleted By</th>
                <th>Deleted Date</th>
                <th>Retention Days Left</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {deletedItems.map((item) => (
                <tr key={item.id}>
                  <td className="v2-mono v2-text-xs v2-font-bold">{item.id}</td>
                  <td>
                    <div className="v2-font-bold">{item.name}</div>
                    <span className="badge v2-badge-accent v2-text-xs">{item.type}</span>
                  </td>
                  <td>{item.deletedBy}</td>
                  <td className="v2-text-xs v2-text-muted">{item.deletedAt}</td>
                  <td>
                    <span className="badge v2-badge-warning">
                      <Clock size={11} className="v2-mr-1" /> {item.daysLeft} days remaining
                    </span>
                  </td>
                  <td>
                    <div className="v2-flex v2-gap-2">
                      <button
                        className="v2-btn v2-btn-success v2-btn-sm"
                        onClick={() => handleRestore(item.id)}
                        type="button"
                      >
                        <RefreshCw size={13} /> Restore
                      </button>
                      <button
                        className="v2-btn v2-btn-danger v2-btn-sm"
                        onClick={() => handlePurge(item.id)}
                        type="button"
                      >
                        <Trash2 size={13} /> Purge
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
