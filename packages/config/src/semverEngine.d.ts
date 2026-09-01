export type ReleaseBumpType = "MAJOR" | "MINOR" | "PATCH" | "NONE";
export interface ParsedCommit {
    type: string;
    scope?: string;
    isBreaking: boolean;
    subject: string;
    body?: string;
    rawMessage: string;
    category: "Breaking Changes" | "Features" | "Bug Fixes" | "Performance" | "Observability & Ops" | "Security" | "Refactoring" | "Documentation" | "Other";
}
export interface SemVerComponents {
    major: number;
    minor: number;
    patch: number;
    prerelease?: string;
    build?: string;
}
export declare function parseSemVer(versionStr: string): SemVerComponents;
export declare function isValidSemVer(versionStr: string): boolean;
export declare function formatSemVer(components: SemVerComponents): string;
export declare function compareSemVer(v1: string, v2: string): number;
export declare function categorizeCommit(type: string, isBreaking: boolean): ParsedCommit["category"];
export declare function parseConventionalCommit(message: string): ParsedCommit;
export declare function determineBumpFromCommits(commitMessages: string[]): ReleaseBumpType;
export declare function calculateNextVersion(currentVersion: string, commitMessages: string[], options?: {
    forceBump?: ReleaseBumpType;
    prereleaseTag?: string;
}): string;
export declare function generateFormattedReleaseNotes(version: string, baselineTag: string, commits: ParsedCommit[]): string;
//# sourceMappingURL=semverEngine.d.ts.map