import { ParsedCommit } from "../../packages/config/src/semverEngine.js";
export interface ExtendedChangelogSection {
    version: string;
    releaseDate: string;
    features: ParsedCommit[];
    improvements: ParsedCommit[];
    bugFixes: ParsedCommit[];
    securityUpdates: ParsedCommit[];
    performanceEnhancements: ParsedCommit[];
    databaseChanges: ParsedCommit[];
    apiChanges: ParsedCommit[];
    uiUxChanges: ParsedCommit[];
    breakingChanges: ParsedCommit[];
    migrationNotes: string[];
    contributors: string[];
}
export declare function getLatestGitTag(): string | null;
export declare function getRawCommitsSince(tag: string | null): Array<{
    hash: string;
    author: string;
    message: string;
}>;
export declare function categorizeExtendedCommits(version: string, rawCommits: Array<{
    hash: string;
    author: string;
    message: string;
}>): ExtendedChangelogSection;
export declare function formatChangelogSection(sec: ExtendedChangelogSection): string;
export declare function updateChangelog(version: string): string;
//# sourceMappingURL=generate-changelog.d.ts.map