export interface ComplianceMapping {
    framework: "ISO/IEC 27001" | "SOC 2 TSC" | "GDPR" | "Tanzania PDPA";
    requirementId: string;
    title: string;
    kwakoPosControlId: string;
    controlOwner: string;
    evidenceReference: string;
    testingFrequency: string;
    readinessStatus: "ASSESSMENT_READY" | "IN_PROGRESS" | "GAP_IDENTIFIED";
}
export declare function getComplianceControlMatrix(): {
    assessmentReadinessState: "Security Controls Implemented and Assessment-Ready";
    prohibitedClaimsNotice: string;
    frameworkCoverage: Record<string, {
        mapped: number;
        ready: number;
    }>;
    mappings: ComplianceMapping[];
};
//# sourceMappingURL=compliance-control-matrix.d.ts.map