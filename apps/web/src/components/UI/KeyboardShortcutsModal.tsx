import React, { useEffect } from "react";
import { Keyboard, X, ShoppingCart, Command, Layers, Zap } from "lucide-react";

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  key: string;
  description: string;
}

interface ShortcutSection {
  title: string;
  icon: React.ComponentType<any>;
  items: ShortcutItem[];
}


const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: "POS Terminal & Sales",
    icon: ShoppingCart,
    items: [
      { key: "F1", description: "Start New Sale (Clears Cart)" },
      { key: "F3", description: "Focus Product Search / Scanner" },
      { key: "F4", description: "Hold / Park Active Cart" },
      { key: "F5", description: "Resume Held Cart" },
      { key: "F6", description: "Cycle Quick Discount (0% → 5% → 10% → 15%)" },
      { key: "F7", description: "Proceed to Payment / Checkout" },
      { key: "F8", description: "Reprint Last Completed Receipt" },
      { key: "F9", description: "Quick Cash Tender with Exact Amount" },
    ],
  },
  {
    title: "Global Platform Accelerators",
    icon: Command,
    items: [
      { key: "Ctrl + K", description: "Open Global Command Center / Search" },
      { key: "Ctrl + /", description: "Toggle this Keyboard Shortcuts Cheatsheet" },
      { key: "?", description: "Quick Keyboard Help (when not typing in inputs)" },
      { key: "Esc", description: "Close Active Modal, Drawer, or Dropdown" },
      { key: "Enter", description: "Confirm Active Action or Add Highlighted Item" },
    ],
  },
  {
    title: "Navigation & Workspaces",
    icon: Layers,
    items: [
      { key: "Ctrl + Shift + P", description: "Jump to POS Workspace" },
      { key: "Ctrl + Shift + I", description: "Jump to Inventory Workspace" },
      { key: "Ctrl + Shift + C", description: "Jump to Cash Drawer Workspace" },
      { key: "Ctrl + Shift + R", description: "Jump to Receipts History" },
      { key: "Ctrl + Shift + D", description: "Jump to Dashboard Overview" },
    ],
  },
];

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="v2-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="v2-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 680, width: "95%", maxHeight: "85vh", display: "flex", flexDirection: "column" }}
      >
        <div className="v2-modal-header" style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--surface-border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "8px",
                background: "var(--accent-muted)",
                color: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Keyboard size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
                Keyboard Shortcuts Cheatsheet
              </h2>
              <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "0.2rem 0 0 0" }}>
                High-speed retail shortcuts for cashiers and store managers
              </p>
            </div>
          </div>
          <button
            type="button"
            className="v2-btn-icon"
            onClick={onClose}
            aria-label="Close shortcuts modal"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted)" }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {SHORTCUT_SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <div key={section.title}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.45rem",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: "var(--accent)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    marginBottom: "0.6rem",
                  }}
                >
                  <Icon size={14} />
                  <span>{section.title}</span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: "0.5rem",
                  }}
                >
                  {section.items.map((item) => (
                    <div
                      key={item.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0.55rem 0.75rem",
                        borderRadius: "var(--radius-md)",
                        background: "var(--surface-2)",
                        border: "1px solid var(--surface-border)",
                      }}
                    >
                      <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                        {item.description}
                      </span>
                      <kbd
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          background: "var(--surface-3)",
                          color: "var(--text)",
                          padding: "0.2rem 0.5rem",
                          borderRadius: "4px",
                          border: "1px solid var(--surface-border)",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            padding: "0.85rem 1.5rem",
            borderTop: "1px solid var(--surface-border)",
            background: "var(--surface-2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "0.75rem",
            color: "var(--muted)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Zap size={13} style={{ color: "#eab308" }} />
            <span>Tip: Press <kbd style={{ fontFamily: "var(--font-mono)", padding: "1px 4px", borderRadius: 3, background: "var(--surface-3)", border: "1px solid var(--surface-border)" }}>?</kbd> anytime to bring up this cheatsheet</span>
          </div>
          <button
            type="button"
            className="v2-btn v2-btn-secondary v2-text-xs"
            onClick={onClose}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
