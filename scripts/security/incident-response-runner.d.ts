export interface IRDrillResult {
    scenarioId: string;
    title: string;
    participants: string[];
    detectionTimeSeconds: number;
    containmentTimeSeconds: number;
    decisionsRecorded: string[];
    gapsIdentified: string[];
    correctiveActions: string[];
    retestStatus: "PASSED" | "FAILED";
}
export declare function runIncidentResponseTabletopDrills(): {
    overallPassed: boolean;
    playbooksCount: number;
    simulatedDrillsCount: number;
    drills: IRDrillResult[];
};
//# sourceMappingURL=incident-response-runner.d.ts.map