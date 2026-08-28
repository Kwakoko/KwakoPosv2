export type ReleaseState =
  | "DRAFT"
  | "VALIDATING"
  | "QUALITY_PASSED"
  | "SECURITY_PASSED"
  | "BUILT"
  | "ATTESTED"
  | "STAGING"
  | "STAGING_CERTIFIED"
  | "PRODUCTION_READY"
  | "CANARY"
  | "PROMOTING"
  | "PRODUCTION"
  | "VERIFIED"
  | "RELEASED"
  | "FAILED"
  | "BLOCKED"
  | "ROLLED_BACK"
  | "RECOVERY_REQUIRED";

export class ReleaseStateMachineEngine {
  private currentState: ReleaseState;
  private stateHistory: Array<{ state: ReleaseState; timestamp: string; note: string }>;

  constructor(initialState: ReleaseState = "DRAFT") {
    this.currentState = initialState;
    this.stateHistory = [{ state: initialState, timestamp: new Date().toISOString(), note: "State machine initialized" }];
  }

  public getCurrentState(): ReleaseState {
    return this.currentState;
  }

  public getHistory() {
    return [...this.stateHistory];
  }

  public transitionTo(nextState: ReleaseState, note: string = ""): ReleaseState {
    const validTransitions: Record<ReleaseState, ReleaseState[]> = {
      DRAFT: ["VALIDATING", "FAILED", "BLOCKED"],
      VALIDATING: ["QUALITY_PASSED", "FAILED", "BLOCKED"],
      QUALITY_PASSED: ["SECURITY_PASSED", "FAILED", "BLOCKED"],
      SECURITY_PASSED: ["BUILT", "FAILED", "BLOCKED"],
      BUILT: ["ATTESTED", "FAILED", "BLOCKED"],
      ATTESTED: ["STAGING", "FAILED", "BLOCKED"],
      STAGING: ["STAGING_CERTIFIED", "FAILED", "BLOCKED"],
      STAGING_CERTIFIED: ["PRODUCTION_READY", "FAILED", "BLOCKED"],
      PRODUCTION_READY: ["CANARY", "FAILED", "BLOCKED"],
      CANARY: ["PROMOTING", "ROLLED_BACK", "FAILED"],
      PROMOTING: ["PRODUCTION", "ROLLED_BACK", "FAILED"],
      PRODUCTION: ["VERIFIED", "ROLLED_BACK", "FAILED"],
      VERIFIED: ["RELEASED"],
      RELEASED: [],
      FAILED: ["RECOVERY_REQUIRED", "DRAFT"],
      BLOCKED: ["DRAFT", "VALIDATING"],
      ROLLED_BACK: ["RECOVERY_REQUIRED", "DRAFT"],
      RECOVERY_REQUIRED: ["DRAFT", "VALIDATING"],
    };

    const allowed = validTransitions[this.currentState] || [];
    if (!allowed.includes(nextState)) {
      throw new Error(`Invalid release state transition: Cannot move from '${this.currentState}' to '${nextState}'`);
    }

    this.currentState = nextState;
    this.stateHistory.push({ state: nextState, timestamp: new Date().toISOString(), note });
    console.log(` ✓ [STATE MACHINE] Transition: ${this.stateHistory[this.stateHistory.length - 2].state} -> ${nextState} (${note})`);
    return this.currentState;
  }
}
