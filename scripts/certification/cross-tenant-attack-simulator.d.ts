export interface AttackSimulationResult {
    attackVector: string;
    targetDomain: string;
    attemptedAction: string;
    rejected: boolean;
    httpStatus: number;
    reason: string;
}
export declare function runCrossTenantAttackSimulation(): {
    overallPassed: boolean;
    totalAttacksSimulated: number;
    totalAttacksBlocked: number;
    results: AttackSimulationResult[];
};
//# sourceMappingURL=cross-tenant-attack-simulator.d.ts.map