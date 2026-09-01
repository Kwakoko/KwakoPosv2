export type ReleaseState = "DRAFT" | "VALIDATING" | "QUALITY_PASSED" | "SECURITY_PASSED" | "BUILT" | "ATTESTED" | "STAGING" | "STAGING_CERTIFIED" | "PRODUCTION_READY" | "CANARY" | "PROMOTING" | "PRODUCTION" | "VERIFIED" | "RELEASED" | "FAILED" | "BLOCKED" | "ROLLED_BACK" | "RECOVERY_REQUIRED";
export declare class ReleaseStateMachineEngine {
    private currentState;
    private stateHistory;
    constructor(initialState?: ReleaseState);
    getCurrentState(): ReleaseState;
    getHistory(): {
        state: ReleaseState;
        timestamp: string;
        note: string;
    }[];
    transitionTo(nextState: ReleaseState, note?: string): ReleaseState;
}
//# sourceMappingURL=release-state-machine.d.ts.map