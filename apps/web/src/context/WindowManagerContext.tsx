/**
 * KwakoPosv2 — Multi-Window Manager Context
 * ──────────────────────────────────────────
 * Desktop multitasking operating system state machine.
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import type {
  KwakokoWindow,
  KwakokoWorkspace,
  WindowManagerSettings,
  OpenWindowOptions,
  WindowMode,
  WindowState,
  WindowPosition,
  WindowDimensions,
} from "../types/windowManager.js";

const BASE_Z_INDEX = 100;
const PINNED_Z_INDEX_OFFSET = 500;
const DEFAULT_MAX_WINDOWS = 20;

const DEFAULT_SETTINGS: WindowManagerSettings = {
  enabled: true,
  maxOpenWindows: DEFAULT_MAX_WINDOWS,
  enableDocking: true,
  enableAnimations: true,
  showTaskbar: true,
  defaultWindowSize: { width: 850, height: 580 },
};

export interface WindowManagerContextType {
  windows: KwakokoWindow[];
  activeWindowId: string | null;
  workspaces: KwakokoWorkspace[];
  activeWorkspaceId: string;
  settings: WindowManagerSettings;
  isWindowModeEnabled: boolean;
  isMobile: boolean;

  // Window Operations
  openWindow: (options: OpenWindowOptions) => string;
  closeWindow: (windowId: string) => void;
  minimizeWindow: (windowId: string) => void;
  maximizeWindow: (windowId: string) => void;
  restoreWindow: (windowId: string) => void;
  focusWindow: (windowId: string) => void;
  pinWindow: (windowId: string) => void;
  unpinWindow: (windowId: string) => void;
  moveWindow: (windowId: string, position: WindowPosition) => void;
  resizeWindow: (windowId: string, size: WindowDimensions) => void;
  dockWindow: (windowId: string, mode: WindowMode) => void;
  closeAllWindows: () => void;
  minimizeAllWindows: () => void;
  restoreAllWindows: () => void;
  toggleWindowMode: () => void;

  // Workspace Operations
  saveWorkspace: (name: string) => string;
  restoreWorkspace: (workspaceId: string) => boolean;
  deleteWorkspace: (workspaceId: string) => boolean;
}

const WindowManagerContext = createContext<WindowManagerContextType | null>(null);

const DEFAULT_WORKSPACES: KwakokoWorkspace[] = [
  {
    id: "ws-cashier",
    name: "Cashier Station (POS + Cash Drawer)",
    activeWindowId: "win-pos",
    isActive: true,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    windows: [
      {
        id: "win-pos",
        moduleId: "POS",
        route: "/pos",
        title: "Point of Sale",
        icon: "ShoppingCart",
        position: { x: 30, y: 70 },
        size: { width: 800, height: 620 },
        zIndex: 101,
        state: "normal",
        mode: "floating",
        pinned: false,
        draggable: true,
        resizable: true,
        closable: true,
        persistent: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "win-cash-drawer",
        moduleId: "Cash Drawer",
        route: "/cash-drawer",
        title: "Cash Drawer & Denominations",
        icon: "DollarSign",
        position: { x: 450, y: 120 },
        size: { width: 750, height: 550 },
        zIndex: 102,
        state: "normal",
        mode: "floating",
        pinned: false,
        draggable: true,
        resizable: true,
        closable: true,
        persistent: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  },
  {
    id: "ws-manager",
    name: "Store Manager (Inventory + Reports + Trash)",
    activeWindowId: "win-inventory",
    isActive: false,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    windows: [
      {
        id: "win-inventory",
        moduleId: "Inventory",
        route: "/inventory",
        title: "Inventory & Stock Ledger",
        icon: "Package",
        position: { x: 50, y: 70 },
        size: { width: 850, height: 600 },
        zIndex: 101,
        state: "normal",
        mode: "floating",
        pinned: false,
        draggable: true,
        resizable: true,
        closable: true,
        persistent: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "win-reports",
        moduleId: "Reports",
        route: "/reports",
        title: "Analytics & Reports",
        icon: "BarChart",
        position: { x: 400, y: 100 },
        size: { width: 800, height: 580 },
        zIndex: 102,
        state: "normal",
        mode: "floating",
        pinned: false,
        draggable: true,
        resizable: true,
        closable: true,
        persistent: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  },
];

export const WindowManagerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [windows, setWindows] = useState<KwakokoWindow[]>([]);
  const [activeWindowId, setActiveWindowId] = useState<string | null>(null);
  const [isWindowModeEnabled, setIsWindowModeEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("kwakopos:v2:window_mode") === "true";
  });
  const [workspaces, setWorkspaces] = useState<KwakokoWorkspace[]>(() => {
    if (typeof window === "undefined") return DEFAULT_WORKSPACES;
    try {
      const saved = localStorage.getItem("kwakopos:v2:workspaces");
      return saved ? JSON.parse(saved) : DEFAULT_WORKSPACES;
    } catch {
      return DEFAULT_WORKSPACES;
    }
  });
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>("ws-cashier");
  const [settings, setSettings] = useState<WindowManagerSettings>(DEFAULT_SETTINGS);
  const [isMobile, setIsMobile] = useState<boolean>(
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    localStorage.setItem("kwakopos:v2:window_mode", String(isWindowModeEnabled));
  }, [isWindowModeEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem("kwakopos:v2:workspaces", JSON.stringify(workspaces));
    } catch {
      // ignore
    }
  }, [workspaces]);

  const toggleWindowMode = useCallback(() => {
    setIsWindowModeEnabled((prev) => !prev);
  }, []);

  const normalizeZIndexes = useCallback(
    (list: KwakokoWindow[], targetId?: string): KwakokoWindow[] => {
      const sorted = [...list].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
      let normal = BASE_Z_INDEX;
      let pinned = BASE_Z_INDEX + PINNED_Z_INDEX_OFFSET;

      return sorted.map((w) => {
        const isTarget = w.id === targetId;
        if (w.pinned) {
          return { ...w, zIndex: isTarget ? pinned + 20 : ++pinned };
        }
        return { ...w, zIndex: isTarget ? normal + 20 : ++normal };
      });
    },
    []
  );

  const focusWindow = useCallback(
    (windowId: string) => {
      setActiveWindowId(windowId);
      setWindows((prev) =>
        normalizeZIndexes(
          prev.map((w) => (w.id === windowId && w.state === "minimized" ? { ...w, state: "normal" } : w)),
          windowId
        )
      );
    },
    [normalizeZIndexes]
  );

  const openWindow = useCallback(
    (opts: OpenWindowOptions): string => {
      // Auto-enable window mode if opening a window
      setIsWindowModeEnabled(true);

      const existing = windows.find(
        (w) => (opts.id && w.id === opts.id) || (opts.moduleId && w.moduleId === opts.moduleId)
      );
      if (existing) {
        focusWindow(existing.id);
        return existing.id;
      }

      const id = opts.id || `win-${opts.moduleId.toLowerCase().replace(/\s+/g, "-")}-${Date.now().toString(36)}`;
      const offset = (windows.length % 6) * 35;

      const newWin: KwakokoWindow = {
        id,
        moduleId: opts.moduleId,
        route: opts.route || `/${opts.moduleId.toLowerCase().replace(/\s+/g, "-")}`,
        title: opts.title || opts.moduleId,
        icon: opts.icon,
        position: {
          x: opts.position?.x ?? 50 + offset,
          y: opts.position?.y ?? 60 + offset,
        },
        size: {
          width: opts.size?.width ?? settings.defaultWindowSize.width,
          height: opts.size?.height ?? settings.defaultWindowSize.height,
        },
        minSize: { width: 480, height: 350 },
        zIndex: BASE_Z_INDEX + windows.length + 1,
        state: "normal",
        mode: "floating",
        pinned: opts.pinned ?? false,
        draggable: true,
        resizable: true,
        closable: true,
        persistent: opts.persistent ?? true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setWindows((prev) => normalizeZIndexes([...prev, newWin], id));
      setActiveWindowId(id);
      return id;
    },
    [windows, settings, focusWindow, normalizeZIndexes]
  );

  const closeWindow = useCallback((windowId: string) => {
    setWindows((prev) => prev.filter((w) => w.id !== windowId));
    setActiveWindowId((prev) => (prev === windowId ? null : prev));
  }, []);

  const minimizeWindow = useCallback((windowId: string) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === windowId ? { ...w, state: "minimized" } : w))
    );
    setActiveWindowId((prev) => (prev === windowId ? null : prev));
  }, []);

  const maximizeWindow = useCallback((windowId: string) => {
    setWindows((prev) =>
      prev.map((w) =>
        w.id === windowId
          ? { ...w, state: w.state === "maximized" ? "normal" : "maximized", mode: "fullscreen" }
          : w
      )
    );
    focusWindow(windowId);
  }, [focusWindow]);

  const restoreWindow = useCallback((windowId: string) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === windowId ? { ...w, state: "normal", mode: "floating" } : w))
    );
    focusWindow(windowId);
  }, [focusWindow]);

  const pinWindow = useCallback((windowId: string) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === windowId ? { ...w, pinned: true } : w))
    );
  }, []);

  const unpinWindow = useCallback((windowId: string) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === windowId ? { ...w, pinned: false } : w))
    );
  }, []);

  const moveWindow = useCallback((windowId: string, position: WindowPosition) => {
    setWindows((prev) =>
      prev.map((w) =>
        w.id === windowId ? { ...w, position, mode: "floating", state: "normal" } : w
      )
    );
  }, []);

  const resizeWindow = useCallback((windowId: string, size: WindowDimensions) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === windowId ? { ...w, size } : w))
    );
  }, []);

  const dockWindow = useCallback(
    (windowId: string, mode: WindowMode) => {
      const screenW = typeof window !== "undefined" ? window.innerWidth : 1200;
      const screenH = typeof window !== "undefined" ? window.innerHeight : 800;

      setWindows((prev) =>
        prev.map((w) => {
          if (w.id !== windowId) return w;
          if (mode === "docked-left") {
            return {
              ...w,
              mode,
              state: "normal",
              position: { x: 0, y: 50 },
              size: { width: Math.floor(screenW / 2), height: screenH - 95 },
            };
          }
          if (mode === "docked-right") {
            return {
              ...w,
              mode,
              state: "normal",
              position: { x: Math.floor(screenW / 2), y: 50 },
              size: { width: Math.floor(screenW / 2), height: screenH - 95 },
            };
          }
          if (mode === "fullscreen") {
            return {
              ...w,
              mode,
              state: "maximized",
              position: { x: 0, y: 50 },
              size: { width: screenW, height: screenH - 95 },
            };
          }
          return { ...w, mode: "floating", state: "normal" };
        })
      );
      focusWindow(windowId);
    },
    [focusWindow]
  );

  const closeAllWindows = useCallback(() => {
    setWindows([]);
    setActiveWindowId(null);
  }, []);

  const minimizeAllWindows = useCallback(() => {
    setWindows((prev) => prev.map((w) => ({ ...w, state: "minimized" })));
    setActiveWindowId(null);
  }, []);

  const restoreAllWindows = useCallback(() => {
    setWindows((prev) => prev.map((w) => ({ ...w, state: "normal" })));
  }, []);

  const saveWorkspace = useCallback(
    (name: string): string => {
      const id = `ws-${Date.now().toString(36)}`;
      const newWs: KwakokoWorkspace = {
        id,
        name,
        activeWindowId: activeWindowId || undefined,
        windows: [...windows],
        isActive: true,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setWorkspaces((prev) => [...prev, newWs]);
      setActiveWorkspaceId(id);
      return id;
    },
    [activeWindowId, windows]
  );

  const restoreWorkspace = useCallback(
    (workspaceId: string): boolean => {
      const found = workspaces.find((w) => w.id === workspaceId);
      if (!found) return false;
      setWindows(found.windows.map((w) => ({ ...w, state: "normal" })));
      setActiveWorkspaceId(found.id);
      if (found.activeWindowId) {
        setActiveWindowId(found.activeWindowId);
      }
      setIsWindowModeEnabled(true);
      return true;
    },
    [workspaces]
  );

  const deleteWorkspace = useCallback((workspaceId: string): boolean => {
    setWorkspaces((prev) => prev.filter((w) => w.id !== workspaceId));
    return true;
  }, []);

  const value = useMemo(
    () => ({
      windows,
      activeWindowId,
      workspaces,
      activeWorkspaceId,
      settings,
      isWindowModeEnabled,
      isMobile,
      openWindow,
      closeWindow,
      minimizeWindow,
      maximizeWindow,
      restoreWindow,
      focusWindow,
      pinWindow,
      unpinWindow,
      moveWindow,
      resizeWindow,
      dockWindow,
      closeAllWindows,
      minimizeAllWindows,
      restoreAllWindows,
      toggleWindowMode,
      saveWorkspace,
      restoreWorkspace,
      deleteWorkspace,
    }),
    [
      windows,
      activeWindowId,
      workspaces,
      activeWorkspaceId,
      settings,
      isWindowModeEnabled,
      isMobile,
      openWindow,
      closeWindow,
      minimizeWindow,
      maximizeWindow,
      restoreWindow,
      focusWindow,
      pinWindow,
      unpinWindow,
      moveWindow,
      resizeWindow,
      dockWindow,
      closeAllWindows,
      minimizeAllWindows,
      restoreAllWindows,
      toggleWindowMode,
      saveWorkspace,
      restoreWorkspace,
      deleteWorkspace,
    ]
  );

  return <WindowManagerContext.Provider value={value}>{children}</WindowManagerContext.Provider>;
};

export const useWindowManager = (): WindowManagerContextType => {
  const ctx = useContext(WindowManagerContext);
  if (!ctx) {
    throw new Error("useWindowManager must be used within WindowManagerProvider");
  }
  return ctx;
};
