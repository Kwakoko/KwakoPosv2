export interface TamperEvidentAuditRecord {
    recordId: string;
    sequenceNumber: number;
    tenantId: string;
    branchId: string;
    actorId: string;
    role: string;
    timestamp: string;
    action: string;
    resource: string;
    previousValue?: string;
    newValue?: string;
    deviceId: string;
    operationId: string;
    idempotencyKey: string;
    outcome: "SUCCESS" | "BLOCKED" | "FAILED";
    securityClassification: "CONFIDENTIAL" | "RESTRICTED" | "CRITICAL";
    previousHash: string;
    hash: string;
}
export declare class AuditLogIntegrityEngine {
    private chain;
    private genesisHash;
    appendEvent(eventData: Omit<TamperEvidentAuditRecord, "recordId" | "sequenceNumber" | "previousHash" | "hash">): TamperEvidentAuditRecord;
    verifyChainIntegrity(): {
        chainIntact: boolean;
        totalRecords: number;
        corruptedRecordId?: string;
        reason?: string;
    };
    getChain(): TamperEvidentAuditRecord[];
}
export declare function runAuditIntegrityCheck(): {
    verified: boolean;
    totalAuditRecords: number;
    chainDigest: string;
};
//# sourceMappingURL=audit-log-integrity-engine.d.ts.map