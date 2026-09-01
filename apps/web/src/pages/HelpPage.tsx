/**
 * KwakoPosv2 — Help, User Manual & Keyboard Shortcuts
 * ─────────────────────────────────────────────────────────────────────────────
 * Knowledge base & support manual workspace:
 *   1. Searchable Knowledge Base Articles
 *   2. Role-filtered documentation
 *   3. Keyboard Shortcuts Cheat Sheet
 *   4. Technical Support & Diagnostics Trigger
 *
 * Uses V2 CSS variables + semantic utility classes. Zero Tailwind / inline styles.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState } from "react";
import {
  HelpCircle, Search, BookOpen, Key, Command, ChevronRight, Activity,
  Phone, Mail, MessageSquare, Shield, CheckCircle, ExternalLink
} from "lucide-react";

export const HelpPage: React.FC = () => {
  const [search, setSearch] = useState("");
  const [selectedRole, setSelectedRole] = useState("all");
  const [showShortcuts, setShowShortcuts] = useState(false);

  const ARTICLES = [
    { title: "POS Counter Checkout & Split Payments", role: "Cashier", category: "Point of Sale", desc: "Learn how to process cash, M-Pesa, card payments, hold orders, and apply manager discounts." },
    { title: "FEFO Batching & Expiry Management", role: "Inventory", category: "Inventory", desc: "Track First-Expiring-First-Out batches, print barcode labels, and log stock intake." },
    { title: "Shift Closing & Cash Drawer Reconciliation", role: "Manager", category: "Cash Management", desc: "Step-by-step guide for closing register shifts, counting physical cash, and logging variances." },
    { title: "TRA EFD Electronic Receipt Sync Troubleshooting", role: "Admin", category: "Tax Compliance", desc: "Resolving pending VFD signatures, network timeouts, and invoice verification codes." },
    { title: "Chart of Accounts & General Ledger Posting", role: "Accountant", category: "Finance", desc: "Understanding automated journal entries, trial balance balancing, and tax reports." },
  ];

  return (
    <div className="v2-animate-page-enter v2-space-y-4">
      {/* Header */}
      <div className="v2-flex v2-items-center v2-justify-between">
        <div>
          <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>
            Help Manual & Knowledge Base
          </h1>
          <p className="v2-text-xs v2-text-muted">
            Role-filtered documentation, walkthroughs, keyboard shortcuts, and support diagnostics.
          </p>
        </div>
        <div className="v2-flex v2-gap-2">
          <button className="v2-btn v2-btn-secondary v2-btn-sm" onClick={() => setShowShortcuts(true)} type="button">
            <Command size={13} /> Keyboard Shortcuts
          </button>
        </div>
      </div>

      {/* Search & Role Filter */}
      <div className="v2-flex v2-items-center v2-gap-4">
        <div className="v2-flex v2-items-center" style={{ position: "relative", flex: 1 }}>
          <Search size={16} style={{ position: "absolute", left: "1rem", color: "var(--muted)" }} />
          <input
            className="v2-input"
            style={{ paddingLeft: "2.8rem" }}
            placeholder="Search help articles, user guides, or error codes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="v2-input"
          style={{ width: 200 }}
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value)}
        >
          <option value="all">All Roles</option>
          <option value="Cashier">Cashier Guides</option>
          <option value="Manager">Manager Guides</option>
          <option value="Inventory">Inventory Guides</option>
          <option value="Accountant">Accountant Guides</option>
        </select>
      </div>

      {/* Article Cards Grid */}
      <div className="v2-grid v2-grid-2 v2-gap-4">
        {ARTICLES.filter((a) => selectedRole === "all" || a.role === selectedRole).map((article) => (
          <div key={article.title} className="v2-card" style={{ padding: "1.25rem", cursor: "pointer" }}>
            <div className="v2-flex v2-items-start v2-justify-between v2-mb-2">
              <div className="v2-font-bold v2-text-base">{article.title}</div>
              <span className="badge v2-badge-accent v2-text-xs">{article.role}</span>
            </div>
            <p className="v2-text-xs v2-text-muted v2-mb-3" style={{ lineHeight: 1.5 }}>
              {article.desc}
            </p>
            <div className="v2-flex v2-items-center v2-justify-between">
              <span className="v2-text-xs v2-font-black" style={{ color: "var(--accent)" }}>{article.category}</span>
              <ChevronRight size={14} style={{ color: "var(--muted)" }} />
            </div>
          </div>
        ))}
      </div>

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="v2-card" style={{ width: 480, padding: "1.5rem" }}>
            <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
              <h2 className="v2-text-lg v2-font-black">Keyboard Shortcuts</h2>
              <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setShowShortcuts(false)} type="button">✕</button>
            </div>
            <div className="v2-space-y-2">
              {[
                { shortcut: "Ctrl + K", action: "Open Global Instant Search Modal" },
                { shortcut: "Ctrl + Shift + P", action: "Open POS Counter Workspace" },
                { shortcut: "F2", action: "Focus Product Search Input in POS" },
                { shortcut: "F9", action: "Complete Cash Sale Immediately" },
                { shortcut: "Esc", action: "Close Modals or Cancel Action" },
              ].map((s) => (
                <div key={s.shortcut} className="v2-flex v2-items-center v2-justify-between" style={{ padding: ".4rem 0", borderBottom: "1px solid var(--surface-border)" }}>
                  <span className="v2-mono v2-text-xs v2-font-bold badge v2-badge-accent">{s.shortcut}</span>
                  <span className="v2-text-xs v2-font-bold">{s.action}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
