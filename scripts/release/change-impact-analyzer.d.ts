/**
 * KwakoPos Release Engineering Platform v2 — Change Impact Analyzer
 * Dynamically inspects modified git paths and selects required domain certification suites.
 */
export interface ChangeImpactAnalysis {
    modifiedFiles: string[];
    affectedDomains: string[];
    requiredCertificationSuites: string[];
    hasDatabaseMigrations: boolean;
    hasAuthChanges: boolean;
    hasInventoryChanges: boolean;
    hasSyncChanges: boolean;
    hasPWAChanges: boolean;
    impactScore: number;
}
export declare function analyzeChangeImpact(modifiedFiles: string[]): ChangeImpactAnalysis;
//# sourceMappingURL=change-impact-analyzer.d.ts.map