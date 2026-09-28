/**
 * KwakoPos Enterprise PWA Update State Machine
 *
 * Implements the 15-state PWA update lifecycle:
 * NORMAL -> UPDATE_DETECTED -> PREPARING -> QUIESCING -> SNAPSHOTTING ->
 * SNAPSHOT_VERIFIED -> MIGRATING -> MIGRATION_VERIFIED -> ACTIVATING ->
 * HEALTH_CHECKING -> COMMITTED
 *
 * Recovery and Rollback paths:
 * RECOVERY -> ROLLBACK_PENDING -> ROLLED_BACK -> RECOVERED
 *
 * All state transitions are validated and durably persisted to survive
 * browser crashes, page reloads, and abnormal terminations.
 */

export type PwaUpdateState =
  | "NORMAL"
  | "UPDATE_DETECTED"
  | "PREPARING"
  | "QUIESCING"
  | "SNAPSHOTTING"
  | "SNAPSHOT_VERIFIED"
  | "MIGRATING"
  | "MIGRATION_VERIFIED"
  | "ACTIVATING"
  | "HEALTH_CHECKING"
  | "COMMITTED"
  | "RECOVERY"
  | "ROLLBACK_PENDING"
  | "ROLLED_BACK"
  | "RECOVERED";

export interface DurableUpdateRecord {
  currentState: PwaUpdateState;
  previousState: PwaUpdateState | null;
  targetVersion: string;
  targetSchemaVersion: number;
  currentVersion: string;
  currentSchemaVersion: number;
  snapshotId: string | null;
  updatedAt: string;
  errorReason: string | null;
  history: Array<{
    state: PwaUpdateState;
    timestamp: string;
    details?: string;
  }>;
}

const VALID_TRANSITIONS: Record<PwaUpdateState, PwaUpdateState[]> = {
  NORMAL: ["UPDATE_DETECTED", "RECOVERY"],
  UPDATE_DETECTED: ["PREPARING", "NORMAL", "RECOVERY"],
  PREPARING: ["QUIESCING", "RECOVERY"],
  QUIESCING: ["SNAPSHOTTING", "RECOVERY"],
  SNAPSHOTTING: ["SNAPSHOT_VERIFIED", "RECOVERY"],
  SNAPSHOT_VERIFIED: ["MIGRATING", "RECOVERY"],
  MIGRATING: ["MIGRATION_VERIFIED", "RECOVERY"],
  MIGRATION_VERIFIED: ["ACTIVATING", "RECOVERY"],
  ACTIVATING: ["HEALTH_CHECKING", "RECOVERY"],
  HEALTH_CHECKING: ["COMMITTED", "RECOVERY"],
  COMMITTED: ["NORMAL", "UPDATE_DETECTED"],
  RECOVERY: ["ROLLBACK_PENDING", "RECOVERED"],
  ROLLBACK_PENDING: ["ROLLED_BACK", "RECOVERY"],
  ROLLED_BACK: ["RECOVERED"],
  RECOVERED: ["NORMAL", "UPDATE_DETECTED"],
};

const STORAGE_KEY = "kwakopos:v2:pwa_update_state";

export class PwaUpdateStateMachine {
  private record: DurableUpdateRecord;
  private listeners: Array<(state: PwaUpdateState, record: DurableUpdateRecord) => void> = [];

  constructor(initialVersion = "2.13.0", initialSchema = 4) {
    this.record = this.loadDurableState(initialVersion, initialSchema);
  }

  private loadDurableState(version: string, schema: number): DurableUpdateRecord {
    if (typeof localStorage !== "undefined") {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.currentState === "string") {
            return parsed;
          }
        }
      } catch {
        /* fallback to fresh */
      }
    }

    return {
      currentState: "NORMAL",
      previousState: null,
      targetVersion: version,
      targetSchemaVersion: schema,
      currentVersion: version,
      currentSchemaVersion: schema,
      snapshotId: null,
      updatedAt: new Date().toISOString(),
      errorReason: null,
      history: [{ state: "NORMAL", timestamp: new Date().toISOString(), details: "Initialized" }],
    };
  }

  private persist(): void {
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.record));
      } catch {
        /* storage full or unavailable */
      }
    }
  }

  getState(): PwaUpdateState {
    return this.record.currentState;
  }

  getRecord(): Readonly<DurableUpdateRecord> {
    return { ...this.record };
  }

  canTransitionTo(nextState: PwaUpdateState): boolean {
    const allowed = VALID_TRANSITIONS[this.record.currentState];
    return Array.isArray(allowed) && allowed.includes(nextState);
  }

  transitionTo(nextState: PwaUpdateState, details?: string, errorReason?: string): DurableUpdateRecord {
    if (!this.canTransitionTo(nextState)) {
      throw new Error(
        `INVALID_STATE_TRANSITION: Cannot transition from ${this.record.currentState} to ${nextState}`,
      );
    }

    const previousState = this.record.currentState;
    this.record.previousState = previousState;
    this.record.currentState = nextState;
    this.record.updatedAt = new Date().toISOString();
    if (errorReason) {
      this.record.errorReason = errorReason;
    }

    this.record.history.push({
      state: nextState,
      timestamp: this.record.updatedAt,
      details,
    });

    // Keep history bounded
    if (this.record.history.length > 50) {
      this.record.history = this.record.history.slice(-50);
    }

    this.persist();

    for (const listener of this.listeners) {
      try {
        listener(nextState, this.record);
      } catch (err) {
        console.error("State machine listener error:", err);
      }
    }

    return this.getRecord();
  }

  setSnapshotId(id: string): void {
    this.record.snapshotId = id;
    this.persist();
  }

  setTarget(version: string, schemaVersion: number): void {
    this.record.targetVersion = version;
    this.record.targetSchemaVersion = schemaVersion;
    this.persist();
  }

  commitRelease(version: string, schemaVersion: number): void {
    this.record.currentVersion = version;
    this.record.currentSchemaVersion = schemaVersion;
    this.record.errorReason = null;
    this.persist();
  }

  subscribe(listener: (state: PwaUpdateState, record: DurableUpdateRecord) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx !== -1) this.listeners.splice(idx, 1);
    };
  }

  resetToNormal(): void {
    this.record.currentState = "NORMAL";
    this.record.previousState = null;
    this.record.errorReason = null;
    this.record.updatedAt = new Date().toISOString();
    this.record.history.push({
      state: "NORMAL",
      timestamp: this.record.updatedAt,
      details: "Reset to NORMAL",
    });
    this.persist();
  }
}
