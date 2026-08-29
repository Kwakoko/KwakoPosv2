export interface CrossDomainResult {
    passed: boolean;
    details: string;
}
export declare function runCrossDomainProbes(): Promise<{
    allPassed: boolean;
    probes: Record<string, CrossDomainResult>;
}>;
//# sourceMappingURL=cross-domain-certifier.d.ts.map