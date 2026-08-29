export interface KISBControl {
    controlId: string;
    category: string;
    requirement: string;
    implementation: string;
    evidencePath: string;
    owner: string;
    testMethod: string;
    testFrequency: "CONTINUOUS" | "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUAL";
    status: "IMPLEMENTED_AND_EVIDENCED" | "IN_PROGRESS" | "EXCEPTION_GRANTED";
    remediationPlan?: string;
    approvalStatus: "APPROVED" | "PENDING_REVIEW";
}
export declare function getKwakoPosSecurityBaseline(): {
    version: string;
    lastUpdated: string;
    totalControls: number;
    evidencedControlsCount: number;
    controls: KISBControl[];
};
//# sourceMappingURL=kisb-security-baseline.d.ts.map