/**
 * KwakoPosv2 — Desktop Window Taskbar
 * ──────────────────────────────────────
 * Bottom multi-tasking taskbar dock displaying open windows,
 * quick module openers, workspace presets, and window controls.
 */
import React, { useState } from "react";
import { useWindowManager } from "../../context/WindowManagerContext.js";
import {
  LayoutGrid,
  Layers,
  Minus,
  Maximize2,
  X,
  Plus,
  ShoppingCart,
  Package,
  DollarSign,
  Receipt,
  Trash2,
  BarChart,
  HelpCircle,
} from "lucide-react";

export const WindowTaskbar: React.FC<{ onOpenWorkspaceModal?: () => void }> = ({
  onOpenWorkspaceModal,
}) => {
  const {
    windows,
    activeWindowId,
    focusWindow,
    minimizeWindow,
    closeWindow,
    openWindow,
    minimizeAllWindows,
    restoreAllWindows,
    closeAllWindows,
    isWindowModeEnabled,
    toggleWindowMode,
  } = useWindowManager();

  const [showQuickMenu, setShowQuickMenu] = useState(false);

  if (!isWindowModeEnabled && windows.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: "40px",
        backgroundColor: "rgba(15, 23, 42, 0.95)",
        backdropFilter: "blur(12px)",
        borderTop: "1px solid var(--border-color, #334155)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 0.75rem",
        zIndex: 9999,
        userSelect: "none",
      }}
    >
      {/* Left side: Workspace & Quick Launcher */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <button
          className="btn btn-secondary"
          onClick={toggleWindowMode}
          title="Toggle Desktop Window Mode"
          style={{
            padding: "0.25rem 0.6rem",
            fontSize: "0.78rem",
            display: "flex",
            alignItems: "center",
            gap: "0.35rem",
            backgroundColor: isWindowModeEnabled ? "rgba(59, 130, 246, 0.2)" : "transparent",
            color: isWindowModeEnabled ? "var(--color-primary, #3b82f6)" : "var(--text-secondary)",
            border: isWindowModeEnabled ? "1px solid rgba(59, 130, 246, 0.4)" : "1px solid var(--border-color)",
          }}
        >
          <LayoutGrid size={13} />
          <span style={{ fontWeight: 600 }}>OS Windows</span>
        </button>

        {onOpenWorkspaceModal && (
          <button
            className="btn btn-secondary"
            onClick={onOpenWorkspaceModal}
            title="Workspaces & Presets"
            style={{ padding: "0.25rem 0.5rem", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
          >
            <Layers size={13} />
            <span>Workspaces</span>
          </button>
        )}

        {/* Quick Launch dropdown toggle */}
        <div style={{ position: "relative" }}>
          <button
            className="btn btn-secondary"
            onClick={() => setShowQuickMenu((prev) => !prev)}
            title="Open Module in Window"
            style={{ padding: "0.25rem 0.5rem", fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "0.25rem" }}
          >
            <Plus size={13} />
            <span>New Window</span>
          </button>

          {showQuickMenu && (
            <div
              style={{
                position: "absolute",
                bottom: "45px",
                left: 0,
                width: "200px",
                backgroundColor: "var(--surface-color, #0f172a)",
                border: "1px solid var(--border-color, #334155)",
                borderRadius: "6px",
                boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
                padding: "0.4rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.2rem",
                zIndex: 10000,
              }}
            >
              {[
                { moduleId: "POS", title: "Point of Sale", route: "/pos", icon: ShoppingCart },
                { moduleId: "Inventory", title: "Inventory", route: "/inventory", icon: Package },
                { moduleId: "Cash Drawer", title: "Cash Drawer", route: "/cash-drawer", icon: DollarSign },
                { moduleId: "Receipts", title: "Receipts", route: "/receipts", icon: Receipt },
                { moduleId: "Reports", title: "Reports", route: "/reports", icon: BarChart },
                { moduleId: "Trash", title: "Trash Bin", route: "/trash", icon: Trash2 },
              ].map((item) => (
                <button
                  key={item.moduleId}
                  onClick={() => {
                    openWindow({ moduleId: item.moduleId, title: item.title, route: item.route });
                    setShowQuickMenu(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.4rem 0.6rem",
                    background: "transparent",
                    border: "none",
                    borderRadius: "4px",
                    color: "var(--text-primary)",
                    fontSize: "0.82rem",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.06)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <item.icon size={13} color="var(--color-primary, #3b82f6)" />
                  <span>{item.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Middle: Open Windows Pills */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          overflowX: "auto",
          maxWidth: "calc(100vw - 380px)",
          padding: "0 0.5rem",
        }}
      >
        {windows.map((win) => {
          const isActive = activeWindowId === win.id;
          const isMin = win.state === "minimized";

          return (
            <div
              key={win.id}
              onClick={() => {
                if (isMin || !isActive) {
                  focusWindow(win.id);
                } else {
                  minimizeWindow(win.id);
                }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.2rem 0.5rem",
                borderRadius: "4px",
                fontSize: "0.78rem",
                cursor: "pointer",
                backgroundColor: isActive
                  ? "rgba(59, 130, 246, 0.25)"
                  : isMin
                  ? "rgba(255, 255, 255, 0.03)"
                  : "rgba(255, 255, 255, 0.07)",
                border: isActive
                  ? "1px solid rgba(59, 130, 246, 0.5)"
                  : "1px solid var(--border-color, #334155)",
                color: isActive ? "var(--color-primary, #3b82f6)" : "var(--text-primary)",
                maxWidth: "160px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              <div
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  backgroundColor: isActive ? "var(--color-primary, #3b82f6)" : isMin ? "var(--text-secondary)" : "var(--color-success, #10b981)",
                  flexShrink: 0,
                }}
              />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{win.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeWindow(win.id);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "0 0.15rem",
                  cursor: "pointer",
                  color: "var(--text-secondary)",
                  display: "flex",
                  alignItems: "center",
                }}
                title="Close"
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Right side: Global window actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
        <button
          className="btn btn-secondary"
          onClick={minimizeAllWindows}
          title="Minimize All Windows"
          style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem" }}
        >
          <Minus size={12} />
        </button>
        <button
          className="btn btn-secondary"
          onClick={restoreAllWindows}
          title="Restore All Windows"
          style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem" }}
        >
          <Maximize2 size={12} />
        </button>
        <button
          className="btn btn-secondary"
          onClick={closeAllWindows}
          title="Close All Windows"
          style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem", color: "var(--color-danger, #ef4444)" }}
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
};
