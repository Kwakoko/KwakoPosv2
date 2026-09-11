/**
 * KwakoPosv2 — Window Manager Container
 * ───────────────────────────────────────
 * Master container mounting floating windows, taskbar, and workspace modal.
 */
import React, { useState } from "react";
import { useWindowManager } from "../../context/WindowManagerContext.js";
import { FloatingWindow } from "./FloatingWindow.js";
import { WindowTaskbar } from "./WindowTaskbar.js";
import { WorkspaceManagerModal } from "./WorkspaceManagerModal.js";

export const WindowManagerContainer: React.FC = () => {
  const { windows } = useWindowManager();
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);

  return (
    <>
      {/* Floating Windows Stack */}
      {windows.map((win) => (
        <FloatingWindow key={win.id} window={win} />
      ))}

      {/* Bottom Taskbar */}
      <WindowTaskbar onOpenWorkspaceModal={() => setShowWorkspaceModal(true)} />

      {/* Workspaces Modal */}
      <WorkspaceManagerModal
        isOpen={showWorkspaceModal}
        onClose={() => setShowWorkspaceModal(false)}
      />
    </>
  );
};
