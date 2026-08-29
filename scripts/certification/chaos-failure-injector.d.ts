export interface ChaosFailureResult {
    failureScenario: string;
    injectedFailure: string;
    expectedBehavior: string;
    recovered: boolean;
    dataCorrupted: boolean;
    duplicateTransactionsCreated: boolean;
    notes: string;
}
export declare function runChaosFailureInjectionSuite(): Promise<{
    overallPassed: boolean;
    totalScenariosExecuted: number;
    totalScenariosRecovered: number;
    results: ChaosFailureResult[];
}>;
//# sourceMappingURL=chaos-failure-injector.d.ts.map