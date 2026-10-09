import { describe, expect, it } from "vitest";
import { isPendingUnreleasedCandidate } from "../../scripts/release/pending-unreleased-candidate";

const pending = {
  packageVersion: "2.13.0",
  manifestVersion: "2.13.0",
  manifestTag: "v2.13.0",
  certification: "PENDING",
  latestStableVersion: "2.12.5",
  candidateTagExists: false,
};

describe("pending release candidate convergence", () => {
  it("recognizes the exact newer version in a pending manifest after ancestry ages out", () => {
    expect(isPendingUnreleasedCandidate(pending)).toBe(true);
  });

  it("does not redispatch a version that already has a release tag", () => {
    expect(isPendingUnreleasedCandidate({ ...pending, candidateTagExists: true })).toBe(false);
  });

  it("does not redispatch a candidate whose manifest is no longer pending", () => {
    expect(isPendingUnreleasedCandidate({ ...pending, certification: "PASS" })).toBe(false);
  });

  it("requires the package and manifest versions and tag to match exactly", () => {
    expect(isPendingUnreleasedCandidate({ ...pending, manifestVersion: "2.12.5" })).toBe(false);
    expect(isPendingUnreleasedCandidate({ ...pending, manifestTag: "v2.12.5" })).toBe(false);
  });

  it("does not roll back or re-release a candidate older than the latest stable tag", () => {
    expect(isPendingUnreleasedCandidate({
      ...pending,
      packageVersion: "2.12.0",
      manifestVersion: "2.12.0",
      manifestTag: "v2.12.0"
    })).toBe(false);
  });
});
