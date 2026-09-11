/**
 * KwakoPosv2 — Multi-Window Manager Domain Types
 * ───────────────────────────────────────────────
 * Multi-tasking desktop window interface contracts.
 */

export type WindowState = "normal" | "minimized" | "maximized";

export type WindowMode =
  | "floating"
  | "docked-left"
  | "docked-right"
  | "docked-top"
  | "docked-bottom"
  | "fullscreen";

export type SnapDockPosition =
  | "none"
  | "left"
  | "right"
  | "fullscreen";

export interface WindowDimensions {
  width: number;
  height: number;
}

export interface WindowPosition {
  x: number;
  y: number;
}

export interface KwakokoWindow {
  id: string;
  moduleId: string;
  route?: string;
  title: string;
  icon?: string;
  position: WindowPosition;
  size: WindowDimensions;
  minSize?: WindowDimensions;
  maxSize?: WindowDimensions;
  zIndex: number;
  state: WindowState;
  mode: WindowMode;
  pinned: boolean;
  draggable: boolean;
  resizable: boolean;
  closable: boolean;
  persistent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KwakokoWorkspace {
  id: string;
  name: string;
  activeWindowId?: string;
  windows: KwakokoWindow[];
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface WindowManagerSettings {
  enabled: boolean;
  maxOpenWindows: number;
  enableDocking: boolean;
  enableAnimations: boolean;
  showTaskbar: boolean;
  defaultWindowSize: WindowDimensions;
}

export interface OpenWindowOptions {
  id?: string;
  moduleId: string;
  route?: string;
  title?: string;
  icon?: string;
  size?: Partial<WindowDimensions>;
  position?: Partial<WindowPosition>;
  pinned?: boolean;
  persistent?: boolean;
}
