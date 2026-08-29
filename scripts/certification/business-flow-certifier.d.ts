export interface BusinessFlowResult {
    passed: boolean;
    details: string;
    stepsCompleted: number;
    totalSteps: number;
}
export declare function runBusinessFlowJourneys(): Promise<{
    allPassed: boolean;
    journeys: Record<string, BusinessFlowResult>;
}>;
//# sourceMappingURL=business-flow-certifier.d.ts.map