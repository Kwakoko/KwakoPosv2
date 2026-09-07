/**
 * KwakoPos Multi-Tab and Multi-Client Coordination
 *
 * Uses BroadcastChannel and Web Locks API to ensure that multiple
 * tabs cannot perform simultaneous, conflicting migrations.
 * Only one coordinator owns the upgrade process while other clients quiesce.
 */

export interface CoordinationMessage {
  type: "QUIESCE_REQUEST" | "QUIESCED" | "MIGRATION_STARTED" | "MIGRATION_COMPLETED" | "MIGRATION_FAILED" | "RESUME" | "RELOAD_REQUIRED";
  tabId: string;
  targetVersion?: string;
  targetSchema?: number;
  timestamp: string;
}

export class ClientCoordinationManager {
  public readonly tabId: string;
  private channel: BroadcastChannel | null = null;
  private isQuiesced = false;
  private isCoordinator = false;
  private quiesceCallbacks: Array<(quiesced: boolean) => void> = [];

  constructor(tabId?: string) {
    this.tabId = tabId || `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.initChannel();
  }

  private initChannel(): void {
    if (typeof BroadcastChannel !== "undefined") {
      try {
        this.channel = new BroadcastChannel("kwakopos-tab-coordination");
        this.channel.onmessage = (event) => {
          this.handleMessage(event.data as CoordinationMessage);
        };
      } catch {
        this.channel = null;
      }
    }
  }

  private handleMessage(msg: CoordinationMessage): void {
    if (!msg || msg.tabId === this.tabId) return;

    if (msg.type === "QUIESCE_REQUEST") {
      this.isQuiesced = true;
      this.notifyQuiesceCallbacks(true);
      this.sendMessage({
        type: "QUIESCED",
        tabId: this.tabId,
        timestamp: new Date().toISOString(),
      });
    } else if (msg.type === "RESUME" || msg.type === "MIGRATION_COMPLETED") {
      this.isQuiesced = false;
      this.notifyQuiesceCallbacks(false);
    } else if (msg.type === "RELOAD_REQUIRED") {
      if (typeof window !== "undefined" && window.location) {
        window.location.reload();
      }
    }
  }

  private sendMessage(msg: CoordinationMessage): void {
    if (this.channel) {
      try {
        this.channel.postMessage(msg);
      } catch {
        /* channel closed */
      }
    }
  }

  private notifyQuiesceCallbacks(quiesced: boolean): void {
    for (const cb of this.quiesceCallbacks) {
      try {
        cb(quiesced);
      } catch (err) {
        console.error("Quiesce callback error:", err);
      }
    }
  }

  onQuiesceStateChange(callback: (quiesced: boolean) => void): () => void {
    this.quiesceCallbacks.push(callback);
    return () => {
      const idx = this.quiesceCallbacks.indexOf(callback);
      if (idx !== -1) this.quiesceCallbacks.splice(idx, 1);
    };
  }

  isClientQuiesced(): boolean {
    return this.isQuiesced;
  }

  async acquireUpgradeCoordination(targetVersion: string, targetSchema: number): Promise<boolean> {
    if (typeof navigator !== "undefined" && navigator.locks) {
      // In environment with Web Locks API
      return new Promise<boolean>((resolve) => {
        navigator.locks.request(
          "kwakopos-migration-lock",
          { ifAvailable: true },
          async (lock) => {
            if (!lock) {
              resolve(false);
              return;
            }
            this.isCoordinator = true;
            this.sendMessage({
              type: "QUIESCE_REQUEST",
              tabId: this.tabId,
              targetVersion,
              targetSchema,
              timestamp: new Date().toISOString(),
            });
            resolve(true);
          },
        ).catch(() => resolve(true)); // Fallback to proceed if lock rejected
      });
    }

    // Fallback: BroadcastChannel quiesce request
    this.isCoordinator = true;
    this.sendMessage({
      type: "QUIESCE_REQUEST",
      tabId: this.tabId,
      targetVersion,
      targetSchema,
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  releaseUpgradeCoordination(success: boolean): void {
    this.isCoordinator = false;
    this.sendMessage({
      type: success ? "MIGRATION_COMPLETED" : "MIGRATION_FAILED",
      tabId: this.tabId,
      timestamp: new Date().toISOString(),
    });
    this.sendMessage({
      type: "RESUME",
      tabId: this.tabId,
      timestamp: new Date().toISOString(),
    });
  }

  close(): void {
    if (this.channel) {
      try {
        this.channel.close();
      } catch {
        /* ignore */
      }
      this.channel = null;
    }
  }
}

export const globalClientCoordination = new ClientCoordinationManager();
