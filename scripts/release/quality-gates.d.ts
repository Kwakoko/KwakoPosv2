export interface QualityGateItem {
    name: string;
    passed: boolean;
    message: string;
}
export interface QualityGateReport {
    overallPassed: boolean;
    version: string;
    timestamp: string;
    gates: QualityGateItem[];
}
export declare function runReleaseQualityGates(): Promise<QualityGateReport>;
//# sourceMappingURL=quality-gates.d.ts.map