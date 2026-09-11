/**
 * KwakoPosv2 — Global Command Palette & Search Platform (Ctrl+K)
 * ─────────────────────────────────────────────────────────────────────────────
 * Instant offline-capable command palette querying local IndexedDB products &
 * customers, with action shortcut execution and keyboard navigation (Arrow Up/Down/Enter).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Search,
  X,
  Package,
  Users,
  Zap,
  ArrowRight,
  Sun,
  Moon,
  ShoppingCart,
  Receipt,
  BarChart2,
  Settings,
  Shield,
  CornerDownLeft,
} from "lucide-react";
import { useSync, useTheme, useModule } from "../../context/KwakoPosContexts.js";
import { EmptyState } from "./EmptyState.js";

export interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
}

interface PaletteCommand {
  id: string;
  name: string;
  category: "Actions" | "Navigation" | "Module";
  icon?: React.ReactNode;
  action: () => void;
  keywords?: string[];
}

interface PaletteProduct {
  id: string;
  name: string;
  sku?: string;
  category?: string;
  price?: number;
}

interface PaletteCustomer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  onNavigate,
}) => {
  const { db } = useSync();
  const { theme, toggleTheme } = useTheme();
  const { setActiveModule, availableModules } = useModule();

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Scroll active item into view on keyboard navigation
  useEffect(() => {
    if (!scrollContainerRef.current) return;
    const activeEl = scrollContainerRef.current.querySelector<HTMLElement>('[data-selected="true"]');
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  // System actions & navigation commands registry
  const systemCommands = useMemo<PaletteCommand[]>(() => {
    const list: PaletteCommand[] = [
      {
        id: "cmd-pos",
        name: "Launch POS Checkout Terminal",
        category: "Navigation",
        icon: <ShoppingCart size={15} className="v2-text-accent" />,
        action: () => {
          onNavigate("/pos");
          onClose();
        },
        keywords: ["pos", "checkout", "sale", "cashier", "terminal"],
      },
      {
        id: "cmd-inventory",
        name: "Manage Products & Inventory",
        category: "Navigation",
        icon: <Package size={15} className="v2-text-accent" />,
        action: () => {
          onNavigate("/inventory");
          onClose();
        },
        keywords: ["inventory", "stock", "catalog", "products"],
      },
      {
        id: "cmd-receipts",
        name: "Inspect Sales Receipts & Audit Trail",
        category: "Navigation",
        icon: <Receipt size={15} className="v2-text-accent" />,
        action: () => {
          onNavigate("/receipts");
          onClose();
        },
        keywords: ["receipts", "orders", "history", "audit"],
      },
      {
        id: "cmd-reports",
        name: "Open Financial BI & Turn Analytics",
        category: "Navigation",
        icon: <BarChart2 size={15} className="v2-text-accent" />,
        action: () => {
          onNavigate("/reports");
          onClose();
        },
        keywords: ["reports", "bi", "analytics", "turnover", "profit"],
      },
      {
        id: "cmd-customers",
        name: "View Customer Accounts & Credit Ledger",
        category: "Navigation",
        icon: <Users size={15} className="v2-text-accent" />,
        action: () => {
          onNavigate("/customers");
          onClose();
        },
        keywords: ["customers", "crm", "members", "debtors"],
      },
      {
        id: "cmd-theme",
        name: `Toggle Color Theme (Currently ${theme === "dark" ? "Dark" : "Light"})`,
        category: "Actions",
        icon: theme === "dark" ? <Sun size={15} className="v2-text-warning" /> : <Moon size={15} className="v2-text-info" />,
        action: () => {
          toggleTheme();
          onClose();
        },
        keywords: ["theme", "dark", "light", "mode", "color"],
      },
      {
        id: "cmd-settings",
        name: "Open System & Counter Settings",
        category: "Navigation",
        icon: <Settings size={15} className="v2-text-muted" />,
        action: () => {
          onNavigate("/settings");
          onClose();
        },
        keywords: ["settings", "preferences", "danger", "purge", "config"],
      },
      {
        id: "cmd-super-admin",
        name: "Open Super Admin Control Tower",
        category: "Navigation",
        icon: <Shield size={15} className="v2-text-danger" />,
        action: () => {
          onNavigate("/super-admin");
          onClose();
        },
        keywords: ["super", "admin", "platform", "tower", "sql", "cleanliness"],
      },
      {
        id: "cmd-persistence",
        name: "Run In-Browser Persistence & Sync Lab",
        category: "Actions",
        icon: <Zap size={15} className="v2-text-accent" />,
        action: () => {
          onNavigate("/persistence-test");
          onClose();
        },
        keywords: ["persistence", "test", "sync", "lab", "diagnostics"],
      },
    ];

    // Add registered industry module switchers
    if (availableModules && availableModules.length > 0) {
      availableModules.forEach((m) => {
        const modKey = String(m);
        list.push({
          id: `mod-${modKey}`,
          name: `Switch to ${modKey} Industry Module`,
          category: "Module",
          icon: <Zap size={15} className="v2-text-accent" />,
          action: () => {
            setActiveModule(modKey as any);
            onNavigate("/dashboard");
            onClose();
          },
          keywords: ["module", modKey.toLowerCase()],
        });
      });
    }

    return list;
  }, [theme, toggleTheme, onNavigate, onClose, setActiveModule, availableModules]);

  // Query local IndexedDB products and customers
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return {
        commands: systemCommands.slice(0, 6),
        products: [] as PaletteProduct[],
        customers: [] as PaletteCustomer[],
      };
    }

    // Filter commands
    const cmds = systemCommands.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        Boolean(c.keywords?.some((k) => k.includes(q))),
    );

    // Filter local products
    const prods: PaletteProduct[] = [];
    if (db?.products) {
      for (const p of db.products.values()) {
        if (
          p.name?.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q) ||
          (p as any).category?.toLowerCase().includes(q)
        ) {
          prods.push({
            id: p.id,
            name: p.name,
            sku: p.sku,
            category: (p as any).category,
            price: (p as any).retailPrice || (p as any).price,
          });
          if (prods.length >= 5) break;
        }
      }
    }

    // Filter local customers
    const custs: PaletteCustomer[] = [];
    if (db?.customers) {
      for (const c of db.customers.values()) {
        if (
          c.name?.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q)
        ) {
          custs.push({
            id: c.id,
            name: c.name,
            phone: c.phone,
            email: c.email,
          });
          if (custs.length >= 5) break;
        }
      }
    }

    return { commands: cmds, products: prods, customers: custs };
  }, [query, systemCommands, db]);

  // Flatten searchable list for keyboard up/down navigation
  const flatItems = useMemo(() => {
    const items: Array<{
      type: "command" | "product" | "customer";
      id: string;
      execute: () => void;
    }> = [];

    searchResults.commands.forEach((c) => {
      items.push({ type: "command", id: c.id, execute: c.action });
    });
    searchResults.products.forEach((p) => {
      items.push({
        type: "product",
        id: p.id,
        execute: () => {
          onNavigate("/inventory");
          onClose();
        },
      });
    });
    searchResults.customers.forEach((c) => {
      items.push({
        type: "customer",
        id: c.id,
        execute: () => {
          onNavigate("/customers");
          onClose();
        },
      });
    });

    return items;
  }, [searchResults, onNavigate, onClose]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (flatItems.length === 0 ? 0 : (prev + 1) % flatItems.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          flatItems.length === 0 ? 0 : (prev - 1 + flatItems.length) % flatItems.length,
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (flatItems[selectedIndex]) {
          flatItems[selectedIndex].execute();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [flatItems, selectedIndex, onClose],
  );

  if (!isOpen) return null;

  let currentIndexTracker = 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Global Command Palette"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "4rem 1rem 1rem 1rem",
        background: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(6px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "620px",
          background: "var(--surface, #1e293b)",
          borderRadius: "var(--radius-xl, 1.2rem)",
          border: "1px solid var(--surface-border, #334155)",
          boxShadow: "var(--shadow-xl, 0 20px 50px rgba(0,0,0,0.6))",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          maxHeight: "80vh",
        }}
      >
        {/* Search Input Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "0.85rem 1.2rem",
            borderBottom: "1px solid var(--surface-border, #334155)",
            background: "var(--surface-2, #243047)",
          }}
        >
          <Search size={18} style={{ color: "var(--accent, #38bdf8)", flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search products, customers, settings, shortcuts... (↑↓ to navigate)"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text, #f8fafc)",
              fontSize: "0.92rem",
              fontFamily: "inherit",
            }}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close command palette"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--muted, #94a3b8)",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Results Scroll Area */}
        <div
          ref={scrollContainerRef}
          style={{ overflowY: "auto", padding: "0.85rem", display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          {/* Section: Actions & Navigation */}
          {searchResults.commands.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: "0.68rem",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--muted, #94a3b8)",
                  marginBottom: "0.4rem",
                  paddingLeft: "0.5rem",
                }}
              >
                Actions &amp; Navigation
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {searchResults.commands.map((cmd) => {
                  const itemIndex = currentIndexTracker++;
                  const isSelected = itemIndex === selectedIndex;
                  return (
                    <button
                      key={cmd.id}
                      type="button"
                      data-selected={isSelected ? "true" : "false"}
                      onClick={cmd.action}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0.6rem 0.75rem",
                        borderRadius: "var(--radius-md, 0.55rem)",
                        border: isSelected
                          ? "1px solid rgba(56, 189, 248, 0.4)"
                          : "1px solid transparent",
                        background: isSelected
                          ? "var(--accent-muted, rgba(56,189,248,0.12))"
                          : "transparent",
                        color: "var(--text, #f8fafc)",
                        cursor: "pointer",
                        textAlign: "left",
                        width: "100%",
                        transition: "all var(--transition-fast, 120ms ease)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                        {cmd.icon}
                        <span style={{ fontSize: "0.83rem", fontWeight: isSelected ? 800 : 600 }}>
                          {cmd.name}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: "0.68rem",
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: "4px",
                          background: "var(--surface-2, #243047)",
                          color: "var(--muted, #94a3b8)",
                          border: "1px solid var(--surface-border, #334155)",
                        }}
                      >
                        {cmd.category}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section: Products */}
          {searchResults.products.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: "0.68rem",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--muted, #94a3b8)",
                  marginBottom: "0.4rem",
                  paddingLeft: "0.5rem",
                }}
              >
                Products &amp; Inventory
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {searchResults.products.map((p) => {
                  const itemIndex = currentIndexTracker++;
                  const isSelected = itemIndex === selectedIndex;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      data-selected={isSelected ? "true" : "false"}
                      onClick={() => {
                        onNavigate("/inventory");
                        onClose();
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0.6rem 0.75rem",
                        borderRadius: "var(--radius-md, 0.55rem)",
                        border: isSelected
                          ? "1px solid rgba(56, 189, 248, 0.4)"
                          : "1px solid transparent",
                        background: isSelected
                          ? "var(--accent-muted, rgba(56,189,248,0.12))"
                          : "transparent",
                        color: "var(--text, #f8fafc)",
                        cursor: "pointer",
                        textAlign: "left",
                        width: "100%",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                        <Package size={15} style={{ color: "var(--accent, #38bdf8)" }} />
                        <div>
                          <div style={{ fontSize: "0.83rem", fontWeight: 700 }}>{p.name}</div>
                          {p.sku && (
                            <div style={{ fontSize: "0.72rem", color: "var(--muted, #94a3b8)" }}>
                              SKU: {p.sku}
                            </div>
                          )}
                        </div>
                      </div>
                      {p.price !== undefined && (
                        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--success, #4ade80)" }}>
                          Tsh {Number(p.price).toLocaleString()}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section: Customers */}
          {searchResults.customers.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: "0.68rem",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--muted, #94a3b8)",
                  marginBottom: "0.4rem",
                  paddingLeft: "0.5rem",
                }}
              >
                Customers &amp; Contacts
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {searchResults.customers.map((c) => {
                  const itemIndex = currentIndexTracker++;
                  const isSelected = itemIndex === selectedIndex;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      data-selected={isSelected ? "true" : "false"}
                      onClick={() => {
                        onNavigate("/customers");
                        onClose();
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0.6rem 0.75rem",
                        borderRadius: "var(--radius-md, 0.55rem)",
                        border: isSelected
                          ? "1px solid rgba(56, 189, 248, 0.4)"
                          : "1px solid transparent",
                        background: isSelected
                          ? "var(--accent-muted, rgba(56,189,248,0.12))"
                          : "transparent",
                        color: "var(--text, #f8fafc)",
                        cursor: "pointer",
                        textAlign: "left",
                        width: "100%",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                        <Users size={15} style={{ color: "var(--info, #818cf8)" }} />
                        <div>
                          <div style={{ fontSize: "0.83rem", fontWeight: 700 }}>{c.name}</div>
                          {c.phone && (
                            <div style={{ fontSize: "0.72rem", color: "var(--muted, #94a3b8)" }}>
                              {c.phone}
                            </div>
                          )}
                        </div>
                      </div>
                      <ArrowRight size={13} style={{ color: "var(--muted, #94a3b8)" }} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Zero results */}
          {query.trim() &&
            searchResults.commands.length === 0 &&
            searchResults.products.length === 0 &&
            searchResults.customers.length === 0 && (
              <EmptyState
                variant="no-results"
                title={`No matches found for "${query}"`}
                description="Try a different product name, customer phone, or shortcut keyword."
                style={{ padding: "2rem 1rem" }}
              />
            )}
        </div>

        {/* Footer info strip */}
        <div
          style={{
            padding: "0.6rem 1.2rem",
            background: "var(--surface-2, #243047)",
            borderTop: "1px solid var(--surface-border, #334155)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "0.72rem",
            color: "var(--muted, #94a3b8)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <span>
              <kbd style={{ background: "var(--surface-3, #2d3a50)", padding: "1px 4px", borderRadius: "3px" }}>
                ↑↓
              </kbd>{" "}
              Navigate
            </span>
            <span>
              <kbd style={{ background: "var(--surface-3, #2d3a50)", padding: "1px 4px", borderRadius: "3px" }}>
                <CornerDownLeft size={10} style={{ display: "inline" }} />
              </kbd>{" "}
              Select
            </span>
            <span>
              <kbd style={{ background: "var(--surface-3, #2d3a50)", padding: "1px 4px", borderRadius: "3px" }}>
                Esc
              </kbd>{" "}
              Close
            </span>
          </div>
          <span style={{ fontWeight: 600 }}>KwakoPos v2.0.0</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPaletteModal;
