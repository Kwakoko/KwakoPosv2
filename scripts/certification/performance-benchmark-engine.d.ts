import { SubsystemPerformanceMetric } from "@kwakopos2/contracts";
export declare function runPerformanceBenchmarkSuite(): Promise<{
    allPassed: boolean;
    score: number;
    baselineMetrics: SubsystemPerformanceMetric[];
    workload10x: SubsystemPerformanceMetric[];
    workload50x: SubsystemPerformanceMetric[];
    workload100x: SubsystemPerformanceMetric[];
}>;
//# sourceMappingURL=performance-benchmark-engine.d.ts.map