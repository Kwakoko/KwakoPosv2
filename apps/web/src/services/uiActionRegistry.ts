export type UiActionKind = "NAVIGATION" | "DIALOG" | "EXPORT" | "MUTATION_INTENT" | "UI_COMMAND";

export interface UiActionEvent {
  actionId: string;
  label: string;
  kind: UiActionKind;
  timestamp: string;
  route: string;
}

const ACTIONS = new Map<string, UiActionKind>();

export function registerUiAction(actionId: string, kind: UiActionKind): void {
  if (!actionId) throw new Error("UI_ACTION_ID_REQUIRED");
  ACTIONS.set(actionId, kind);
}

export function isUiActionRegistered(actionId: string): boolean {
  return ACTIONS.has(actionId);
}

export function runUiAction(actionId: string, label: string, kind?: UiActionKind): UiActionEvent {
  const resolvedKind = kind || ACTIONS.get(actionId);
  if (!resolvedKind) {
    throw new Error(`UI_ACTION_UNREGISTERED:${actionId}`);
  }

  const event: UiActionEvent = {
    actionId,
    label,
    kind: resolvedKind,
    timestamp: new Date().toISOString(),
    route: typeof window !== "undefined" ? window.location.pathname : "",
  };

  if (typeof window !== "undefined") {
    const ledger = ((window as typeof window & { __kwakoposUiActions?: UiActionEvent[] }).__kwakoposUiActions ||= []);
    ledger.push(event);
    window.dispatchEvent(new CustomEvent("kwakopos:ui-action", { detail: event }));
  }

  return event;
}

export function getUiActionLedger(): UiActionEvent[] {
  if (typeof window === "undefined") return [];
  return [...(((window as typeof window & { __kwakoposUiActions?: UiActionEvent[] }).__kwakoposUiActions) || [])];
}

export function clearUiActionLedger(): void {
  if (typeof window !== "undefined") {
    (window as typeof window & { __kwakoposUiActions?: UiActionEvent[] }).__kwakoposUiActions = [];
  }
}
