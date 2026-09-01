export interface DisasterRecoveryVerificationReport {
    overallCertified: boolean;
    phases: Array<{
        phase: string;
        status: "PASSED" | "FAILED";
        details: string;
    }>;
    backupVerification: {
        backupAvailable: boolean;
        pointInTimeRecoverySupported: boolean;
        lastBackupTimestamp: string;
        checksumMatch: boolean;
    };
    migrationClassification: "ADDITIVE_NON_BREAKING" | "DATA_MIGRATION" | "STRUCTURAL_DESTRUCTIVE";
}
export declare function runDisasterRecoveryVerification(): DisasterRecoveryVerificationReport;
//# sourceMappingURL=disaster-recovery-verifier.d.ts.map