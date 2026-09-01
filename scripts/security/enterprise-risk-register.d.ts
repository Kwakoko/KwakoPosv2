export interface SecurityRiskItem {
    riskId: string;
    asset: string;
    threatScenario: string;
    vulnerability: string;
    likelihood: "LOW" | "MEDIUM" | "HIGH";
    impact: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    riskRating: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    owner: string;
    mitigatingControlId: string;
    residualRisk: "LOW" | "ACCEPTED";
    targetRemediationDate: string;
    managementAcceptance: boolean;
}
export declare function getEnterpriseSecurityRiskRegister(): {
    lastAssessed: string;
    totalMaterialRisks: number;
    criticalRisksMitigated: number;
    risks: SecurityRiskItem[];
};
//# sourceMappingURL=enterprise-risk-register.d.ts.map