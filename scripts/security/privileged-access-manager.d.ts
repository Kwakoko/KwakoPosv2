export interface PrivilegedIdentity {
    identityId: string;
    principalType: "USER" | "SERVICE_ACCOUNT" | "CI_CD_RUNNER";
    role: string;
    permissionsCount: number;
    businessJustification: string;
    lastRecertifiedDate: string;
    isDormant: boolean;
    isExcessive: boolean;
    status: "ACTIVE_AND_CERTIFIED" | "REVOKED" | "FLAGGED_FOR_REVIEW";
}
export declare function runPrivilegedAccessRecertification(): {
    overallPassed: boolean;
    totalPrivilegedIdentities: number;
    activeCertifiedCount: number;
    orphanedOrExcessiveCount: number;
    identities: PrivilegedIdentity[];
};
//# sourceMappingURL=privileged-access-manager.d.ts.map