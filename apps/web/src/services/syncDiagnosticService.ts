/**
 * KwakoPos V2 — Real-Time Sync Diagnostic & Failure Logger Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Captures, classifies, and retains structured sync cycle failures
 * (e.g. HTTP 403 Forbidden, 401 Unauthorized, 500, Offline, Schema Violations)
 * so operators and store staff have immediate visibility into root causes
 * and remediation actions without digging into browser DevTools console logs.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type SyncErrorCategory =
  | "AUTH_FORBIDDEN"        // HTTP 403: Role/permission or tenant isolation denial
  | "AUTH_UNAUTHORIZED"     // HTTP 401: Token expired or missing credentials
  | "NETWORK_DISCONNECTED"   // Offline or fetch failure
  | "SERVER_FAILURE"        // HTTP 500, 502, 503, 504
  | "DATA_CONFLICT"         // 409 Conflict or CRDT divergence
  | "PROTOCOL_VIOLATION"    // Payload or schema mismatch
  | "UNKNOWN";

export interface SyncDiagnosticErrorEntry {
  id: string;
  timestamp: string;
  statusCode: number | null;
  category: SyncErrorCategory;
  title: string;
  message: string;
  rawError: string;
  endpoint?: string;
  remediation: string;
  outboxPendingCount?: number;
  tenantId?: string;
  branchId?: string;
}

export type DiagnosticListener = (entries: SyncDiagnosticErrorEntry[]) => void;

const MAX_ERROR_HISTORY = 50;
const STORAGE_KEY = "kwakopos_sync_diagnostic_log";

export class SyncDiagnosticService {
  private static instance: SyncDiagnosticService;
  private errorLog: SyncDiagnosticErrorEntry[] = [];
  private listeners: Set<DiagnosticListener> = new Set();

  private constructor() {
    this.loadFromStorage();
  }

  public static getInstance(): SyncDiagnosticService {
    if (!SyncDiagnosticService.instance) {
      SyncDiagnosticService.instance = new SyncDiagnosticService();
    }
    return SyncDiagnosticService.instance;
  }

  private loadFromStorage(): void {
    if (typeof window === "undefined" || !window.sessionStorage) return;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.errorLog = JSON.parse(raw);
      }
    } catch {
      this.errorLog = [];
    }
  }

  private persist(): void {
    if (typeof window === "undefined" || !window.sessionStorage) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.errorLog.slice(0, MAX_ERROR_HISTORY)));
    } catch {
      /* ignore storage quota warnings */
    }
  }

  /**
   * Intelligently parses error strings, objects, or HTTP responses into categorized entries
   */
  public parseError(err: unknown, context?: {
    endpoint?: string;
    outboxPendingCount?: number;
    tenantId?: string;
    branchId?: string;
  }): SyncDiagnosticErrorEntry {
    const rawMessage = err instanceof Error ? err.message : String(err || "Unknown sync error");
    const id = `SYNC-ERR-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const timestamp = new Date().toISOString();

    let statusCode: number | null = null;
    let category: SyncErrorCategory = "UNKNOWN";
    let title = "Sync Operation Failed";
    let remediation = "Check your connection and try syncing again.";

    // Detect HTTP status codes
    const statusMatch = rawMessage.match(/\b(?:HTTP|status|code)\s*(\d{3})\b/i) || rawMessage.match(/\b(\d{3})\b/);
    if (statusMatch) {
      statusCode = parseInt(statusMatch[1], 10);
    }

    if (statusCode === 403 || rawMessage.includes("403") || rawMessage.toLowerCase().includes("forbidden")) {
      statusCode = 403;
      category = "AUTH_FORBIDDEN";
      title = "HTTP 403: Access Denied / Insufficient Permissions";
      remediation = "Your account lacks permissions to push changes to this tenant/branch. Please verify your role or request an admin to re-issue store permissions.";
    } else if (statusCode === 401 || rawMessage.includes("401") || rawMessage.toLowerCase().includes("unauthorized")) {
      statusCode = 401;
      category = "AUTH_UNAUTHORIZED";
      title = "HTTP 401: Authentication Session Expired";
      remediation = "Your active session has expired. Please log out and sign back in to refresh authorization tokens.";
    } else if (rawMessage.toLowerCase().includes("offline") || rawMessage.toLowerCase().includes("failed to fetch") || rawMessage.toLowerCase().includes("networkerror")) {
      category = "NETWORK_DISCONNECTED";
      title = "Network Disconnected";
      remediation = "Unable to reach KwakoPos Cloud Edge. Changes remain safely staged in your offline outbox and will synchronize once reconnected.";
    } else if (statusCode && statusCode >= 500) {
      category = "SERVER_FAILURE";
      title = `HTTP ${statusCode}: Cloud Edge Server Error`;
      remediation = "The central sync gateway encountered an internal error. Pending changes remain queued locally; retry shortly.";
    } else if (rawMessage.includes("SYNC_PROTOCOL_VIOLATION")) {
      category = "PROTOCOL_VIOLATION";
      title = "Sync Protocol Schema Violation";
      remediation = "The client and server protocol versions may be out of alignment. Refresh the application to load the latest release.";
    } else if (rawMessage.includes("CONFLICT") || rawMessage.includes("409")) {
      category = "DATA_CONFLICT";
      title = "Concurrent Data Mutation Conflict";
      remediation = "Open the Conflict Resolution Center from the top bar to inspect and resolve concurrent register mutations.";
    }

    return {
      id,
      timestamp,
      statusCode,
      category,
      title,
      message: rawMessage,
      rawError: err instanceof Error && err.stack ? err.stack : rawMessage,
      endpoint: context?.endpoint || "/sync/push",
      remediation,
      outboxPendingCount: context?.outboxPendingCount,
      tenantId: context?.tenantId,
      branchId: context?.branchId,
    };
  }

  /**
   * Records a sync failure and notifies all live subscribers
   */
  public logFailure(err: unknown, context?: {
    endpoint?: string;
    outboxPendingCount?: number;
    tenantId?: string;
    branchId?: string;
  }): SyncDiagnosticErrorEntry {
    const entry = this.parseError(err, context);
    this.errorLog = [entry, ...this.errorLog].slice(0, MAX_ERROR_HISTORY);
    this.persist();
    this.notify();
    return entry;
  }

  /**
   * Diagnostic execution wrapper for ClientSyncEngine.runSync()
   */
  public async wrapSync<T>(syncFn: () => Promise<T>, context?: {
    endpoint?: string;
    outboxPendingCount?: number;
    tenantId?: string;
    branchId?: string;
  }): Promise<T> {
    try {
      return await syncFn();
    } catch (error) {
      this.logFailure(error, context);
      throw error;
    }
  }

  public getErrors(): SyncDiagnosticErrorEntry[] {
    return [...this.errorLog];
  }

  public getLatestError(): SyncDiagnosticErrorEntry | null {
    return this.errorLog[0] || null;
  }

  public clearErrors(): void {
    this.errorLog = [];
    this.persist();
    this.notify();
  }

  public subscribe(listener: DiagnosticListener): () => void {
    this.listeners.add(listener);
    listener(this.getErrors());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const list = this.getErrors();
    this.listeners.forEach((l) => {
      try {
        l(list);
      } catch {
        /* ignore */
      }
    });
  }
}

export const syncDiagnosticService = SyncDiagnosticService.getInstance();
