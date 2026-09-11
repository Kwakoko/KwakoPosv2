/**
 * KwakoPosv2 — Workspace Manager Modal
 * ───────────────────────────────────────
 * Manage and switch desktop window workspace presets.
 */
import React, { useState } from "react";
import { useWindowManager } from "../../context/WindowManagerContext.js";
import { Layers, Plus, Trash2, Check, X, LayoutGrid } from "lucide-react";

export const WorkspaceManagerModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const { workspaces, activeWorkspaceId, restoreWorkspace, saveWorkspace, deleteWorkspace } =
    useWindowManager();
  const [newWorkspaceName, setNewWorkspaceName] = useState("");

  if (!isOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;
    saveWorkspace(newWorkspaceName.trim());
    setNewWorkspaceName("");
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10001,
        padding: "1rem",
      }}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: "480px",
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Layers size={18} color="var(--color-primary, #3b82f6)" />
            <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>Desktop Workspaces</h3>
          </div>
          <button className="btn btn-secondary" onClick={onClose} style={{ padding: "0.25rem 0.5rem" }}>
            <X size={14} />
          </button>
        </div>

        <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-secondary)" }}>
          Switch between named multitasking workstation layouts or save your current window layout.
        </p>

        {/* Existing workspaces list */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "250px", overflowY: "auto" }}>
          {workspaces.map((ws) => {
            const isActive = activeWorkspaceId === ws.id;

            return (
              <div
                key={ws.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.6rem 0.85rem",
                  borderRadius: "6px",
                  border: isActive ? "1px solid var(--color-primary, #3b82f6)" : "1px solid var(--border-color)",
                  backgroundColor: isActive ? "rgba(59, 130, 246, 0.1)" : "rgba(255,255,255,0.02)",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontWeight: 600, fontSize: "0.85rem", color: isActive ? "var(--color-primary)" : "inherit" }}>
                    {ws.name}
                  </span>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                    {ws.windows.length} windows ({ws.windows.map((w) => w.title).join(", ")})
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <button
                    className={`btn ${isActive ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => {
                      restoreWorkspace(ws.id);
                      onClose();
                    }}
                    style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
                  >
                    {isActive ? "Active" : "Switch"}
                  </button>
                  {!ws.id.startsWith("ws-cashier") && !ws.id.startsWith("ws-manager") && (
                    <button
                      className="btn btn-secondary"
                      onClick={() => deleteWorkspace(ws.id)}
                      style={{ fontSize: "0.75rem", padding: "0.25rem 0.4rem", color: "var(--color-danger)" }}
                      title="Delete Workspace"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Save Current Layout form */}
        <form onSubmit={handleCreate} style={{ display: "flex", gap: "0.5rem", paddingTop: "0.5rem", borderTop: "1px solid var(--border-color)" }}>
          <input
            type="text"
            className="input"
            placeholder="Save current layout as..."
            value={newWorkspaceName}
            onChange={(e) => setNewWorkspaceName(e.target.value)}
            style={{ fontSize: "0.82rem", flex: 1 }}
          />
          <button type="submit" className="btn btn-primary" disabled={!newWorkspaceName.trim()} style={{ fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <Plus size={13} /> Save
          </button>
        </form>
      </div>
    </div>
  );
};
