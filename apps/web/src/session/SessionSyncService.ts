export type SessionSyncEvent =
  | "SESSION_LOGIN"
  | "SESSION_REFRESHED"
  | "SESSION_WARNING"
  | "SESSION_LOGOUT"
  | "SESSION_TIMEOUT"
  | "SESSION_REVOKED"
  | "SESSION_LOCKED"
  | "SESSION_REAUTH_REQUIRED";

interface Envelope {
  id: string;
  type: SessionSyncEvent;
  payload?: Record<string, unknown>;
}

type Listener = (event: Envelope) => void;

class SessionSyncServiceImpl {
  private channel: BroadcastChannel | null = null;
  private listeners = new Set<Listener>();
  private readonly storageKey = "kwakopos:v2:session:event";

  constructor() {
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      this.channel = new BroadcastChannel("kwakopos_session");
      this.channel.onmessage = (event) => this.emit(event.data as Envelope);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("storage", (event) => {
        if (event.key !== this.storageKey || !event.newValue) return;
        try { this.emit(JSON.parse(event.newValue) as Envelope); } catch { /* ignore */ }
      });
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  broadcast(type: SessionSyncEvent, payload?: Record<string, unknown>): void {
    if (typeof window === "undefined") return;
    const envelope: Envelope = { id: crypto.randomUUID(), type, payload };
    try { this.channel?.postMessage(envelope); } catch { /* ignore */ }
    try {
      window.localStorage.setItem(this.storageKey, JSON.stringify(envelope));
      window.localStorage.removeItem(this.storageKey);
    } catch { /* ignore */ }
  }

  private emit(envelope: Envelope): void {
    if (!envelope?.id || !envelope.type) return;
    this.listeners.forEach((listener) => {
      try { listener(envelope); } catch { /* ignore */ }
    });
  }
}

export const sessionSyncService = new SessionSyncServiceImpl();
