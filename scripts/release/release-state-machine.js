export class ReleaseStateMachineEngine {
    currentState;
    stateHistory;
    constructor(initialState = "DRAFT") {
        this.currentState = initialState;
        this.stateHistory = [{ state: initialState, timestamp: new Date().toISOString(), note: "State machine initialized" }];
    }
    getCurrentState() {
        return this.currentState;
    }
    getHistory() {
        return [...this.stateHistory];
    }
    transitionTo(nextState, note = "") {
        const validTransitions = {
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
//# sourceMappingURL=release-state-machine.js.map