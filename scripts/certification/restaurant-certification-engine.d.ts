export declare function evaluateRestaurantCertification(): Promise<{
    allPassed: boolean;
    overallScore: number;
    evaluations: Array<{
        pillarId: number;
        pillarName: string;
        passed: boolean;
        details: string;
    }>;
}>;
//# sourceMappingURL=restaurant-certification-engine.d.ts.map