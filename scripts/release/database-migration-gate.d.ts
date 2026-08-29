export interface MigrationGateResult {
    passed: boolean;
    pendingMigrations: string[];
    backupFile?: string;
    schemaIntegrityVerified: boolean;
    logs: string[];
    error?: string;
}
export declare function runDatabaseMigrationGate(options?: {
    dryRun?: boolean;
}): MigrationGateResult;
//# sourceMappingURL=database-migration-gate.d.ts.map