import { describe, it, expect } from "vitest";
import {
  parseSemVer,
  isValidSemVer,
  compareSemVer,
  parseConventionalCommit,
  determineBumpFromCommits,
  calculateNextVersion,
} from "../../packages/config/src/semverEngine.js";

describe("Semantic Versioning (SemVer 2.0.0) Engine", () => {
  describe("1. SemVer Validation & Parsing", () => {
    it("parses standard SemVer strings correctly", () => {
      const v = parseSemVer("2.0.0");
      expect(v.major).toBe(2);
      expect(v.minor).toBe(0);
      expect(v.patch).toBe(0);
      expect(v.prerelease).toBeUndefined();
    });

    it("parses SemVer with prerelease and build metadata", () => {
      const v = parseSemVer("2.1.0-rc.1+build.123");
      expect(v.major).toBe(2);
      expect(v.minor).toBe(1);
      expect(v.patch).toBe(0);
      expect(v.prerelease).toBe("rc.1");
      expect(v.build).toBe("build.123");
    });

    it("validates valid and invalid SemVer strings", () => {
      expect(isValidSemVer("2.0.0")).toBe(true);
      expect(isValidSemVer("v2.0.1")).toBe(true);
      expect(isValidSemVer("2.1.0-beta.2")).toBe(true);
      expect(isValidSemVer("2.0")).toBe(false);
      expect(isValidSemVer("alpha")).toBe(false);
      expect(isValidSemVer("01.2.3")).toBe(false);
      expect(isValidSemVer("1.02.3")).toBe(false);
      expect(isValidSemVer("1.2.03")).toBe(false);
    });

    it("compares versions accurately", () => {
      expect(compareSemVer("2.0.0", "2.0.1")).toBeLessThan(0);
      expect(compareSemVer("2.1.0", "2.0.9")).toBeGreaterThan(0);
      expect(compareSemVer("3.0.0", "2.9.9")).toBeGreaterThan(0);
      expect(compareSemVer("2.0.0", "2.0.0")).toBe(0);
      expect(compareSemVer("2.0.0", "2.0.0-rc.1")).toBeGreaterThan(0);
    });

    it("uses SemVer numeric prerelease ordering rather than lexical ordering", () => {
      expect(compareSemVer("1.0.0-alpha.2", "1.0.0-alpha.10")).toBeLessThan(0);
      expect(compareSemVer("1.0.0-1", "1.0.0-alpha")).toBeLessThan(0);
      expect(compareSemVer("1.0.0-alpha.1", "1.0.0-alpha.beta")).toBeLessThan(0);
      expect(compareSemVer("1.0.0-alpha", "1.0.0-alpha.1")).toBeLessThan(0);
      expect(compareSemVer("1.0.0-alpha.1", "1.0.0")).toBeLessThan(0);
    });
  });

  describe("2. Conventional Commit Parsing", () => {
    it("parses standard feat, fix, perf commits", () => {
      const feat = parseConventionalCommit("feat(inventory): add automatic stock reconciliation");
      expect(feat.type).toBe("feat");
      expect(feat.scope).toBe("inventory");
      expect(feat.isBreaking).toBe(false);
      expect(feat.subject).toBe("add automatic stock reconciliation");

      const fix = parseConventionalCommit("fix(sync): preserve adjustment during delta replay");
      expect(fix.type).toBe("fix");
      expect(fix.scope).toBe("sync");
      expect(fix.isBreaking).toBe(false);
    });

    it("detects breaking changes via '!' header or BREAKING CHANGE footer", () => {
      const breakingHeader = parseConventionalCommit("feat(sync)!: rewrite synchronization protocol");
      expect(breakingHeader.isBreaking).toBe(true);

      const breakingFooter = parseConventionalCommit(
        "refactor(database): drop legacy stock column\n\nBREAKING CHANGE: column 'legacy_qty' has been removed."
      );
      expect(breakingFooter.isBreaking).toBe(true);
    });
  });

  describe("3. SemVer Bump Calculation", () => {
    it("calculates PATCH bump for fixes, perf, refactor, and security", () => {
      const commits = [
        "fix(pos): fix cart calculation rounding",
        "perf(api): cache catalog responses",
        "docs(readme): update deployment instructions",
      ];
      expect(determineBumpFromCommits(commits)).toBe("PATCH");
      expect(calculateNextVersion("2.0.0", commits)).toBe("2.0.1");
    });

    it("calculates MINOR bump when at least one feature is present", () => {
      const commits = [
        "fix(pos): fix cart calculation rounding",
        "feat(reports): add multi-branch inventory report",
      ];
      expect(determineBumpFromCommits(commits)).toBe("MINOR");
      expect(calculateNextVersion("2.0.0", commits)).toBe("2.1.0");
    });

    it("calculates MAJOR bump when breaking change is present", () => {
      const commits = [
        "feat(auth): add OAuth2 provider",
        "feat(api)!: migrate to GraphQL endpoint only",
      ];
      expect(determineBumpFromCommits(commits)).toBe("MAJOR");
      expect(calculateNextVersion("2.0.0", commits)).toBe("3.0.0");
    });

    it("supports prerelease identifiers", () => {
      const commits = ["feat(sync): add conflict resolution"];
      const next = calculateNextVersion("2.0.0", commits, { prereleaseTag: "rc.1" });
      expect(next).toBe("2.1.0-rc.1");
    });
  });
});
