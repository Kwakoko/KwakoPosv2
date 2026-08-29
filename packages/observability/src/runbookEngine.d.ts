export interface OperationalRunbook {
    id: string;
    title: string;
    category: "INFRASTRUCTURE" | "DATA_INTEGRITY" | "SYNC" | "RELEASE" | "SECURITY";
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
    diagnosticSteps: string[];
    mitigationSteps: string[];
    verificationCommand: string;
    slaMinutes: number;
}
export declare class RunbookEngine {
    private static RUNBOOKS;
    static getAllRunbooks(): OperationalRunbook[];
    static getRunbookById(id: string): OperationalRunbook | undefined;
}
//# sourceMappingURL=runbookEngine.d.ts.map