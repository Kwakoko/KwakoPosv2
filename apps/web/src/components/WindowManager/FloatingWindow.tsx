/**
 * KwakoPosv2 — Floating Window Component
 * ─────────────────────────────────────────
 * Draggable, resizable desktop window with snapping and controls.
 */
import React, { useRef, useCallback, useEffect } from "react";
import type { KwakokoWindow } from "../../types/windowManager.js";
import { useWindowManager } from "../../context/WindowManagerContext.js";
import { WindowContentRenderer } from "./WindowContentRenderer.js";
import {
  Minus,
  Square,
  Copy,
  X,
  Pin,
  PinOff,
  ArrowLeftToLine,
  ArrowRightToLine,
  Maximize2,
  Box,
} from "lucide-react";

export const FloatingWindow: React.FC<{ window: KwakokoWindow }> = ({ window: win }) => {
  const {
    activeWindowId,
    focusWindow,
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    restoreWindow,
    pinWindow,
    unpinWindow,
    moveWindow,
    resizeWindow,
    dockWindow,
  } = useWindowManager();

  const isFocused = activeWindowId === win.id;
  const isMaximized = win.state === "maximized";
  const isMinimized = win.state === "minimized";

  const dragRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  // ── Drag Handlers ──
  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if (isMaximized || e.button !== 0) return;
    focusWindow(win.id);

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: win.position.x,
      posY: win.position.y,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = moveEvent.clientX - dragRef.current.startX;
      const dy = moveEvent.clientY - dragRef.current.startY;
      const nextX = Math.max(0, dragRef.current.posX + dx);
      const nextY = Math.max(45, dragRef.current.posY + dy);
      moveWindow(win.id, { x: nextX, y: nextY });
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // ── Resize Handlers ──
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isMaximized || e.button !== 0) return;
    focusWindow(win.id);

    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: win.size.width,
      startH: win.size.height,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizeRef.current) return;
      const dw = moveEvent.clientX - resizeRef.current.startX;
      const dh = moveEvent.clientY - resizeRef.current.startY;
      const minW = win.minSize?.width ?? 450;
      const minH = win.minSize?.height ?? 350;
      const nextW = Math.max(minW, resizeRef.current.startW + dw);
      const nextH = Math.max(minH, resizeRef.current.startH + dh);
      resizeWindow(win.id, { width: nextW, height: nextH });
    };

    const handleMouseUp = () => {
      resizeRef.current = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  if (isMinimized) return null;

  const style: React.CSSProperties = isMaximized
    ? {
        position: "fixed",
        top: "45px",
        left: 0,
        width: "100vw",
        height: "calc(100vh - 85px)",
        zIndex: win.zIndex,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--surface-color, #0f172a)",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
      }
    : {
        position: "fixed",
        top: `${win.position.y}px`,
        left: `${win.position.x}px`,
        width: `${win.size.width}px`,
        height: `${win.size.height}px`,
        zIndex: win.zIndex,
        display: "flex",
        flexDirection: "column",
        borderRadius: "8px",
        border: isFocused ? "1px solid var(--color-primary, #3b82f6)" : "1px solid var(--border-color, #334155)",
        backgroundColor: "var(--surface-color, #0f172a)",
        boxShadow: isFocused
          ? "0 20px 35px -5px rgba(0, 0, 0, 0.6), 0 0 15px rgba(59, 130, 246, 0.3)"
          : "0 15px 30px -5px rgba(0, 0, 0, 0.5)",
        overflow: "hidden",
      };

  return (
    <div
      style={style}
      onMouseDown={() => {
        if (!isFocused) focusWindow(win.id);
      }}
    >
      {/* Window Header */}
      <div
        onMouseDown={handleHeaderMouseDown}
        onDoubleClick={() => (isMaximized ? restoreWindow(win.id) : maximizeWindow(win.id))}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.5rem 0.75rem",
          backgroundColor: isFocused ? "rgba(30, 41, 59, 0.95)" : "rgba(15, 23, 42, 0.9)",
          borderBottom: "1px solid var(--border-color, #334155)",
          cursor: isMaximized ? "default" : "move",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
          <Box size={14} color="var(--color-primary, #3b82f6)" />
          <span
            style={{
              fontSize: "0.85rem",
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {win.title}
          </span>
          {win.pinned && <Pin size={11} color="var(--color-warning, #f59e0b)" />}
        </div>

        <div
          style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Snap Left */}
          <button
            className="btn btn-secondary"
            title="Dock Left (50%)"
            onClick={() => dockWindow(win.id, "docked-left")}
            style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem" }}
          >
            <ArrowLeftToLine size={12} />
          </button>

          {/* Snap Right */}
          <button
            className="btn btn-secondary"
            title="Dock Right (50%)"
            onClick={() => dockWindow(win.id, "docked-right")}
            style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem" }}
          >
            <ArrowRightToLine size={12} />
          </button>

          {/* Pin */}
          <button
            className="btn btn-secondary"
            title={win.pinned ? "Unpin from Top" : "Pin Always on Top"}
            onClick={() => (win.pinned ? unpinWindow(win.id) : pinWindow(win.id))}
            style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem" }}
          >
            {win.pinned ? <PinOff size={12} /> : <Pin size={12} />}
          </button>

          {/* Minimize */}
          <button
            className="btn btn-secondary"
            title="Minimize to Taskbar"
            onClick={() => minimizeWindow(win.id)}
            style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem" }}
          >
            <Minus size={12} />
          </button>

          {/* Maximize / Restore */}
          <button
            className="btn btn-secondary"
            title={isMaximized ? "Restore Window" : "Maximize Window"}
            onClick={() => (isMaximized ? restoreWindow(win.id) : maximizeWindow(win.id))}
            style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem" }}
          >
            {isMaximized ? <Copy size={12} /> : <Square size={12} />}
          </button>

          {/* Close */}
          <button
            className="btn btn-secondary"
            title="Close Window"
            onClick={() => closeWindow(win.id)}
            style={{ padding: "0.2rem 0.4rem", fontSize: "0.75rem", color: "var(--color-danger, #ef4444)" }}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Window Body */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <WindowContentRenderer window={win} />
      </div>

      {/* Resize Handle */}
      {!isMaximized && (
        <div
          onMouseDown={handleResizeMouseDown}
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            width: "14px",
            height: "14px",
            cursor: "nwse-resize",
            zIndex: 10,
            backgroundImage:
              "radial-gradient(circle, var(--text-secondary, #94a3b8) 1.5px, transparent 1.5px)",
            backgroundSize: "4px 4px",
            opacity: 0.6,
          }}
        />
      )}
    </div>
  );
};
