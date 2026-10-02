import { FullSystemCertificationEngine } from "@kwakopos2/domain";
export interface FullSystemCertificationPillar {
    id: string;
    description: string;
    test: (engine: FullSystemCertificationEngine) => boolean | Promise<boolean>;
}
export declare const FULL_SYSTEM_CERTIFICATION_PILLARS: FullSystemCertificationPillar[];
export declare function runFullSystemCertificationEngine(scope?: string, version?: string): Promise<{
    passed: boolean;
    businessJourneys: {
        journeyName: string;
        passed: boolean;
        details: string;
    }[];
    crossDomainProbes: {
        probeName: string;
        passed: boolean;
        details: string;
    }[];
    evidencePackage: {
        certificationId: string;
        certificationScore: number;
        overallStatus: string;
        timestamp: string;
        appVersion: string;
        gitSha: string;
        domainScorecard: Record<string, {
            status: "PASS" | "FAIL";
            details: string;
        }>;
    };
}>;
//# sourceMappingURL=full-system-certification-engine.d.ts.map