const PREFIX = "kwakopos:v2:session:draft:";
type DraftKind = "invoice" | "purchase" | "quotation" | "expense" | "form";

export interface SessionDraft {
  kind: DraftKind;
  id: string;
  tenantId: string;
  userId: string;
  route: string;
  savedAt: number;
  payload: Record<string, unknown>;
}

interface RegisteredDraft {
  kind: DraftKind;
  id: string;
  read: () => Record<string, unknown> | null;
  route?: () => string;
}

const registry = new Map<string, RegisteredDraft>();

export function registerSessionDraft(provider: RegisteredDraft): () => void {
  registry.set(provider.id, provider);
  return () => registry.delete(provider.id);
}

export function captureRegisteredDrafts(tenantId: string, userId: string): void {
  if (typeof window === "undefined") return;
  for (const provider of registry.values()) {
    try {
      const payload = provider.read();
      if (!payload) continue;
      const draft: SessionDraft = {
        kind: provider.kind,
        id: provider.id,
        tenantId,
        userId,
        route: provider.route?.() || window.location.pathname,
        savedAt: Date.now(),
        payload,
      };
      window.localStorage.setItem(PREFIX + tenantId + ":" + userId + ":" + provider.id, JSON.stringify(draft));
    } catch {
      // Draft capture is best-effort and never blocks logout.
    }
  }
}

export function restoreSessionDrafts(tenantId: string, userId: string): SessionDraft[] {
  if (typeof window === "undefined") return [];
  const prefix = PREFIX + tenantId + ":" + userId + ":";
  const drafts: SessionDraft[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key?.startsWith(prefix)) continue;
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) || "null") as SessionDraft | null;
      if (parsed) drafts.push(parsed);
    } catch { /* ignore corrupt drafts */ }
  }
  return drafts.sort((a, b) => b.savedAt - a.savedAt);
}

export function discardSessionDraft(tenantId: string, userId: string, providerId: string): void {
  try { window.localStorage.removeItem(PREFIX + tenantId + ":" + userId + ":" + providerId); } catch { /* ignore */ }
}
