export interface RollbackRequest {
    failedVersion: string;
    targetStableVersion: string;
    reason: string;
    triggeredBy?: string;
}
export interface RollbackExecutionResult {
    success: boolean;
    failedVersion: string;
    targetStableVersion: string;
    reason: string;
    restoredComponents: string[];
    timestamp: string;
    logs: string[];
}
export declare function executeAutomatedRollback(req: RollbackRequest): Promise<RollbackExecutionResult>;
//# sourceMappingURL=rollback-engine.d.ts.map