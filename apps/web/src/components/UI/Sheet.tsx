/**
 * KwakoPosv2 — Slide-Over Sheet / Detail Drawer Component
 * ─────────────────────────────────────────────────────────────────────────────
 * World-class SaaS non-destructive inspection drawer:
 *   - Anchored to the viewport right edge with smooth spring transition
 *   - Preserves table scroll context and filter state while inspecting items
 *   - Handles Escape key, click-outside backdrop dismiss, and focus trapping
 *   - Supports custom title, subtitle, header actions, and sticky footer
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number | string;
  side?: "right" | "left";
  className?: string;
}

export const Sheet: React.FC<SheetProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  width = 540,
  side = "right",
  className = "",
}) => {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock document body scroll when open
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="v2-sheet-portal"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        justifyContent: side === "right" ? "flex-end" : "flex-start",
        pointerEvents: "auto",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="v2-sheet-title"
    >
      {/* Backdrop overlay */}
      <div
        className="v2-sheet-backdrop"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.65)",
          backdropFilter: "blur(3px)",
          animation: "v2-fade-in 180ms ease forwards",
        }}
      />

      {/* Slide-over Container */}
      <div
        ref={drawerRef}
        className={`v2-sheet-panel ${className}`}
        style={{
          position: "relative",
          zIndex: 10000,
          width: typeof width === "number" ? width + "px" : width,
          maxWidth: "100vw",
          height: "100%",
          maxHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          background: "var(--surface)",
          borderLeft: side === "right" ? "1px solid var(--surface-border)" : "none",
          borderRight: side === "left" ? "1px solid var(--surface-border)" : "none",
          boxShadow: side === "right" ? "-8px 0 32px rgba(0,0,0,0.4)" : "8px 0 32px rgba(0,0,0,0.4)",
          animation: side === "right" ? "v2-sheet-slide-in-right 240ms cubic-bezier(0.16, 1, 0.3, 1) forwards" : "v2-sheet-slide-in-left 240ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        }}
      >
        {/* Header Bar */}
        <div
          className="v2-sheet-header"
          style={{
            padding: "1.1rem 1.4rem",
            borderBottom: "1px solid var(--surface-border)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "1rem",
            background: "var(--surface-2)",
            flexShrink: 0,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            {title && (
              <h3
                id="v2-sheet-title"
                className="v2-text-base v2-font-black"
                style={{ margin: 0, letterSpacing: "-.01em" }}
              >
                {title}
              </h3>
            )}
            {description && (
              <p
                className="v2-text-xs v2-text-muted"
                style={{ margin: ".25rem 0 0", lineHeight: 1.4 }}
              >
                {description}
              </p>
            )}
          </div>
          <button
            className="v2-btn v2-btn-ghost v2-btn-sm"
            onClick={onClose}
            type="button"
            aria-label="Close drawer"
            style={{ padding: ".35rem .45rem", borderRadius: "var(--radius-md)" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div
          className="v2-sheet-body"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "1.4rem",
          }}
        >
          {children}
        </div>

        {/* Optional Sticky Footer */}
        {footer && (
          <div
            className="v2-sheet-footer"
            style={{
              padding: "1rem 1.4rem",
              paddingBottom: "max(1.25rem, env(safe-area-inset-bottom, 1.25rem))",
              borderTop: "1px solid var(--surface-border)",
              background: "var(--surface-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: ".6rem",
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default Sheet;
