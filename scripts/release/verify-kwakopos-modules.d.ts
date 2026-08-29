export interface ModuleVerificationResult {
    module: string;
    passed: boolean;
    message: string;
    latencyMs: number;
}
export declare function verifyAllKwakoPosModules(): Promise<{
    allPassed: boolean;
    results: ModuleVerificationResult[];
}>;
//# sourceMappingURL=verify-kwakopos-modules.d.ts.map